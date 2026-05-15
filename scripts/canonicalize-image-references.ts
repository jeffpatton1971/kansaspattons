import fs from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';

type Frontmatter = Record<string, unknown>;

type FrontmatterRange = {
  before: string;
  yaml: string;
  content: string;
  newline: string;
};

type MarkdownSource = {
  file: string;
  fullPath: string;
  raw: string;
  range: FrontmatterRange;
  data: Frontmatter;
  content: string;
};

type ImageMapping = {
  oldId: string;
  canonicalId: string;
  filename: string;
  file: string;
};

type MissingReference = {
  file: string;
  field: string;
  value: string;
};

type Collision = {
  canonicalId: string;
  items: ImageMapping[];
};

const root = process.cwd();
const postsRoot = path.join(root, '_posts');
const galleryRoot = path.join(root, '_gallery');
const writeChanges = process.argv.includes('--write');
const reportPath = path.resolve(root, argValue('--report') || '.tmp/image-canonicalization-report.json');

async function main() {
  const imageSources = await readMarkdownDirectory(galleryRoot);
  const postSources = await readMarkdownDirectory(postsRoot);
  const mappings = imageSources.flatMap(imageMapping);
  const collisions = collisionReport(mappings);
  const map = new Map(mappings.map((mapping) => [mapping.oldId, mapping.canonicalId]));
  const canonicalIds = new Set(mappings.map((mapping) => mapping.canonicalId));
  const pendingWrites = new Map<string, string>();
  const missingReferences: MissingReference[] = [];
  let coverReferencesChanged = 0;
  let imageReferencesChanged = 0;

  for (const source of postSources) {
    let yaml = source.range.yaml;
    const coverResult = canonicalizeCoverFields(source, yaml, map, canonicalIds, missingReferences);
    yaml = coverResult.yaml;
    coverReferencesChanged += coverResult.changed;

    const imageResult = canonicalizeImageFields(source, yaml, map, canonicalIds, missingReferences);
    yaml = imageResult.yaml;
    imageReferencesChanged += imageResult.changed;

    const next = composeRaw(source.range.before, yaml, source.content, source.range.newline);

    if (next !== source.raw) {
      pendingWrites.set(source.fullPath, next);
    }
  }

  validatePendingMarkdown(pendingWrites);

  const report = {
    generatedAt: new Date().toISOString(),
    write: writeChanges,
    imagesScanned: imageSources.length,
    postsScanned: postSources.length,
    mappedImages: mappings.length,
    canonicalCollisions: collisions.length,
    filesChanged: pendingWrites.size,
    coverReferencesChanged,
    imageReferencesChanged,
    missingReferences,
    collisions,
    changedFiles: [...pendingWrites.keys()].map((file) => path.relative(root, file)),
  };

  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  if (writeChanges) {
    if (collisions.length > 0) {
      throw new Error('Refusing to write canonical image references while canonical ID collisions exist.');
    }

    await flushWrites(pendingWrites);
  }

  printSummary(report);
}

async function readMarkdownDirectory(directory: string) {
  const files = (await fs.readdir(directory)).filter((file) => file.endsWith('.md')).sort();
  const sources: MarkdownSource[] = [];

  for (const file of files) {
    const fullPath = path.join(directory, file);
    const raw = await fs.readFile(fullPath, 'utf8');
    const range = frontmatterRange(raw);

    if (!range) {
      console.warn(`Skipping ${path.relative(root, fullPath)}: missing frontmatter.`);
      continue;
    }

    const parsed = matter(raw);
    sources.push({
      file,
      fullPath,
      raw,
      range,
      data: parsed.data,
      content: parsed.content,
    });
  }

  return sources;
}

function imageMapping(source: MarkdownSource): ImageMapping[] {
  const parts = partsFromFrontmatter(source.data) ?? partsFromFilename(source.file);

  if (!parts) {
    console.warn(`Skipping ${path.relative(root, source.fullPath)}: missing image date parts.`);
    return [];
  }

  const oldId = textValue(source.data.id) || path.basename(source.file, '.md');
  const filename = imageFilename(source.data, oldId);

  if (!filename) {
    console.warn(`Skipping ${path.relative(root, source.fullPath)}: missing image filename.`);
    return [];
  }

  return [
    {
      oldId,
      canonicalId: canonicalImageId(parts, filename),
      filename,
      file: path.relative(root, source.fullPath),
    },
  ];
}

function canonicalizeCoverFields(
  source: MarkdownSource,
  yaml: string,
  map: Map<string, string>,
  canonicalIds: Set<string>,
  missingReferences: MissingReference[],
) {
  let nextYaml = yaml;
  let changed = 0;

  for (const key of ['cover_image', 'coverImage', 'coverImageId']) {
    const value = textValue(source.data[key]);

    if (!value) {
      continue;
    }

    const canonical = canonicalReference(value, map, canonicalIds);

    if (canonical === value) {
      continue;
    }

    if (!canonical) {
      missingReferences.push({
        file: path.relative(root, source.fullPath),
        field: key,
        value,
      });
      continue;
    }

    nextYaml = setField(nextYaml, key, formatScalar(canonical));
    changed += 1;
  }

  return { yaml: nextYaml, changed };
}

function canonicalizeImageFields(
  source: MarkdownSource,
  yaml: string,
  map: Map<string, string>,
  canonicalIds: Set<string>,
  missingReferences: MissingReference[],
) {
  let nextYaml = yaml;
  let changed = 0;

  for (const key of ['images', 'image_ids', 'imageIds']) {
    const value = source.data[key];

    if (value === undefined) {
      continue;
    }

    const result = canonicalImageFieldValue(source, key, value, map, canonicalIds, missingReferences);

    if (!result.changed) {
      continue;
    }

    nextYaml = setField(nextYaml, key, result.yamlValue);
    changed += result.changed;
  }

  return { yaml: nextYaml, changed };
}

function canonicalImageFieldValue(
  source: MarkdownSource,
  field: string,
  value: unknown,
  map: Map<string, string>,
  canonicalIds: Set<string>,
  missingReferences: MissingReference[],
) {
  if (typeof value === 'string') {
    const current = value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    const next = current.map((item) => canonicalReference(item, map, canonicalIds) || item);
    recordMissing(source, field, current, next, map, canonicalIds, missingReferences);

    return {
      changed: countChanged(current, next),
      yamlValue: next.map(formatScalar).join(', '),
    };
  }

  if (!Array.isArray(value)) {
    return { changed: 0, yamlValue: '' };
  }

  const currentIds = value.map(imageReferenceId).filter(Boolean);
  const nextItems = value.map((item) => {
    const currentId = imageReferenceId(item);
    const canonicalId = currentId ? canonicalReference(currentId, map, canonicalIds) : '';

    if (currentId && !canonicalId && !canonicalIds.has(currentId)) {
      missingReferences.push({
        file: path.relative(root, source.fullPath),
        field,
        value: currentId,
      });
    }

    if (!item || typeof item !== 'object' || item instanceof Date) {
      return {
        id: canonicalId || currentId,
      };
    }

    const data = item as Frontmatter;
    return {
      id: canonicalId || currentId,
      caption: data.caption,
      alt: data.alt,
    };
  });
  const nextIds = nextItems.map((item) => item.id).filter(Boolean);

  return {
    changed: countChanged(currentIds, nextIds),
    yamlValue: formatImageReferences(nextItems),
  };
}

function recordMissing(
  source: MarkdownSource,
  field: string,
  current: string[],
  next: string[],
  map: Map<string, string>,
  canonicalIds: Set<string>,
  missingReferences: MissingReference[],
) {
  current.forEach((value, index) => {
    if (next[index] !== value || map.has(value) || canonicalIds.has(value)) {
      return;
    }

    missingReferences.push({
      file: path.relative(root, source.fullPath),
      field,
      value,
    });
  });
}

function imageReferenceId(value: unknown) {
  if (typeof value === 'string') {
    return value.trim();
  }

  if (!value || typeof value !== 'object' || value instanceof Date) {
    return '';
  }

  const data = value as Frontmatter;
  return textValue(data.id || data.file || data.filename);
}

function canonicalReference(value: string, map: Map<string, string>, canonicalIds: Set<string>) {
  if (canonicalIds.has(value)) {
    return value;
  }

  return map.get(value);
}

function formatImageReferences(items: Array<{ id: string; caption?: unknown; alt?: unknown }>) {
  return `\n${items
    .filter((item) => item.id)
    .map((item) => {
      const lines = [`  - id: ${formatScalar(item.id)}`];
      lines.push(`    caption:${formatOptionalScalar(item.caption)}`);
      lines.push(`    alt:${formatOptionalScalar(item.alt)}`);
      return lines.join('\n');
    })
    .join('\n')}`;
}

function formatOptionalScalar(value: unknown) {
  const text = textValue(value);
  return text ? ` ${formatScalar(text)}` : '';
}

function collisionReport(mappings: ImageMapping[]): Collision[] {
  const byCanonicalId = new Map<string, ImageMapping[]>();

  for (const mapping of mappings) {
    if (!byCanonicalId.has(mapping.canonicalId)) {
      byCanonicalId.set(mapping.canonicalId, []);
    }

    byCanonicalId.get(mapping.canonicalId)!.push(mapping);
  }

  return [...byCanonicalId.entries()]
    .filter(([, items]) => items.length > 1)
    .map(([canonicalId, items]) => ({ canonicalId, items }));
}

function validatePendingMarkdown(pendingWrites: Map<string, string>) {
  for (const [fullPath, contents] of pendingWrites) {
    try {
      matter(contents);
    } catch (error) {
      throw new Error(
        `Generated invalid frontmatter for ${path.relative(root, fullPath)}: ${(error as Error).message}`,
      );
    }
  }
}

async function flushWrites(pendingWrites: Map<string, string>) {
  for (const [fullPath, contents] of pendingWrites) {
    await fs.writeFile(fullPath, contents, 'utf8');
  }
}

function printSummary(report: {
  write: boolean;
  imagesScanned: number;
  postsScanned: number;
  mappedImages: number;
  canonicalCollisions: number;
  filesChanged: number;
  coverReferencesChanged: number;
  imageReferencesChanged: number;
  missingReferences: MissingReference[];
}) {
  const action = report.write ? 'Canonicalized' : 'Would canonicalize';
  console.log(`${action} image references.`);
  console.log(`Images scanned: ${report.imagesScanned.toLocaleString()}`);
  console.log(`Posts scanned: ${report.postsScanned.toLocaleString()}`);
  console.log(`Mapped images: ${report.mappedImages.toLocaleString()}`);
  console.log(`Canonical collisions: ${report.canonicalCollisions.toLocaleString()}`);
  console.log(`Files changed: ${report.filesChanged.toLocaleString()}`);
  console.log(`Cover references changed: ${report.coverReferencesChanged.toLocaleString()}`);
  console.log(`Image references changed: ${report.imageReferencesChanged.toLocaleString()}`);
  console.log(`Missing references: ${report.missingReferences.length.toLocaleString()}`);
  console.log(`Report: ${path.relative(root, reportPath)}`);

  if (report.missingReferences.length > 0) {
    console.log('\nFirst missing references:');

    for (const item of report.missingReferences.slice(0, 10)) {
      console.log(`- ${item.file} ${item.field}: ${item.value}`);
    }
  }

  if (!writeChanges) {
    console.log('\nDry run only. Re-run with --write to update Markdown files.');
  }
}

function frontmatterRange(raw: string): FrontmatterRange | undefined {
  const firstLineEnd = raw.indexOf('\n');
  const newline = firstLineEnd !== -1 && raw.slice(0, firstLineEnd + 1).endsWith('\r\n') ? '\r\n' : '\n';
  const match = /^(\uFEFF?)---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);

  if (!match) {
    return undefined;
  }

  return {
    before: match[1],
    yaml: match[2],
    content: match[3],
    newline,
  };
}

function composeRaw(before: string, yaml: string, content: string, newline: string) {
  const normalizedYaml = yaml.replace(/\r?\n/g, newline).trimEnd();
  const normalizedContent = content.trim().replace(/\r?\n/g, newline);
  return `${before}---${newline}${normalizedYaml}${newline}---${newline}${normalizedContent}${newline}`;
}

function fieldBlock(yaml: string, key: string): [number, number] | undefined {
  const lines = yaml.split(/\r?\n/);
  const start = lines.findIndex((line) => new RegExp(`^${escapeRegExp(key)}\\s*:`).test(line));

  if (start === -1) {
    return undefined;
  }

  let end = start + 1;

  while (end < lines.length && !/^[A-Za-z0-9_-]+\s*:/.test(lines[end])) {
    end += 1;
  }

  return [start, end];
}

function setField(yaml: string, key: string, value: string) {
  const lines = yaml.split(/\r?\n/);
  const fieldLines = `${key}:${value.startsWith('\n') ? '' : ' '}${value}`.split('\n');
  const existing = fieldBlock(yaml, key);

  if (existing) {
    lines.splice(existing[0], existing[1] - existing[0], ...fieldLines);
    return lines.join('\n');
  }

  lines.push(...fieldLines);
  return lines.join('\n');
}

function partsFromFilename(filename: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})-/.exec(filename);

  if (!match) {
    return undefined;
  }

  return {
    year: match[1],
    month: match[2],
    day: match[3],
  };
}

function partsFromFrontmatter(data: Frontmatter) {
  const year = numberText(data.year);
  const month = numberText(data.month);
  const day = numberText(data.day);

  if (year && month && day) {
    return { year, month, day };
  }

  const date = textValue(data.date) || textValue(data.taken_at);
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);

  if (!match) {
    return undefined;
  }

  return {
    year: match[1],
    month: match[2],
    day: match[3],
  };
}

function imageFilename(data: Frontmatter, fallbackId: string) {
  return filenameFromUrl(textValue(data.raw_url)) || textValue(data.source_filename) || filenameFromId(fallbackId);
}

function filenameFromUrl(value: string) {
  if (!value) {
    return '';
  }

  try {
    const url = new URL(value);
    const pathname = decodeURIComponent(url.pathname);
    return pathname.split('/').filter(Boolean).at(-1) ?? '';
  } catch {
    return value.split('/').filter(Boolean).at(-1) ?? '';
  }
}

function filenameFromId(value: string) {
  if (/\.[a-z0-9]{2,5}$/i.test(value)) {
    return value.split('/').at(-1) ?? value;
  }

  return '';
}

function canonicalImageId(parts: { year: string; month: string; day: string }, filename: string) {
  return `${parts.year}/${parts.month}/${parts.day}/${filename}`;
}

function countChanged(current: string[], next: string[]) {
  return current.reduce((total, value, index) => (value !== next[index] ? total + 1 : total), 0);
}

function numberText(value: unknown) {
  const text = textValue(value);

  if (!text) {
    return '';
  }

  if (/^\d{1,2}$/.test(text)) {
    return text.padStart(2, '0');
  }

  return text;
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

function formatScalar(value: string) {
  if (/^[A-Za-z_][A-Za-z0-9_-]*$/.test(value)) {
    return value;
  }

  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function argValue(name: string) {
  const prefix = `${name}=`;
  const arg = process.argv.slice(2).find((value) => value.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : undefined;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
