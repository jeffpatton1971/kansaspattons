import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';

type Frontmatter = Record<string, unknown>;

type BlobReference = {
  url: string;
  accountName: string;
  containerName: string;
  blobName: string;
  filename: string;
};

type ImageAssetPlan = {
  imageId: string;
  galleryFile: string;
  sourceType: string;
  year: string;
  month: string;
  day: string;
  filename: string;
  current: {
    rawUrl: string;
    thumbUrl: string;
  };
  target: {
    rawUrl: string;
    thumbUrl: string;
    rawBlobName: string;
    thumbBlobName: string;
  };
};

type CopyOperation = {
  imageId: string;
  galleryFile: string;
  kind: 'raw' | 'thumb';
  sourceUrl: string;
  sourceAccountName: string;
  sourceContainerName: string;
  sourceBlobName: string;
  targetUrl: string;
  targetAccountName: string;
  targetContainerName: string;
  targetBlobName: string;
  targetMatchesSource: boolean;
};

type Collision = {
  target: string;
  items: Array<{
    imageId: string;
    galleryFile: string;
    sourceUrl: string;
  }>;
};

const root = process.cwd();
const galleryRoot = path.join(root, '_gallery');
const args = new Set(process.argv.slice(2));
const writeManifest = args.has('--write-manifest');
const manifestPath = path.resolve(root, argValue('--manifest') || '.tmp/image-storage-migration-manifest.json');
const siteKey = cleanSiteKey(argValue('--site') || process.env.CONTENT_SITE_KEY || process.env.SITE_KEY || 'kansaspattons');
const targetContainerName =
  argValue('--container') || process.env.CONTENT_ASSET_CONTAINER || process.env.CONTENT_STORAGE_ASSET_CONTAINER || siteKey;
const targetAccountOverride =
  argValue('--account') || process.env.CONTENT_ASSET_STORAGE_ACCOUNT || process.env.CONTENT_STORAGE_ACCOUNT;

async function main() {
  const initialImagePlans = await imageAssetPlans();
  const sourceAccounts = uniqueStrings(initialImagePlans.map((plan) => blobReference(plan.current.rawUrl).accountName));
  const targetAccountName = targetAccountOverride || onlyValue(sourceAccounts, 'source storage account');
  const imagePlans = initialImagePlans.map((plan) => ({
    ...plan,
    target: {
      ...plan.target,
      rawUrl: blobUrl(targetAccountName, targetContainerName, plan.target.rawBlobName),
      thumbUrl: blobUrl(targetAccountName, targetContainerName, plan.target.thumbBlobName),
    },
  }));
  const copyOperations = imagePlans.flatMap((plan) => copyOperationsForImage(plan, targetAccountName));
  const targetCollisions = collisionReport(copyOperations, false);
  const targetCaseInsensitiveCollisions = collisionReport(copyOperations, true);
  const manifest = {
    generatedAt: new Date().toISOString(),
    siteKey,
    target: {
      accountName: targetAccountName,
      containerName: targetContainerName,
      baseUrl: `https://${targetAccountName}.blob.core.windows.net/${encodePath([targetContainerName])}/`,
      rawPrefix: 'images',
      thumbPrefix: 'thumbs',
    },
    counts: {
      images: imagePlans.length,
      copyOperations: copyOperations.length,
      rawOperations: copyOperations.filter((operation) => operation.kind === 'raw').length,
      thumbOperations: copyOperations.filter((operation) => operation.kind === 'thumb').length,
      targetMatchesSource: copyOperations.filter((operation) => operation.targetMatchesSource).length,
      targetCollisions: targetCollisions.length,
      targetCaseInsensitiveCollisions: targetCaseInsensitiveCollisions.length,
    },
    sourceSummary: sourceSummary(imagePlans),
    targetCollisions,
    targetCaseInsensitiveCollisions,
    images: imagePlans,
    copyOperations,
  };

  printSummary(manifest);

  if (writeManifest) {
    assertManifestPath(manifestPath);
    await mkdir(path.dirname(manifestPath), { recursive: true });
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    console.log(`\nWrote manifest: ${path.relative(root, manifestPath)}`);
    return;
  }

  console.log('\nDry run only. Re-run with --write-manifest to write the JSON manifest.');
}

async function imageAssetPlans(): Promise<ImageAssetPlan[]> {
  const files = (await readdir(galleryRoot)).filter((file) => file.endsWith('.md')).sort();
  const plans: ImageAssetPlan[] = [];

  for (const file of files) {
    const fullPath = path.join(galleryRoot, file);
    const parsed = matter(await readFile(fullPath, 'utf8'));
    const data = parsed.data as Frontmatter;
    const imageId = textValue(data.id) || path.basename(file, '.md');
    const rawUrl = requiredText(data.raw_url, `${file}: raw_url`);
    const thumbUrl = requiredText(data.thumb_url, `${file}: thumb_url`);
    const rawReference = blobReference(rawUrl);
    const parts = dateParts(data, file);
    const filename = rawReference.filename || requiredText(data.source_filename, `${file}: source_filename`);
    const rawBlobName = blobName('images', parts, filename);
    const thumbBlobName = blobName('thumbs', parts, filename);
    const targetRawUrl = blobUrl(rawReference.accountName, targetContainerName, rawBlobName);
    const targetThumbUrl = blobUrl(rawReference.accountName, targetContainerName, thumbBlobName);

    plans.push({
      imageId,
      galleryFile: file,
      sourceType: imageSourceType(data),
      ...parts,
      filename,
      current: {
        rawUrl,
        thumbUrl,
      },
      target: {
        rawUrl: targetRawUrl,
        thumbUrl: targetThumbUrl,
        rawBlobName,
        thumbBlobName,
      },
    });
  }

  validateImagePlanCollisions(plans);
  return plans;
}

function copyOperationsForImage(plan: ImageAssetPlan, targetAccountName: string): CopyOperation[] {
  const rawSource = blobReference(plan.current.rawUrl);
  const thumbSource = blobReference(plan.current.thumbUrl);
  const rawTargetUrl = blobUrl(targetAccountName, targetContainerName, plan.target.rawBlobName);
  const thumbTargetUrl = blobUrl(targetAccountName, targetContainerName, plan.target.thumbBlobName);

  return [
    {
      imageId: plan.imageId,
      galleryFile: plan.galleryFile,
      kind: 'raw',
      sourceUrl: plan.current.rawUrl,
      sourceAccountName: rawSource.accountName,
      sourceContainerName: rawSource.containerName,
      sourceBlobName: rawSource.blobName,
      targetUrl: rawTargetUrl,
      targetAccountName,
      targetContainerName,
      targetBlobName: plan.target.rawBlobName,
      targetMatchesSource: targetMatchesSource(rawSource, targetAccountName, plan.target.rawBlobName),
    },
    {
      imageId: plan.imageId,
      galleryFile: plan.galleryFile,
      kind: 'thumb',
      sourceUrl: plan.current.thumbUrl,
      sourceAccountName: thumbSource.accountName,
      sourceContainerName: thumbSource.containerName,
      sourceBlobName: thumbSource.blobName,
      targetUrl: thumbTargetUrl,
      targetAccountName,
      targetContainerName,
      targetBlobName: plan.target.thumbBlobName,
      targetMatchesSource: targetMatchesSource(thumbSource, targetAccountName, plan.target.thumbBlobName),
    },
  ];
}

function validateImagePlanCollisions(plans: ImageAssetPlan[]) {
  const rawCollisions = collisions(
    plans.map((plan) => ({
      key: plan.target.rawBlobName,
      imageId: plan.imageId,
      galleryFile: plan.galleryFile,
      sourceUrl: plan.current.rawUrl,
    })),
  );
  const thumbCollisions = collisions(
    plans.map((plan) => ({
      key: plan.target.thumbBlobName,
      imageId: plan.imageId,
      galleryFile: plan.galleryFile,
      sourceUrl: plan.current.thumbUrl,
    })),
  );

  if (rawCollisions.length > 0 || thumbCollisions.length > 0) {
    throw new Error(
      `Target image path collision detected. raw=${rawCollisions.length} thumb=${thumbCollisions.length}`,
    );
  }
}

function collisionReport(copyOperations: CopyOperation[], caseInsensitive: boolean): Collision[] {
  return collisions(
    copyOperations.map((operation) => ({
      key: `${operation.targetContainerName}/${operation.targetBlobName}`,
      imageId: operation.imageId,
      galleryFile: operation.galleryFile,
      sourceUrl: operation.sourceUrl,
    })),
    caseInsensitive,
  );
}

function collisions(
  items: Array<{ key: string; imageId: string; galleryFile: string; sourceUrl: string }>,
  caseInsensitive = false,
): Collision[] {
  const groups = new Map<string, typeof items>();

  for (const item of items) {
    const key = caseInsensitive ? item.key.toLowerCase() : item.key;

    if (!groups.has(key)) {
      groups.set(key, []);
    }

    groups.get(key)!.push(item);
  }

  return [...groups.entries()]
    .filter(([, group]) => group.length > 1)
    .map(([target, group]) => ({
      target,
      items: group.map(({ imageId, galleryFile, sourceUrl }) => ({ imageId, galleryFile, sourceUrl })),
    }));
}

function sourceSummary(plans: ImageAssetPlan[]) {
  const rawReferences = plans.map((plan) => blobReference(plan.current.rawUrl));
  const thumbReferences = plans.map((plan) => blobReference(plan.current.thumbUrl));

  return {
    sourceTypes: countBy(plans.map((plan) => plan.sourceType)),
    rawAccounts: countBy(rawReferences.map((reference) => reference.accountName)),
    rawContainers: countBy(rawReferences.map((reference) => reference.containerName)),
    rawPathShapes: topCounts(rawReferences.map((reference) => pathShape(reference.blobName))),
    thumbPathShapes: topCounts(thumbReferences.map((reference) => pathShape(reference.blobName))),
  };
}

function printSummary(manifest: {
  target: {
    accountName: string;
    containerName: string;
    baseUrl: string;
  };
  counts: {
    images: number;
    copyOperations: number;
    targetMatchesSource: number;
    targetCollisions: number;
    targetCaseInsensitiveCollisions: number;
  };
  sourceSummary: unknown;
  copyOperations: CopyOperation[];
}) {
  console.log('Image storage migration manifest');
  console.log(`Images: ${manifest.counts.images.toLocaleString()}`);
  console.log(`Copy operations: ${manifest.counts.copyOperations.toLocaleString()}`);
  console.log(`Target: ${manifest.target.baseUrl}`);
  console.log(`Target matches existing source: ${manifest.counts.targetMatchesSource.toLocaleString()}`);
  console.log(`Target collisions: ${manifest.counts.targetCollisions.toLocaleString()}`);
  console.log(
    `Target case-insensitive collisions: ${manifest.counts.targetCaseInsensitiveCollisions.toLocaleString()}`,
  );
  console.log(`Source summary: ${JSON.stringify(manifest.sourceSummary, null, 2)}`);
  console.log('\nFirst copy operations:');

  for (const operation of manifest.copyOperations.slice(0, 10)) {
    console.log(`- ${operation.kind}: ${operation.sourceBlobName} -> ${operation.targetBlobName}`);
  }
}

function blobReference(value: string): BlobReference {
  const url = new URL(value);
  const parts = url.pathname.split('/').filter(Boolean).map((part) => decodeURIComponent(part));
  const containerName = parts[0];
  const blobName = parts.slice(1).join('/');
  const filename = parts.at(-1) || '';
  const accountName = url.hostname.split('.')[0];

  if (!accountName || !containerName || !blobName || !filename) {
    throw new Error(`Unsupported blob URL: ${value}`);
  }

  return {
    url: value,
    accountName,
    containerName,
    blobName,
    filename,
  };
}

function blobName(kind: 'images' | 'thumbs', parts: DateParts, filename: string) {
  return `${kind}/${parts.year}/${parts.month}/${parts.day}/${filename}`;
}

function blobUrl(accountName: string, containerName: string, blobNameValue: string) {
  return `https://${accountName}.blob.core.windows.net/${encodePath([containerName, ...blobNameValue.split('/')])}`;
}

function targetMatchesSource(source: BlobReference, targetAccountName: string, targetBlobName: string) {
  return (
    source.accountName === targetAccountName &&
    source.containerName === targetContainerName &&
    source.blobName === targetBlobName
  );
}

type DateParts = {
  year: string;
  month: string;
  day: string;
};

function dateParts(data: Frontmatter, file: string): DateParts {
  const year = numberText(data.year);
  const month = numberText(data.month);
  const day = numberText(data.day);

  if (year && month && day) {
    return { year, month, day };
  }

  const takenAt = textValue(data.taken_at);
  const takenAtMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(takenAt);

  if (takenAtMatch) {
    return {
      year: takenAtMatch[1],
      month: takenAtMatch[2],
      day: takenAtMatch[3],
    };
  }

  const fileMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(file);

  if (fileMatch) {
    return {
      year: fileMatch[1],
      month: fileMatch[2],
      day: fileMatch[3],
    };
  }

  throw new Error(`${file}: unable to resolve image date parts.`);
}

function imageSourceType(data: Frontmatter) {
  const source = data.source;

  if (source && typeof source === 'object' && !(source instanceof Date)) {
    return textValue((source as Frontmatter).type) || 'unknown';
  }

  return textValue(source) || 'unknown';
}

function pathShape(blobNameValue: string) {
  const parts = blobNameValue.split('/').slice(0, -1);

  return parts
    .map((part, index) => {
      if (/^\d{4}$/.test(part)) {
        return 'yyyy';
      }

      if (/^\d{2}$/.test(part) && /^\d{4}$/.test(parts[index - 1] || '')) {
        return 'mm';
      }

      if (/^\d{2}$/.test(part) && /^\d{4}$/.test(parts[index - 2] || '')) {
        return 'dd';
      }

      return part;
    })
    .join('/');
}

function countBy(values: string[]) {
  const counts: Record<string, number> = {};

  for (const value of values) {
    counts[value] = (counts[value] || 0) + 1;
  }

  return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1]));
}

function topCounts(values: string[], limit = 12) {
  return Object.entries(countBy(values)).slice(0, limit);
}

function onlyValue(values: string[], label: string) {
  if (values.length === 1) {
    return values[0];
  }

  throw new Error(`Expected one ${label}, found: ${values.join(', ') || 'none'}`);
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort();
}

function encodePath(parts: string[]) {
  return parts.map((part) => encodeURIComponent(part)).join('/');
}

function requiredText(value: unknown, label: string) {
  const text = textValue(value);

  if (!text) {
    throw new Error(`Missing ${label}`);
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

function numberText(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value).padStart(2, '0');
  }

  const text = textValue(value);
  return text ? text.padStart(2, '0') : '';
}

function cleanSiteKey(value: string) {
  const key = value.trim().toLowerCase();

  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(key)) {
    throw new Error(`Invalid site key: ${value}`);
  }

  return key;
}

function argValue(name: string) {
  const prefix = `${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function assertManifestPath(fullPath: string) {
  const resolved = path.resolve(fullPath);
  const allowed = path.resolve(root, '.tmp');

  if (!resolved.startsWith(`${allowed}${path.sep}`)) {
    throw new Error(`Refusing to write manifest outside .tmp/: ${resolved}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
