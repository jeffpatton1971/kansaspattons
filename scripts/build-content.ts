import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import MarkdownIt from 'markdown-it';
import sanitizeHtml from 'sanitize-html';

type Frontmatter = Record<string, unknown>;

type DateParts = {
  year: string;
  month: string;
  day: string;
};

type ContentShape = 'post' | 'story';

type SiteNavItem = {
  label: string;
  href: string;
};

type SiteAuthorLink = {
  label: string;
  href: string;
};

type SiteAuthor = {
  name: string;
  bio?: string;
  imageUrl?: string;
  links?: SiteAuthorLink[];
};

type EntrySource = {
  type?: string;
  subtype?: string;
  id?: string;
  url?: string;
  caption?: string;
  mediaCount?: number;
  crossPostSource?: string;
};

type PostSummary = DateParts & {
  id: string;
  title: string;
  date: string;
  contentShape: ContentShape;
  slug: string;
  route: string;
  legacyUrl: string;
  excerpt: string;
  categories: string[];
  tags: string[];
  hashtags: string[];
  handles: string[];
  location?: string;
  sourceType?: string;
  source?: EntrySource;
  galleryIds: string[];
  coverImage?: {
    rawUrl: string;
    thumbUrl: string;
    alt: string;
  };
};

type PostDocument = PostSummary & {
  bodyHtml: string;
};

type ImageSummary = DateParts & {
  id: string;
  title: string;
  date: string;
  route: string;
  rawUrl: string;
  thumbUrl: string;
  galleryId?: string;
  source?: string;
  sourceFilename?: string;
  postId?: string;
  postRoute?: string;
};

type ArchiveMonth = {
  month: string;
  count: number;
  href: string;
  days: ArchiveDay[];
};

type ArchiveDay = {
  day: string;
  count: number;
  href: string;
};

type ArchiveYear = {
  year: string;
  count: number;
  href: string;
  months: ArchiveMonth[];
};

const root = process.cwd();
const publicRoot = path.join(root, 'public');
const outputRoot = path.join(publicRoot, 'content');
const postsRoot = path.join(root, '_posts');
const galleryRoot = path.join(root, '_gallery');
const siteKey = cleanSiteKey(process.env.CONTENT_SITE_KEY || process.env.SITE_KEY || 'kansaspattons');
const siteTitle = process.env.CONTENT_SITE_TITLE || process.env.SITE_TITLE || 'KansasPattons';

const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
});

const sanitizeOptions: sanitizeHtml.IOptions = {
  allowedTags: sanitizeHtml.defaults.allowedTags.concat([
    'img',
    'figure',
    'figcaption',
    'h1',
    'h2',
    'h3',
    'h4',
  ]),
  allowedAttributes: {
    ...sanitizeHtml.defaults.allowedAttributes,
    a: ['href', 'name', 'target', 'rel'],
    img: ['src', 'alt', 'title', 'loading'],
  },
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', {
      rel: 'noopener noreferrer',
    }),
  },
};

async function main() {
  ensureGeneratedContentPath();

  await rm(outputRoot, { recursive: true, force: true });
  await mkdir(outputRoot, { recursive: true });

  const posts = await buildPosts();
  const images = await buildImages(posts);
  applyCoverImages(posts, images);
  const blogPosts = posts.filter((post) => post.contentShape === 'post');
  const stories = posts.filter((post) => post.contentShape === 'story');
  await rewriteEntrySummaries(posts);

  await writeJson('site.json', {
    generatedAt: new Date().toISOString(),
    key: siteKey,
    title: siteTitle,
    url: optionalText(process.env.CONTENT_SITE_URL || process.env.SITE_URL),
    nav: siteNav(),
    author: siteAuthor(),
    entries: posts.length,
    posts: blogPosts.length,
    stories: stories.length,
    images: images.length,
  });

  await writeJson('home.json', {
    generatedAt: new Date().toISOString(),
    counts: {
      posts: blogPosts.length,
      stories: stories.length,
      images: images.length,
    },
    recentEntries: recentHomeEntries(blogPosts, stories, 6),
    recentPosts: blogPosts.slice(0, 6),
    recentStories: stories.slice(0, 6),
    recentImages: images.slice(0, 18),
  });

  console.log(`Generated ${posts.length} posts and ${images.length} images.`);
}

function ensureGeneratedContentPath() {
  const resolvedOutput = path.resolve(outputRoot);
  const resolvedPublic = path.resolve(publicRoot);

  if (!resolvedOutput.startsWith(`${resolvedPublic}${path.sep}`)) {
    throw new Error(`Refusing to clean output path outside public/: ${resolvedOutput}`);
  }
}

async function buildPosts() {
  const files = await markdownFiles(postsRoot);
  const posts: PostSummary[] = [];

  for (const file of files) {
    const fullPath = path.join(postsRoot, file);
    const raw = await readFile(fullPath, 'utf8');
    const parsed = matter(raw);
    const filename = path.basename(file, '.md');
    const parts = partsFromFilename(filename) ?? partsFromFrontmatter(parsed.data);

    if (!parts) {
      console.warn(`Skipping post without date parts: ${file}`);
      continue;
    }

    const slug = slugFromPostFilename(filename);
    const galleryIds = galleryIncludes(parsed.content, parsed.data);
    const cleanMarkdown = removeJekyllIncludes(parsed.content);
    const bodyHtml = sanitizeHtml(markdown.render(cleanMarkdown), sanitizeOptions);
    const date = normalizedDate(parsed.data.date, parts);
    const title = textValue(parsed.data.title) || titleFromSlug(slug);
    const id = textValue(parsed.data.post_id) || slug;
    const source = entrySource(parsed.data);
    const contentShape = classifyContentShape(source.type, parsed.data);
    const basePath = contentShape === 'post' ? '/posts' : '/stories';
    const route = `${basePath}/${parts.year}/${parts.month}/${parts.day}/${slug}`;
    const legacyUrl = `/blog/${parts.year}/${parts.month}/${parts.day}/${slug}.html`;

    const document: PostDocument = {
      id,
      title,
      date,
      contentShape,
      slug,
      route,
      legacyUrl,
      excerpt: excerptFromMarkdown(cleanMarkdown),
      categories: stringArray(parsed.data.categories),
      tags: stringArray(parsed.data.tags),
      hashtags: stringArray(parsed.data.hashtags),
      handles: stringArray(parsed.data.handles),
      location: locationText(parsed.data.location),
      sourceType: source.type,
      source: Object.keys(source).length > 0 ? source : undefined,
      galleryIds,
      bodyHtml,
      ...parts,
    };

    await writeJson(`${contentShape === 'post' ? 'posts' : 'stories'}/${parts.year}/${parts.month}/${parts.day}/${slug}.json`, document);

    const { bodyHtml: _bodyHtml, ...summary } = document;
    posts.push(summary);
  }

  posts.sort((a, b) => b.date.localeCompare(a.date));
  const blogPosts = posts.filter((post) => post.contentShape === 'post');
  const stories = posts.filter((post) => post.contentShape === 'story');

  await writeJson('posts/index.json', {
    generatedAt: new Date().toISOString(),
    posts: blogPosts,
    years: archiveYears(blogPosts, '/posts'),
  });

  await writeJson('stories/index.json', {
    generatedAt: new Date().toISOString(),
    posts: stories,
    years: archiveYears(stories, '/stories'),
  });

  await writeJson('entries/index.json', {
    generatedAt: new Date().toISOString(),
    posts,
    years: archiveYears(posts, '/entries'),
    shapes: {
      posts: blogPosts.length,
      stories: stories.length,
    },
  });

  return posts;
}

async function rewriteEntrySummaries(posts: PostSummary[]) {
  const blogPosts = posts.filter((post) => post.contentShape === 'post');
  const stories = posts.filter((post) => post.contentShape === 'story');

  await writeJson('posts/index.json', {
    generatedAt: new Date().toISOString(),
    posts: blogPosts,
    years: archiveYears(blogPosts, '/posts'),
  });

  await writeJson('stories/index.json', {
    generatedAt: new Date().toISOString(),
    posts: stories,
    years: archiveYears(stories, '/stories'),
  });

  await writeJson('entries/index.json', {
    generatedAt: new Date().toISOString(),
    posts,
    years: archiveYears(posts, '/entries'),
    shapes: {
      posts: blogPosts.length,
      stories: stories.length,
    },
  });
}

async function buildImages(posts: PostSummary[]) {
  const files = await markdownFiles(galleryRoot);
  const postRoutesById = new Map(posts.map((post) => [post.id, post.route]));
  const images: ImageSummary[] = [];

  for (const file of files) {
    const fullPath = path.join(galleryRoot, file);
    const raw = await readFile(fullPath, 'utf8');
    const parsed = matter(raw);
    const filename = path.basename(file, '.md');
    const parts = partsFromFrontmatter(parsed.data) ?? partsFromFilename(filename);

    if (!parts) {
      console.warn(`Skipping image without date parts: ${file}`);
      continue;
    }

    const id = textValue(parsed.data.id) || filename;
    const title = textValue(parsed.data.title) || textValue(parsed.data.description) || titleFromSlug(id);
    const date = normalizedDate(parsed.data.taken_at, parts);
    const postId = textValue(parsed.data.post_id);

    images.push({
      id,
      title,
      date,
      route: `/images/${parts.year}/${parts.month}/${parts.day}/${id}`,
      rawUrl: textValue(parsed.data.raw_url),
      thumbUrl: textValue(parsed.data.thumb_url) || textValue(parsed.data.raw_url),
      galleryId: textValue(parsed.data.gallery),
      source: textValue(parsed.data.source),
      sourceFilename: textValue(parsed.data.source_filename),
      postId,
      postRoute: postId ? postRoutesById.get(postId) : undefined,
      ...parts,
    });
  }

  images.sort((a, b) => b.date.localeCompare(a.date));

  await writeJson('images/index.json', {
    generatedAt: new Date().toISOString(),
    images,
    years: archiveYears(images, '/images'),
  });

  return images;
}

function applyCoverImages(posts: PostSummary[], images: ImageSummary[]) {
  const imagesByGallery = new Map<string, ImageSummary>();

  for (const image of images) {
    if (image.galleryId && !imagesByGallery.has(image.galleryId)) {
      imagesByGallery.set(image.galleryId, image);
    }
  }

  for (const post of posts) {
    const cover = post.galleryIds.map((galleryId) => imagesByGallery.get(galleryId)).find(Boolean);

    if (cover) {
      post.coverImage = {
        rawUrl: cover.rawUrl,
        thumbUrl: cover.thumbUrl,
        alt: cover.title,
      };
    }
  }
}

function recentHomeEntries(posts: PostSummary[], stories: PostSummary[], perShape: number) {
  return [...posts.slice(0, perShape), ...stories.slice(0, perShape)].sort((a, b) =>
    b.date.localeCompare(a.date),
  );
}

async function markdownFiles(directory: string) {
  const files = await readdir(directory);
  return files.filter((file) => file.endsWith('.md')).sort();
}

async function writeJson(relativePath: string, value: unknown) {
  const fullPath = path.join(outputRoot, relativePath);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function archiveYears(items: DateParts[], basePath: string): ArchiveYear[] {
  const years = new Map<string, Map<string, Map<string, number>>>();

  for (const item of items) {
    if (!years.has(item.year)) {
      years.set(item.year, new Map());
    }

    const months = years.get(item.year)!;
    if (!months.has(item.month)) {
      months.set(item.month, new Map());
    }

    const days = months.get(item.month)!;
    days.set(item.day, (days.get(item.day) ?? 0) + 1);
  }

  return [...years.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([year, months]) => {
      const monthList = [...months.entries()]
        .sort(([a], [b]) => b.localeCompare(a))
        .map(([month, days]) => {
          const dayList = [...days.entries()]
            .sort(([a], [b]) => b.localeCompare(a))
            .map(([day, count]) => ({
              day,
              count,
              href: `${basePath}/${year}/${month}/${day}`,
            }));

          return {
            month,
            count: sum(dayList.map((day) => day.count)),
            href: `${basePath}/${year}/${month}`,
            days: dayList,
          };
        });

      return {
        year,
        count: sum(monthList.map((month) => month.count)),
        href: `${basePath}/${year}`,
        months: monthList,
      };
    });
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

function partsFromFrontmatter(data: Frontmatter): DateParts | undefined {
  const year = numberText(data.year);
  const month = numberText(data.month);
  const day = numberText(data.day);

  if (year && month && day) {
    return {
      year,
      month,
      day,
    };
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

function slugFromPostFilename(filename: string) {
  return filename.replace(/^\d{4}-\d{2}-\d{2}-/, '');
}

function galleryIncludes(content: string, data: Frontmatter) {
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

function removeJekyllIncludes(content: string) {
  return content.replace(/{%\s*include\s+[^%]+%}/g, '').trim();
}

function normalizedDate(value: unknown, fallback: DateParts) {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) {
    return value.toISOString();
  }

  const text = textValue(value);

  if (text) {
    const normalized = normalizeDateText(text);
    const parsed = new Date(normalized);

    if (!Number.isNaN(parsed.valueOf())) {
      return parsed.toISOString();
    }

    return normalized.length === 10 ? `${normalized}T00:00:00` : normalized;
  }

  return `${fallback.year}-${fallback.month}-${fallback.day}T00:00:00`;
}

function normalizeDateText(value: string) {
  return value
    .trim()
    .replace(/^(\d{4}-\d{2}-\d{2})\s+/, '$1T')
    .replace(/T(\d{2}:\d{2}:\d{2})\s+([+-]\d{2})(\d{2})$/, 'T$1$2:$3')
    .replace(/T(\d{2}:\d{2}:\d{2})\s+([+-]\d{2}:\d{2})$/, 'T$1$2');
}

function excerptFromMarkdown(content: string) {
  return content
    .replace(/{%[^%]+%}/g, ' ')
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/\[[^\]]+]\([^)]*\)/g, (match) => match.replace(/^\[|\]\([^)]*\)$/g, ''))
    .replace(/[#>*_`~-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240);
}

function entrySource(data: Frontmatter): EntrySource {
  const source = data.source;

  if (!source || typeof source !== 'object') {
    return {};
  }

  const sourceData = source as Frontmatter;
  const mediaCount = numberValue(sourceData.media_count);

  return compactObject({
    type: textValue(sourceData.type),
    subtype: textValue(sourceData.subtype),
    id: textValue(sourceData.id),
    url: textValue(sourceData.url),
    caption: textValue(sourceData.caption),
    mediaCount,
    crossPostSource: textValue(sourceData.cross_post_source),
  });
}

function classifyContentShape(source: string | undefined, data: Frontmatter): ContentShape {
  if (source === 'wordpress' || stringArray(data.tags).includes('wordpress')) {
    return 'post';
  }

  return 'story';
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

function locationText(value: unknown) {
  if (!value) {
    return undefined;
  }

  if (typeof value === 'object' && !(value instanceof Date)) {
    const data = value as Frontmatter;
    return textValue(data.name) || textValue(data.title) || textValue(data.location) || undefined;
  }

  return textValue(value) || undefined;
}

function numberValue(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  const text = textValue(value);

  if (!text) {
    return undefined;
  }

  const parsed = Number(text);

  return Number.isFinite(parsed) ? parsed : undefined;
}

function compactObject<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined && item !== ''),
  ) as T;
}

function cleanSiteKey(value: string) {
  const key = value.trim().toLowerCase();

  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(key)) {
    throw new Error(`Invalid CONTENT_SITE_KEY: ${value}`);
  }

  return key;
}

function siteNav(): SiteNavItem[] {
  return jsonArray<SiteNavItem>(process.env.CONTENT_SITE_NAV_JSON) ?? [
    { label: 'Home', href: '/' },
    { label: 'Posts', href: '/posts' },
    { label: 'Stories', href: '/stories' },
    { label: 'Images', href: '/images' },
  ];
}

function siteAuthor(): SiteAuthor {
  const parsed = jsonObject<SiteAuthor>(process.env.CONTENT_SITE_AUTHOR_JSON);

  if (parsed?.name) {
    return parsed;
  }

  return {
    name: process.env.CONTENT_SITE_AUTHOR_NAME || 'Jeff Patton',
    bio: process.env.CONTENT_SITE_AUTHOR_BIO || 'Just a dad who takes too many pictures.',
    imageUrl: process.env.CONTENT_SITE_AUTHOR_IMAGE_URL || '/assets/images/bio-photo.jpg',
    links: jsonArray<SiteAuthorLink>(process.env.CONTENT_SITE_AUTHOR_LINKS_JSON) ?? [
      { label: 'Website', href: 'https://patton-tech.com' },
      { label: 'Bluesky', href: 'https://bsky.app/profile/jeffpatton.bsky.social' },
      { label: 'GitHub', href: 'https://github.com/jeffpatton1971' },
      { label: 'Instagram', href: 'https://instagram.com/jspatton1971' },
    ],
  };
}

function optionalText(value: unknown) {
  const text = textValue(value);
  return text || undefined;
}

function jsonObject<T>(value: string | undefined) {
  if (!value?.trim()) {
    return undefined;
  }

  const parsed = JSON.parse(value) as T;
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : undefined;
}

function jsonArray<T>(value: string | undefined) {
  if (!value?.trim()) {
    return undefined;
  }

  const parsed = JSON.parse(value) as T[];
  return Array.isArray(parsed) ? parsed : undefined;
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
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
