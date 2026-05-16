import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import matter from 'gray-matter';

type Frontmatter = Record<string, unknown>;
type ContentType = 'post' | 'story' | 'gallery';

type ChangedFile = {
  status: string;
  path: string;
};

type MarkdownPlan = {
  file: string;
  contentType?: ContentType;
  route?: string;
  jsonPath?: string;
  mediaReferences: MediaRewrite[];
};

type MediaRewrite = {
  reference: string;
  canonicalKey: string;
  localPath?: string;
  exists: boolean;
};

type Issue = {
  code: string;
  file: string;
  message: string;
};

const execFileAsync = promisify(execFile);
const root = process.cwd();
const reportPath = path.join(root, '.tmp', 'publish-plan-report.json');
const canonicalMediaKey = /^\d{4}\/\d{2}\/\d{2}\/[^/]+\.[A-Za-z0-9]+$/;
const externalReference = /^[a-z][a-z0-9+.-]*:/i;

async function main() {
  const changedFiles = await gitChangedFiles();
  const markdownFiles = changedFiles
    .map((file) => file.path)
    .filter((file) => /^_posts\/.+\.md$/i.test(file))
    .sort();
  const changedLocalMedia = changedFiles
    .map((file) => file.path)
    .filter((file) => isLikelyMediaFile(file))
    .sort();
  const markdownPlans: MarkdownPlan[] = [];
  const issues: Issue[] = [];

  for (const file of markdownFiles) {
    markdownPlans.push(await planMarkdown(file, issues));
  }

  issues.push(...collisionIssues(markdownPlans));

  const affectedJson = uniqueSorted(markdownPlans.flatMap((plan) => [plan.jsonPath].filter(Boolean) as string[]));
  const affectedIndexes = affectedIndexPaths(markdownPlans);
  const plannedMediaUploads = markdownPlans.flatMap((plan) =>
    plan.mediaReferences
      .filter((reference) => !isCanonicalReference(reference.reference))
      .map((reference) => ({
        contentFile: plan.file,
        reference: reference.reference,
        canonicalKey: reference.canonicalKey,
        localPath: reference.localPath,
        exists: reference.exists,
      })),
  );

  const report = {
    generatedAt: new Date().toISOString(),
    changedFiles,
    changedMarkdown: markdownFiles,
    changedLocalMedia,
    affectedJson,
    affectedIndexes,
    plannedMediaUploads,
    markdownRewrites: plannedMediaUploads.map((upload) => ({
      file: upload.contentFile,
      from: upload.reference,
      to: upload.canonicalKey,
    })),
    issues,
  };

  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  printReport(report);

  if (issues.length > 0) {
    process.exitCode = 1;
  }
}

async function gitChangedFiles() {
  const { stdout } = await execFileAsync('git', ['status', '--short', '--porcelain=v1'], { cwd: root });

  return stdout
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line): ChangedFile => {
      const status = line.slice(0, 2);
      const rawPath = line.slice(3);
      const renamedPath = rawPath.includes(' -> ') ? rawPath.split(' -> ').at(-1)! : rawPath;

      return {
        status,
        path: renamedPath.replaceAll('\\', '/'),
      };
    });
}

async function planMarkdown(file: string, issues: Issue[]): Promise<MarkdownPlan> {
  const fullPath = path.join(root, file);
  const raw = await fs.readFile(fullPath, 'utf8');
  const parsed = matter(raw);
  const contentType = contentTypeFromFrontmatter(parsed.data);
  const parts = dateParts(parsed.data.date);
  const slug = textValue(parsed.data.slug) || slugFromPostFilename(path.basename(file, '.md'));
  const route = contentType && parts ? routeFor(contentType, parts, slug) : undefined;
  const jsonPath = route ? `${route.replace(/^\//, '')}.json` : undefined;

  if (!contentType) {
    issues.push({
      code: 'content.invalidType',
      file,
      message: 'Cannot plan publish for content without content_type post, story, or gallery.',
    });
  }

  if (!parts) {
    issues.push({
      code: 'content.invalidDate',
      file,
      message: 'Cannot plan canonical media keys without a parseable date.',
    });
  }

  const mediaReferences = parts
    ? mediaRefs(parsed.data, parsed.content).map((reference) => planMediaReference(file, reference, parts, issues))
    : [];

  return {
    file,
    contentType,
    route,
    jsonPath,
    mediaReferences,
  };
}

function planMediaReference(file: string, reference: string, parts: DateParts, issues: Issue[]): MediaRewrite {
  if (isCanonicalReference(reference)) {
    return {
      reference,
      canonicalKey: reference,
      exists: true,
    };
  }

  const canonicalKey = `${parts.year}/${parts.month}/${parts.day}/${path.basename(reference)}`;

  if (externalReference.test(reference) || reference.startsWith('/')) {
    issues.push({
      code: 'media.unpublishableReference',
      file,
      message: `Media reference "${reference}" is not a local draft file or canonical media key.`,
    });

    return {
      reference,
      canonicalKey,
      exists: false,
    };
  }

  const localPath = path.resolve(root, path.dirname(file), reference);
  const exists = fileExists(localPath);

  if (!exists) {
    issues.push({
      code: 'media.missingLocalFile',
      file,
      message: `Local media reference "${reference}" was not found at ${path.relative(root, localPath)}.`,
    });
  }

  return {
    reference,
    canonicalKey,
    localPath: path.relative(root, localPath).replaceAll(path.sep, '/'),
    exists,
  };
}

function collisionIssues(markdownPlans: MarkdownPlan[]) {
  const seen = new Map<string, MediaRewrite>();
  const issues: Issue[] = [];

  for (const plan of markdownPlans) {
    for (const reference of plan.mediaReferences) {
      if (isCanonicalReference(reference.reference)) {
        continue;
      }

      const existing = seen.get(reference.canonicalKey);

      if (existing && existing.localPath !== reference.localPath) {
        issues.push({
          code: 'media.canonicalCollision',
          file: plan.file,
          message: `Multiple local media files would publish to ${reference.canonicalKey}.`,
        });
      }

      seen.set(reference.canonicalKey, reference);
    }
  }

  return issues;
}

function affectedIndexPaths(markdownPlans: MarkdownPlan[]) {
  if (markdownPlans.length === 0) {
    return [];
  }

  const indexes = new Set(['home.json', 'site.json', 'taxonomy.json']);

  for (const plan of markdownPlans) {
    if (plan.contentType === 'post') {
      indexes.add('posts/index.json');
    }

    if (plan.contentType === 'story') {
      indexes.add('stories/index.json');
    }

    if (plan.contentType === 'gallery') {
      indexes.add('galleries/index.json');
    }

    if (plan.mediaReferences.some((reference) => !isCanonicalReference(reference.reference))) {
      indexes.add('media/index.json');
      indexes.add('images/index.json');
    }
  }

  return [...indexes].sort((a, b) => a.localeCompare(b));
}

function mediaRefs(data: Frontmatter, content: string) {
  const refs = new Set<string>();
  const cover = textValue(data.cover_image || data.coverImage || data.coverImageId);

  if (cover) {
    refs.add(cover);
  }

  for (const value of [data.images, data.imageIds, data.image_ids]) {
    if (typeof value === 'string') {
      for (const item of value.split(',')) {
        const ref = item.trim();

        if (ref) {
          refs.add(ref);
        }
      }
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === 'string') {
          refs.add(item);
        } else if (item && typeof item === 'object' && !(item instanceof Date)) {
          const ref = textValue((item as Frontmatter).id);

          if (ref) {
            refs.add(ref);
          }
        }
      }
    }
  }

  for (const match of content.matchAll(/!\[[^\]]*]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    refs.add(match[1].trim());
  }

  return [...refs].filter(Boolean);
}

type DateParts = {
  year: string;
  month: string;
  day: string;
};

function dateParts(value: unknown): DateParts | undefined {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) {
    return {
      year: String(value.getFullYear()).padStart(4, '0'),
      month: String(value.getMonth() + 1).padStart(2, '0'),
      day: String(value.getDate()).padStart(2, '0'),
    };
  }

  const text = textValue(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);

  if (!match) {
    return undefined;
  }

  return {
    year: match[1],
    month: match[2],
    day: match[3],
  };
}

function contentTypeFromFrontmatter(data: Frontmatter): ContentType | undefined {
  const value = textValue(data.content_type || data.contentType || data.type).toLowerCase();

  if (value === 'post' || value === 'story' || value === 'gallery') {
    return value;
  }

  return undefined;
}

function routeFor(contentType: ContentType, parts: DateParts, slug: string) {
  const folder = contentType === 'post' ? 'posts' : `${contentType}s`;
  return `/${folder}/${parts.year}/${parts.month}/${parts.day}/${slug}`;
}

function isCanonicalReference(value: string) {
  return canonicalMediaKey.test(value);
}

function isLikelyMediaFile(file: string) {
  return /\.(avif|gif|jpe?g|m4v|mov|mp4|png|webp)$/i.test(file);
}

function slugFromPostFilename(filename: string) {
  return filename.replace(/^\d{4}-\d{2}-\d{2}-/, '');
}

function uniqueSorted(values: string[]) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function textValue(value: unknown) {
  if (value === undefined || value === null) {
    return '';
  }

  if (value instanceof Date && !Number.isNaN(value.valueOf())) {
    return value.toISOString();
  }

  return String(value).trim();
}

function fileExists(file: string) {
  return existsSync(file);
}

function printReport(report: {
  changedFiles: ChangedFile[];
  changedMarkdown: string[];
  changedLocalMedia: string[];
  affectedJson: string[];
  affectedIndexes: string[];
  plannedMediaUploads: Array<{ contentFile: string; reference: string; canonicalKey: string; exists: boolean }>;
  markdownRewrites: Array<{ file: string; from: string; to: string }>;
  issues: Issue[];
}) {
  console.log('Publish plan');
  console.log(`Changed files: ${report.changedFiles.length}`);
  console.log(`Changed content Markdown: ${report.changedMarkdown.length}`);
  console.log(`Changed local media files: ${report.changedLocalMedia.length}`);
  console.log(`Affected content JSON: ${report.affectedJson.length}`);
  console.log(`Affected indexes: ${report.affectedIndexes.length}`);
  console.log(`Planned media uploads: ${report.plannedMediaUploads.length}`);
  console.log(`Markdown rewrites: ${report.markdownRewrites.length}`);
  console.log(`Issues: ${report.issues.length}`);
  console.log(`Report: ${path.relative(root, reportPath)}`);

  printList('Changed content Markdown', report.changedMarkdown);
  printList('Changed local media files', report.changedLocalMedia);
  printList('Affected content JSON', report.affectedJson);
  printList('Affected indexes', report.affectedIndexes);
  printList(
    'Planned media uploads',
    report.plannedMediaUploads.map((upload) => `${upload.reference} -> ${upload.canonicalKey}`),
  );

  if (report.issues.length > 0) {
    printList(
      'Issues',
      report.issues.map((issue) => `${issue.code} ${issue.file}: ${issue.message}`),
      20,
    );
  }
}

function printList(label: string, values: string[], max = 12) {
  if (values.length === 0) {
    return;
  }

  console.log('');
  console.log(`${label}:`);

  for (const value of values.slice(0, max)) {
    console.log(`- ${value}`);
  }

  if (values.length > max) {
    console.log(`...and ${(values.length - max).toLocaleString()} more.`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
