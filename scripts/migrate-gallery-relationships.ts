import fs from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';

type Frontmatter = Record<string, unknown>;
type ContentType = 'article' | 'story' | 'gallery';

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

type ImageSource = MarkdownSource & {
  id: string;
  galleryId: string;
  index: number;
};

type EntrySource = MarkdownSource & {
  id: string;
  type: ContentType;
  slug: string;
  title: string;
  datePrefix: string;
  galleryIds: string[];
  sourceType: string;
  excluded: boolean;
};

type RelatedLink = {
  type?: ContentType;
  id: string;
  title?: string;
  route?: string;
  rel?: string;
};

type Stats = {
  postFiles: number;
  imageFiles: number;
  directEntries: number;
  galleryEntries: number;
  gallerySourcesCreated: number;
  gallerySourcesUpdated: number;
  gallerySourcesConvertedToStories: number;
  skippedExcludedGallerySources: number;
  galleryIncludesRemoved: number;
  imageRecordsDetached: number;
  filesChanged: Set<string>;
  filesCreated: Set<string>;
  bySource: Record<string, { direct: number; gallery: number }>;
};

const root = process.cwd();
const postsRoot = path.join(root, '_posts');
const galleryRoot = path.join(root, '_gallery');
const writeChanges = process.argv.includes('--write');
const galleryThreshold = numberArg('--gallery-threshold') ?? 4;
const richImageLimit = numberArg('--max-rich-images') ?? 1000;

const stats: Stats = {
  postFiles: 0,
  imageFiles: 0,
  directEntries: 0,
  galleryEntries: 0,
  gallerySourcesCreated: 0,
  gallerySourcesUpdated: 0,
  gallerySourcesConvertedToStories: 0,
  skippedExcludedGallerySources: 0,
  galleryIncludesRemoved: 0,
  imageRecordsDetached: 0,
  filesChanged: new Set(),
  filesCreated: new Set(),
  bySource: {},
};

const pendingWrites = new Map<string, string>();
const directGalleryIds = new Set<string>();

async function main() {
  if (galleryThreshold < 2) {
    throw new Error(`--gallery-threshold must be at least 2. Received ${galleryThreshold}.`);
  }

  const posts = await readMarkdownDirectory(postsRoot);
  const imageFiles = await readMarkdownDirectory(galleryRoot);
  stats.postFiles = posts.length;
  stats.imageFiles = imageFiles.length;

  const images = imageFiles.map(imageSource).filter((image) => image.galleryId);
  const imagesByGallery = groupImages(images);
  const entries = posts.map(entrySource);
  const postFilenames = new Set(posts.map((post) => post.file));
  const gallerySourcesByGallery = new Map<string, EntrySource>();

  for (const entry of entries) {
    if (entry.type === 'gallery' && entry.galleryIds[0]) {
      gallerySourcesByGallery.set(entry.galleryIds[0], entry);
    }
  }

  for (const entry of entries) {
    if (entry.galleryIds.length === 0) {
      continue;
    }

    const galleryId = entry.galleryIds[0];
    const galleryImages = imagesByGallery.get(galleryId) ?? [];

    if (galleryImages.length === 0) {
      continue;
    }

    if (entry.type === 'gallery') {
      migrateGallerySource(entry, galleryImages);
      continue;
    }

    if (galleryImages.length < galleryThreshold) {
      migrateDirectEntry(entry, galleryImages);
      directGalleryIds.add(galleryId);
      countBySource(entry.sourceType, 'direct');
      continue;
    }

    migrateGalleryBackedEntry(entry, galleryId, galleryImages, gallerySourcesByGallery, postFilenames);
    countBySource(entry.sourceType, 'gallery');
  }

  detachDirectImageRecords(images);
  validatePendingMarkdown();

  if (writeChanges) {
    await flushWrites();
  }

  printSummary();
}

async function readMarkdownDirectory(directory: string) {
  const files = (await fs.readdir(directory)).filter((file) => file.endsWith('.md')).sort();
  const sources: MarkdownSource[] = [];

  for (const file of files) {
    const fullPath = path.join(directory, file);
    const raw = await fs.readFile(fullPath, 'utf8');
    const range = frontmatterRange(raw);

    if (!range) {
      console.warn(`Skipping ${file}: missing frontmatter.`);
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

function imageSource(source: MarkdownSource): ImageSource {
  return {
    ...source,
    id: textValue(source.data.id) || path.basename(source.file, '.md'),
    galleryId: textValue(source.data.gallery),
    index: numberValue(source.data.index) ?? Number.MAX_SAFE_INTEGER,
  };
}

function entrySource(source: MarkdownSource): EntrySource {
  const filename = path.basename(source.file, '.md');
  const slug = textValue(source.data.slug) || slugFromPostFilename(filename);
  const sourceTypeValue = sourceType(source.data);
  const type = classifyContentType(sourceTypeValue, source.data);
  const galleryIds = galleryReferences(source.content, source.data);
  const title = textValue(source.data.title) || titleFromSlug(slug);

  return {
    ...source,
    id: textValue(source.data.post_id) || textValue(source.data.id) || filename,
    type,
    slug,
    title,
    datePrefix: datePrefixFromFilename(filename),
    galleryIds,
    sourceType: sourceTypeValue || 'unknown',
    excluded: excludeFromArchives(source.data, title, galleryIds),
  };
}

function migrateGallerySource(entry: EntrySource, images: ImageSource[]) {
  if (entry.excluded) {
    stats.skippedExcludedGallerySources += 1;
    return;
  }

  if (images.length < galleryThreshold) {
    const yaml = removeField(
      setDirectImageFields(entry.range.yaml, images, relatedWithoutGallery(entry.data, entry.galleryIds)),
      'gallery',
    );
    const content = removeGalleryIncludes(entry.content);
    const nextYaml = setField(yaml, 'content_type', formatScalar('story'), 'title');
    schedulePostWrite(entry, nextYaml, content);
    directGalleryIds.add(entry.galleryIds[0]);
    stats.gallerySourcesConvertedToStories += 1;
    countBySource(entry.sourceType, 'direct');
    return;
  }

  const nextYaml = setGallerySourceFields(entry.range.yaml, entry.galleryIds[0], images, entry.data);
  const nextContent = removeGalleryIncludes(entry.content);
  schedulePostWrite(entry, nextYaml, nextContent);
  stats.gallerySourcesUpdated += 1;
  countBySource(entry.sourceType, 'gallery');
}

function migrateDirectEntry(entry: EntrySource, images: ImageSource[]) {
  const nextYaml = removeField(
    setDirectImageFields(entry.range.yaml, images, relatedWithoutGallery(entry.data, entry.galleryIds)),
    'gallery',
  );
  const nextContent = removeGalleryIncludes(entry.content);
  schedulePostWrite(entry, nextYaml, nextContent);
  stats.directEntries += 1;
}

function migrateGalleryBackedEntry(
  entry: EntrySource,
  galleryId: string,
  images: ImageSource[],
  gallerySourcesByGallery: Map<string, EntrySource>,
  postFilenames: Set<string>,
) {
  const related = addRelatedLink(relatedWithoutGallery(entry.data, []), {
    type: 'gallery',
    id: galleryId,
    rel: 'photos',
  });
  let yaml = removeField(entry.range.yaml, 'gallery');
  yaml = setField(yaml, 'cover_image', formatScalar(images[0].id), 'source');
  yaml = setRelatedField(yaml, related, 'cover_image');
  const content = removeGalleryIncludes(entry.content);
  schedulePostWrite(entry, yaml, content);

  const gallerySource = gallerySourcesByGallery.get(galleryId);

  if (gallerySource) {
    const galleryYaml = setGallerySourceFields(
      gallerySource.range.yaml,
      galleryId,
      images,
      gallerySource.data,
      galleryBackLink(entry),
    );
    schedulePostWrite(gallerySource, galleryYaml, removeGalleryIncludes(gallerySource.content));
    stats.gallerySourcesUpdated += 1;
  } else {
    const created = createGallerySource(entry, galleryId, images, postFilenames);
    pendingWrites.set(created.fullPath, created.raw);
    stats.filesCreated.add(created.fullPath);
    stats.gallerySourcesCreated += 1;
    postFilenames.add(created.file);
    gallerySourcesByGallery.set(galleryId, created);
  }

  stats.galleryEntries += 1;
}

function detachDirectImageRecords(images: ImageSource[]) {
  for (const image of images) {
    if (!directGalleryIds.has(image.galleryId)) {
      continue;
    }

    const nextYaml = removeField(image.range.yaml, 'gallery');
    scheduleImageWrite(image, nextYaml);
    stats.imageRecordsDetached += 1;
  }
}

function setDirectImageFields(yaml: string, images: ImageSource[], related: RelatedLink[]) {
  let next = setField(yaml, 'cover_image', formatScalar(images[0].id), 'source');
  next = setField(next, 'images', formatImageReferences(images), 'cover_image');
  next = setRelatedField(next, related, 'images');
  return next;
}

function setGallerySourceFields(
  yaml: string,
  galleryId: string,
  images: ImageSource[],
  data: Frontmatter,
  related?: RelatedLink,
) {
  let next = setField(yaml, 'gallery', formatScalar(galleryId), 'summary');
  next = setField(next, 'cover_image', formatScalar(images[0].id), 'gallery');

  if (images.length <= richImageLimit) {
    next = setField(next, 'images', formatImageReferences(images), 'cover_image');
  }

  if (related) {
    next = setRelatedField(next, addRelatedLink(readRelatedLinks(data), related), 'images');
  }

  return next;
}

function createGallerySource(
  entry: EntrySource,
  galleryId: string,
  images: ImageSource[],
  postFilenames: Set<string>,
): EntrySource {
  const filename = uniqueFilename(`${entry.datePrefix}-${truncateFilenameSlug(entry.slug)}-gallery.md`, postFilenames);
  const fullPath = path.join(postsRoot, filename);
  const postId = `${entry.id}-gallery`;
  const summary = cleanSummary(`${images.length} images related to ${entry.title}.`);
  const related = galleryBackLink(entry);
  const yaml = [
    'layout: single',
    `title: ${formatScalar(entry.title)}`,
    'content_type: gallery',
    `slug: ${formatScalar(entry.slug)}`,
    `post_id: ${formatScalar(postId)}`,
    `date: ${scalarFieldText(entry.range.yaml, 'date') || formatScalar(dateFromPrefix(entry.datePrefix))}`,
    sourceYaml(entry.data),
    listYaml('categories', stringArray(entry.data.categories)),
    listYaml('tags', uniqueStrings([...stringArray(entry.data.tags), 'gallery'])),
    listYaml('authors', stringArray(entry.data.authors).length ? stringArray(entry.data.authors) : stringArray(entry.data.author)),
    `summary: ${formatScalar(summary)}`,
    `gallery: ${formatScalar(galleryId)}`,
    `cover_image: ${formatScalar(images[0].id)}`,
    `images:${formatImageReferences(images)}`,
    `related:${formatRelatedLinks([related])}`,
    'published: true',
    'status: published',
    'comments: false',
  ]
    .filter(Boolean)
    .join('\n');
  const content = `Photos related to ${entry.title}.`;
  const raw = composeRaw('', yaml, content, '\n');
  const range = frontmatterRange(raw)!;

  return {
    file: filename,
    fullPath,
    raw,
    range,
    data: {
      content_type: 'gallery',
      post_id: postId,
      slug: entry.slug,
      gallery: galleryId,
      title: entry.title,
      source: minimalSource(entry.data),
    },
    content,
    id: postId,
    type: 'gallery',
    slug: entry.slug,
    title: entry.title,
    datePrefix: entry.datePrefix,
    galleryIds: [galleryId],
    sourceType: entry.sourceType,
    excluded: false,
  };
}

function schedulePostWrite(source: EntrySource, yaml: string, content: string) {
  const cleanedContent = normalizeContent(content);

  if (cleanedContent !== normalizeContent(source.content)) {
    stats.galleryIncludesRemoved += 1;
  }

  const next = composeRaw(source.range.before, yaml, cleanedContent, source.range.newline);
  scheduleWrite(source.fullPath, source.raw, next);
}

function scheduleImageWrite(source: ImageSource, yaml: string) {
  const next = composeRaw(source.range.before, yaml, normalizeContent(source.content), source.range.newline);
  scheduleWrite(source.fullPath, source.raw, next);
}

function scheduleWrite(fullPath: string, current: string, next: string) {
  if (current === next) {
    return;
  }

  pendingWrites.set(fullPath, next);
  stats.filesChanged.add(fullPath);
}

async function flushWrites() {
  for (const [fullPath, contents] of pendingWrites) {
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, contents, 'utf8');
  }
}

function printSummary() {
  const action = writeChanges ? 'Migrated' : 'Would migrate';
  console.log(`${action} gallery relationships using ${galleryThreshold}+ images as the gallery threshold.`);
  console.log(`Posts scanned: ${stats.postFiles.toLocaleString()}`);
  console.log(`Images scanned: ${stats.imageFiles.toLocaleString()}`);
  console.log(`Direct image entries: ${stats.directEntries.toLocaleString()}`);
  console.log(`Gallery-backed entries: ${stats.galleryEntries.toLocaleString()}`);
  console.log(`Gallery sources created: ${stats.gallerySourcesCreated.toLocaleString()}`);
  console.log(`Gallery sources updated: ${stats.gallerySourcesUpdated.toLocaleString()}`);
  console.log(`Small gallery sources converted to stories: ${stats.gallerySourcesConvertedToStories.toLocaleString()}`);
  console.log(`Excluded gallery sources skipped: ${stats.skippedExcludedGallerySources.toLocaleString()}`);
  console.log(`Image records detached from small galleries: ${stats.imageRecordsDetached.toLocaleString()}`);
  console.log(`Gallery includes removed: ${stats.galleryIncludesRemoved.toLocaleString()}`);
  console.log(`Files changed: ${stats.filesChanged.size.toLocaleString()}`);
  console.log(`Files created: ${stats.filesCreated.size.toLocaleString()}`);
  console.log(`Pending Markdown files validated: ${pendingWrites.size.toLocaleString()}`);
  console.log(`By source: ${JSON.stringify(stats.bySource, null, 2)}`);

  if (!writeChanges) {
    console.log('Dry run only. Re-run with --write to update Markdown files.');
  }
}

function validatePendingMarkdown() {
  for (const [fullPath, contents] of pendingWrites) {
    try {
      matter(contents);
    } catch (error) {
      const relative = path.relative(root, fullPath);
      throw new Error(`Generated invalid frontmatter for ${relative}: ${(error as Error).message}`);
    }
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
  const normalizedContent = normalizeContent(content).replace(/\r?\n/g, newline);
  return `${before}---${newline}${normalizedYaml}${newline}---${newline}${normalizedContent}${newline}`;
}

function normalizeContent(content: string) {
  return content.trim();
}

function groupImages(images: ImageSource[]) {
  const groups = new Map<string, ImageSource[]>();

  for (const image of images) {
    if (!groups.has(image.galleryId)) {
      groups.set(image.galleryId, []);
    }

    groups.get(image.galleryId)!.push(image);
  }

  for (const group of groups.values()) {
    group.sort((a, b) => a.index - b.index || a.id.localeCompare(b.id));
  }

  return groups;
}

function galleryReferences(content: string, data: Frontmatter) {
  const ids = new Set<string>();
  const frontmatterGallery = textValue(data.gallery);

  if (frontmatterGallery) {
    ids.add(frontmatterGallery);
  }

  for (const match of content.matchAll(/{%\s*include\s+gallery\.html\s+gallery="([^"]+)"\s*%}/g)) {
    ids.add(match[1]);
  }

  return [...ids];
}

function removeGalleryIncludes(content: string) {
  return content
    .replace(/\r?\n?{%\s*include\s+gallery\.html\s+gallery="[^"]+"\s*%}\r?\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
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

function setField(yaml: string, key: string, value: string, anchor?: string) {
  const lines = yaml.split(/\r?\n/);
  const fieldLines = `${key}:${value.startsWith('\n') ? '' : ' '}${value}`.split('\n');
  const existing = fieldBlock(yaml, key);

  if (existing) {
    lines.splice(existing[0], existing[1] - existing[0], ...fieldLines);
    return lines.join('\n');
  }

  const index = anchor ? endOfField(lines, anchor) : -1;

  if (index === -1) {
    lines.push(...fieldLines);
  } else {
    lines.splice(index, 0, ...fieldLines);
  }

  return lines.join('\n');
}

function removeField(yaml: string, key: string) {
  const lines = yaml.split(/\r?\n/);
  const existing = fieldBlock(yaml, key);

  if (!existing) {
    return yaml;
  }

  lines.splice(existing[0], existing[1] - existing[0]);
  return lines.join('\n');
}

function endOfField(lines: string[], key: string) {
  const start = lines.findIndex((line) => new RegExp(`^${escapeRegExp(key)}\\s*:`).test(line));

  if (start === -1) {
    return -1;
  }

  let end = start + 1;

  while (end < lines.length && !/^[A-Za-z0-9_-]+\s*:/.test(lines[end])) {
    end += 1;
  }

  return end;
}

function scalarFieldText(yaml: string, key: string) {
  const block = fieldBlock(yaml, key);

  if (!block) {
    return '';
  }

  const line = yaml.split(/\r?\n/)[block[0]];
  const value = line.replace(new RegExp(`^${escapeRegExp(key)}\\s*:\\s*`), '').trim();
  return value.includes('\n') ? '' : value;
}

function setRelatedField(yaml: string, links: RelatedLink[], anchor?: string) {
  if (links.length === 0) {
    return removeField(yaml, 'related');
  }

  return setField(yaml, 'related', formatRelatedLinks(links), anchor);
}

function readRelatedLinks(data: Frontmatter): RelatedLink[] {
  const related = data.related;

  if (typeof related === 'string') {
    return related.trim() ? [{ id: related.trim() }] : [];
  }

  if (!Array.isArray(related)) {
    return [];
  }

  return related
    .map((item) => {
      if (typeof item === 'string') {
        return item.trim() ? { id: item.trim() } : undefined;
      }

      if (!item || typeof item !== 'object' || item instanceof Date) {
        return undefined;
      }

      const value = item as Frontmatter;
      const id = textValue(value.id || value.post_id || value.slug || value.route);

      if (!id) {
        return undefined;
      }

      return compactObject({
        type: contentLinkType(value.type),
        id,
        title: textValue(value.title),
        route: textValue(value.route || value.href || value.url),
        rel: textValue(value.rel),
      });
    })
    .filter(Boolean) as RelatedLink[];
}

function relatedWithoutGallery(data: Frontmatter, galleryIds: string[]) {
  const remove = new Set(galleryIds);
  return readRelatedLinks(data).filter((link) => !(link.type === 'gallery' && remove.has(link.id)));
}

function addRelatedLink(links: RelatedLink[], next: RelatedLink) {
  const exists = links.some((link) => link.type === next.type && link.id === next.id && link.rel === next.rel);
  return exists ? links : [...links, next];
}

function galleryBackLink(entry: EntrySource): RelatedLink {
  return {
    type: entry.type,
    id: entry.id,
    title: entry.title,
    rel: entry.type === 'article' ? 'companion-article' : 'companion-story',
  };
}

function formatImageReferences(images: ImageSource[]) {
  return `\n${images
    .map((image) => [`  - id: ${formatScalar(image.id)}`, '    caption:', '    alt:'].join('\n'))
    .join('\n')}`;
}

function formatRelatedLinks(links: RelatedLink[]) {
  return `\n${links
    .map((link) => {
      const lines = [`  - id: ${formatScalar(link.id)}`];

      if (link.type) {
        lines.unshift(`  - type: ${formatScalar(link.type)}`);
        lines[1] = `    id: ${formatScalar(link.id)}`;
      }

      if (link.title) {
        lines.push(`    title: ${formatScalar(link.title)}`);
      }

      if (link.route) {
        lines.push(`    route: ${formatScalar(link.route)}`);
      }

      if (link.rel) {
        lines.push(`    rel: ${formatScalar(link.rel)}`);
      }

      return lines.join('\n');
    })
    .join('\n')}`;
}

function listYaml(key: string, values: string[]) {
  if (values.length === 0) {
    return '';
  }

  return `${key}:\n${values.map((value) => `  - ${formatScalar(value)}`).join('\n')}`;
}

function sourceYaml(data: Frontmatter) {
  const source = minimalSource(data);

  if (Object.keys(source).length === 0) {
    return '';
  }

  const lines = ['source:'];

  for (const [key, value] of Object.entries(source)) {
    lines.push(`  ${key}: ${formatScalar(value)}`);
  }

  return lines.join('\n');
}

function minimalSource(data: Frontmatter): Record<string, string> {
  const source = data.source;

  if (!source || typeof source !== 'object' || source instanceof Date) {
    const sourceText = textValue(source);
    return sourceText ? { type: sourceText } : {};
  }

  const sourceData = source as Frontmatter;
  return compactObject({
    type: textValue(sourceData.type),
    subtype: textValue(sourceData.subtype),
    id: textValue(sourceData.id),
    url: textValue(sourceData.url),
    media_count: textValue(sourceData.media_count),
    cross_post_source: textValue(sourceData.cross_post_source),
  });
}

function classifyContentType(source: string, data: Frontmatter): ContentType {
  const explicitType = textValue(data.content_type || data.contentType || data.type).toLowerCase();

  if (explicitType === 'article' || explicitType === 'post') {
    return 'article';
  }

  if (explicitType === 'story') {
    return 'story';
  }

  if (explicitType === 'gallery') {
    return 'gallery';
  }

  if (
    source === 'facebook' &&
    textValue((data.source as Frontmatter | undefined)?.subtype).toLowerCase() === 'album'
  ) {
    return 'gallery';
  }

  if (source === 'wordpress' || stringArray(data.tags).includes('wordpress')) {
    return 'article';
  }

  return 'story';
}

function contentLinkType(value: unknown): ContentType | undefined {
  const type = textValue(value).toLowerCase();

  if (type === 'article' || type === 'story' || type === 'gallery') {
    return type;
  }

  if (type === 'post') {
    return 'article';
  }

  return undefined;
}

function sourceType(data: Frontmatter) {
  const source = data.source;

  if (source && typeof source === 'object' && !(source instanceof Date)) {
    return textValue((source as Frontmatter).type).toLowerCase();
  }

  return textValue(source).toLowerCase();
}

function excludeFromArchives(data: Frontmatter, title: string, galleryIds: string[]) {
  if (data.exclude_from_archives === true || data.excludeFromArchives === true) {
    return true;
  }

  const text = [
    title,
    textValue(data.post_id),
    ...galleryIds,
    albumTitle(data),
  ].join(' ');

  return sourceType(data) === 'facebook' &&
    textValue((data.source as Frontmatter | undefined)?.subtype).toLowerCase() === 'album' &&
    /mobile[-\s]*uploads?/i.test(text);
}

function albumTitle(data: Frontmatter) {
  const album = data.album;

  if (!album || typeof album !== 'object' || album instanceof Date) {
    return '';
  }

  return textValue((album as Frontmatter).title);
}

function numberArg(name: string) {
  const prefix = `${name}=`;
  const arg = process.argv.find((value) => value.startsWith(prefix));

  if (!arg) {
    return undefined;
  }

  const parsed = Number(arg.slice(prefix.length));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function numberValue(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  const parsed = Number(textValue(value));
  return Number.isFinite(parsed) ? parsed : undefined;
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

function stringArray(value: unknown) {
  if (typeof value === 'string') {
    return value.trim() ? [value.trim()] : [];
  }

  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => textValue(item)).filter(Boolean);
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function formatScalar(value: string) {
  if (/^[A-Za-z_][A-Za-z0-9_-]*$/.test(value)) {
    return value;
  }

  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function compactObject<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined && item !== ''),
  ) as T;
}

function slugFromPostFilename(filename: string) {
  return filename.replace(/^\d{4}-\d{2}-\d{2}-/, '');
}

function titleFromSlug(slug: string) {
  return slug
    .replace(/^\d{6}-/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function datePrefixFromFilename(filename: string) {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(filename);
  return match?.[1] ?? new Date().toISOString().slice(0, 10);
}

function dateFromPrefix(prefix: string) {
  return `${prefix} 00:00:00`;
}

function truncateFilenameSlug(slug: string) {
  return slug.length <= 120 ? slug : slug.slice(0, 120).replace(/-+$/g, '');
}

function uniqueFilename(filename: string, used: Set<string>) {
  if (!used.has(filename)) {
    return filename;
  }

  const extension = path.extname(filename);
  const basename = filename.slice(0, -extension.length);
  let index = 2;

  while (used.has(`${basename}-${index}${extension}`)) {
    index += 1;
  }

  return `${basename}-${index}${extension}`;
}

function cleanSummary(value: string) {
  return value.replace(/\s+/g, ' ').trim().slice(0, 240);
}

function countBySource(source: string, bucket: 'direct' | 'gallery') {
  if (!stats.bySource[source]) {
    stats.bySource[source] = { direct: 0, gallery: 0 };
  }

  stats.bySource[source][bucket] += 1;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
