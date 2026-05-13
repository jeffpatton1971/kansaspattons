import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import MarkdownIt from 'markdown-it';
import sanitizeHtml from 'sanitize-html';
const root = process.cwd();
const publicRoot = path.join(root, 'public');
const outputRoot = path.join(publicRoot, 'content');
const postsRoot = path.join(root, '_posts');
const galleryRoot = path.join(root, '_gallery');
const markdown = new MarkdownIt({
    html: false,
    linkify: true,
    typographer: true,
});
const sanitizeOptions = {
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
    await writeJson('site.json', {
        generatedAt: new Date().toISOString(),
        title: 'KansasPattons',
        posts: posts.length,
        images: images.length,
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
    const posts = [];
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
        const route = `/posts/${parts.year}/${parts.month}/${parts.day}/${slug}`;
        const legacyUrl = `/blog/${parts.year}/${parts.month}/${parts.day}/${slug}.html`;
        const document = {
            id,
            title,
            date,
            slug,
            route,
            legacyUrl,
            excerpt: excerptFromMarkdown(cleanMarkdown),
            categories: stringArray(parsed.data.categories),
            tags: stringArray(parsed.data.tags),
            sourceType: sourceType(parsed.data),
            galleryIds,
            bodyHtml,
            ...parts,
        };
        await writeJson(`posts/${parts.year}/${parts.month}/${parts.day}/${slug}.json`, document);
        const { bodyHtml: _bodyHtml, ...summary } = document;
        posts.push(summary);
    }
    posts.sort((a, b) => b.date.localeCompare(a.date));
    await writeJson('posts/index.json', {
        generatedAt: new Date().toISOString(),
        posts,
        years: archiveYears(posts, '/posts'),
    });
    return posts;
}
async function buildImages(posts) {
    const files = await markdownFiles(galleryRoot);
    const postRoutesById = new Map(posts.map((post) => [post.id, post.route]));
    const images = [];
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
async function markdownFiles(directory) {
    const files = await readdir(directory);
    return files.filter((file) => file.endsWith('.md')).sort();
}
async function writeJson(relativePath, value) {
    const fullPath = path.join(outputRoot, relativePath);
    await mkdir(path.dirname(fullPath), { recursive: true });
    await writeFile(fullPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
function archiveYears(items, basePath) {
    const years = new Map();
    for (const item of items) {
        if (!years.has(item.year)) {
            years.set(item.year, new Map());
        }
        const months = years.get(item.year);
        if (!months.has(item.month)) {
            months.set(item.month, new Map());
        }
        const days = months.get(item.month);
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
function partsFromFilename(filename) {
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
function partsFromFrontmatter(data) {
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
function slugFromPostFilename(filename) {
    return filename.replace(/^\d{4}-\d{2}-\d{2}-/, '');
}
function galleryIncludes(content, data) {
    const ids = new Set();
    const frontmatterGallery = textValue(data.gallery);
    if (frontmatterGallery) {
        ids.add(frontmatterGallery);
    }
    for (const match of content.matchAll(/{%\s*include\s+gallery\.html\s+gallery="([^"]+)"\s*%}/g)) {
        ids.add(match[1]);
    }
    return [...ids];
}
function removeJekyllIncludes(content) {
    return content.replace(/{%\s*include\s+[^%]+%}/g, '').trim();
}
function normalizedDate(value, fallback) {
    if (value instanceof Date && !Number.isNaN(value.valueOf())) {
        return value.toISOString();
    }
    const text = textValue(value);
    if (text) {
        const normalized = text.includes('T') ? text : text.replace(' ', 'T');
        return normalized.length === 10 ? `${normalized}T00:00:00` : normalized;
    }
    return `${fallback.year}-${fallback.month}-${fallback.day}T00:00:00`;
}
function excerptFromMarkdown(content) {
    return content
        .replace(/{%[^%]+%}/g, ' ')
        .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
        .replace(/\[[^\]]+]\([^)]*\)/g, (match) => match.replace(/^\[|\]\([^)]*\)$/g, ''))
        .replace(/[#>*_`~-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 240);
}
function sourceType(data) {
    const source = data.source;
    if (source && typeof source === 'object' && 'type' in source) {
        return textValue(source.type);
    }
    return undefined;
}
function stringArray(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    return value.map((item) => textValue(item)).filter(Boolean);
}
function numberText(value) {
    if (typeof value === 'number') {
        return String(value).padStart(2, '0');
    }
    const text = textValue(value);
    return text ? text.padStart(2, '0') : '';
}
function textValue(value) {
    if (value === undefined || value === null) {
        return '';
    }
    if (value instanceof Date && !Number.isNaN(value.valueOf())) {
        return value.toISOString();
    }
    return String(value).trim();
}
function titleFromSlug(slug) {
    return slug
        .replace(/^\d{6}-/, '')
        .replace(/[-_]+/g, ' ')
        .replace(/\b\w/g, (character) => character.toUpperCase());
}
function sum(values) {
    return values.reduce((total, value) => total + value, 0);
}
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
