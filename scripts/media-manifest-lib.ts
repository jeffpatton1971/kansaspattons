import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';

export type DateParts = {
  year: string;
  month: string;
  day: string;
};

export type MediaKind = 'image' | 'video';

export type MediaUsage = {
  contentType: 'post' | 'story' | 'gallery';
  id: string;
  route?: string;
  role?: 'cover' | 'inline' | 'gallery-item' | 'story-media';
};

export type MediaAsset = DateParts & {
  siteKey: string;
  id: string;
  kind: MediaKind;
  date: string;
  filename: string;
  title?: string;
  caption?: string;
  alt?: string;
  rawUrl: string;
  thumbUrl?: string;
  posterUrl?: string;
  contentType?: string;
  people?: string[];
  locations?: string[];
  usedBy?: MediaUsage[];
  legacy?: {
    galleryMarkdownId?: string;
    source?: 'wordpress' | 'instagram' | 'facebook' | 'legacy';
    sourceFilename?: string;
    sourceUrl?: string;
    postId?: string;
    galleryId?: string;
  };
};

export type MediaManifest = {
  schemaVersion: '2026-05-15';
  generatedAt: string;
  site: {
    key: string;
    title?: string;
  };
  storage: {
    accountName: string;
    containerName: string;
    baseUrl: string;
    rawPrefix: 'images';
    thumbPrefix: 'thumbs';
  };
  assets: MediaAsset[];
};

type Frontmatter = Record<string, unknown>;
type LegacyMediaSource = NonNullable<MediaAsset['legacy']>['source'];

export async function readMediaManifest(manifestPath: string) {
  return JSON.parse(await readFile(manifestPath, 'utf8')) as MediaManifest;
}

export async function writeMediaManifest(manifestPath: string, manifest: MediaManifest) {
  await mkdir(path.dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

export async function buildLegacyMediaManifest({
  root,
  siteKey,
  siteTitle,
}: {
  root: string;
  siteKey: string;
  siteTitle?: string;
}) {
  const galleryRoot = path.join(root, '_gallery');
  const files = await markdownFiles(galleryRoot);
  const assets: MediaAsset[] = [];
  let storage = defaultStorage(siteKey);

  for (const file of files) {
    const fullPath = path.join(galleryRoot, file);
    const raw = await readFile(fullPath, 'utf8');
    const parsed = matter(raw);
    const filename = path.basename(file, '.md');
    const parts = partsFromFrontmatter(parsed.data) ?? partsFromFilename(filename);

    if (!parts) {
      continue;
    }

    const sourceFilename = canonicalMediaFilename(parsed.data, filename);

    if (!sourceFilename) {
      continue;
    }

    const rawSourceUrl = textValue(parsed.data.raw_url);
    const thumbSourceUrl = textValue(parsed.data.thumb_url);
    const storageFromUrl = storageFromAssetUrl(rawSourceUrl || thumbSourceUrl);

    if (storageFromUrl) {
      storage = storageFromUrl;
    }

    const id = canonicalMediaId(parts, sourceFilename);
    const kind = mediaKind(sourceFilename);
    const title = textValue(parsed.data.title) || textValue(parsed.data.description) || titleFromSlug(id);
    const caption = textValue(parsed.data.caption) || textValue(parsed.data.description);
    const rawUrl = canonicalAssetUrl(rawSourceUrl || thumbSourceUrl, 'images', parts, sourceFilename);
    const thumbUrl =
      kind === 'video'
        ? undefined
        : canonicalAssetUrl(thumbSourceUrl || rawSourceUrl, 'thumbs', parts, sourceFilename);
    const source = legacySource(parsed.data.source);
    const postId = textValue(parsed.data.post_id);
    const galleryId = textValue(parsed.data.gallery);

    assets.push({
      siteKey,
      id,
      kind,
      date: normalizedDate(parsed.data.taken_at || parsed.data.date, parts),
      filename: sourceFilename,
      title,
      caption: caption || undefined,
      alt: textValue(parsed.data.alt) || caption || title,
      rawUrl,
      thumbUrl,
      people: stringArray(parsed.data.people),
      locations: locations(parsed.data),
      legacy: compactObject({
        galleryMarkdownId: filename,
        source,
        sourceFilename,
        sourceUrl: rawSourceUrl || undefined,
        postId,
        galleryId,
      }),
      ...parts,
    });
  }

  assets.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));

  return {
    schemaVersion: '2026-05-15',
    generatedAt: new Date().toISOString(),
    site: {
      key: siteKey,
      title: siteTitle,
    },
    storage,
    assets,
  } satisfies MediaManifest;
}

function defaultStorage(siteKey: string): MediaManifest['storage'] {
  return {
    accountName: '',
    containerName: siteKey,
    baseUrl: '',
    rawPrefix: 'images',
    thumbPrefix: 'thumbs',
  };
}

function storageFromAssetUrl(value: string): MediaManifest['storage'] | undefined {
  if (!value) {
    return undefined;
  }

  try {
    const url = new URL(value);
    const [container] = url.pathname.split('/').filter(Boolean);

    if (!container) {
      return undefined;
    }

    return {
      accountName: url.hostname.split('.')[0] || '',
      containerName: container,
      baseUrl: `${url.origin}/${encodeURIComponent(container)}/`,
      rawPrefix: 'images',
      thumbPrefix: 'thumbs',
    };
  } catch {
    return undefined;
  }
}

function canonicalAssetUrl(currentUrl: string, prefix: 'images' | 'thumbs', parts: DateParts, filename: string) {
  if (!currentUrl) {
    return '';
  }

  try {
    const url = new URL(currentUrl);
    const [container] = url.pathname.split('/').filter(Boolean);

    if (!container) {
      return currentUrl;
    }

    url.pathname = `/${encodePath([container, prefix, parts.year, parts.month, parts.day, filename])}`;
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return currentUrl;
  }
}

function canonicalMediaFilename(data: Frontmatter, fallbackFile: string) {
  return (
    filenameFromUrl(textValue(data.raw_url)) ||
    textValue(data.source_filename) ||
    filenameFromUrl(textValue(data.thumb_url)) ||
    path.basename(fallbackFile, '.md')
  );
}

function canonicalMediaId(parts: DateParts, filename: string) {
  return `${parts.year}/${parts.month}/${parts.day}/${filename}`;
}

function mediaKind(filename: string): MediaKind {
  return /\.(mp4|mov|m4v|webm)$/i.test(filename) ? 'video' : 'image';
}

function legacySource(value: unknown): LegacyMediaSource {
  const source = typeof value === 'object' && value && !(value instanceof Date)
    ? textValue((value as Frontmatter).type)
    : textValue(value);

  if (source === 'wordpress' || source === 'instagram' || source === 'facebook' || source === 'legacy') {
    return source;
  }

  return undefined;
}

function partsFromFrontmatter(data: Frontmatter): DateParts | undefined {
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

function partsFromFilename(filename: string): DateParts | undefined {
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

function normalizedDate(value: unknown, fallback: DateParts) {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) {
    return value.toISOString();
  }

  const text = textValue(value);

  if (text) {
    const normalized = text
      .trim()
      .replace(/^(\d{4}-\d{2}-\d{2})\s+/, '$1T')
      .replace(/T(\d{2}:\d{2}:\d{2})\s+([+-]\d{2})(\d{2})$/, 'T$1$2:$3')
      .replace(/T(\d{2}:\d{2}:\d{2})\s+([+-]\d{2}:\d{2})$/, 'T$1$2');
    const parsed = new Date(normalized);

    if (!Number.isNaN(parsed.valueOf())) {
      return parsed.toISOString();
    }

    return normalized.length === 10 ? `${normalized}T00:00:00` : normalized;
  }

  return `${fallback.year}-${fallback.month}-${fallback.day}T00:00:00`;
}

function locations(data: Frontmatter) {
  const values = [...stringArray(data.locations)];
  const legacy = locationText(data.location);

  if (legacy) {
    values.push(legacy);
  }

  return uniqueStrings(values);
}

function locationText(value: unknown) {
  if (!value) {
    return '';
  }

  if (Array.isArray(value)) {
    return textValue(value[0]);
  }

  if (typeof value === 'object' && !(value instanceof Date)) {
    const data = value as Frontmatter;
    return textValue(data.name) || textValue(data.title) || textValue(data.location);
  }

  return textValue(value);
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
  return [...new Map(values.map((value) => [value.trim().toLowerCase(), value.trim()])).values()].filter(Boolean);
}

function filenameFromUrl(value: string) {
  if (!value) {
    return '';
  }

  try {
    const url = new URL(value);
    return decodeURIComponent(url.pathname).split('/').filter(Boolean).at(-1) ?? '';
  } catch {
    return value.split('/').filter(Boolean).at(-1) ?? '';
  }
}

function encodePath(parts: string[]) {
  return parts.map((part) => encodeURIComponent(part)).join('/');
}

function numberText(value: unknown) {
  if (typeof value === 'number') {
    return String(value).padStart(2, '0');
  }

  const text = textValue(value);
  return text ? text.padStart(2, '0') : '';
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

function titleFromSlug(slug: string) {
  return slug
    .replace(/^\d{6}-/, '')
    .replace(/[-_\/]+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function compactObject<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined && item !== ''),
  ) as T;
}

async function markdownFiles(directory: string) {
  try {
    return (await readdir(directory)).filter((file) => file.endsWith('.md')).sort();
  } catch {
    return [];
  }
}
