# Generated Content Schema

The site is authored in Markdown and gallery Markdown records. `npm run build:content` turns that source into static JSON under `public/content`. The Azure Functions API reads those JSON artifacts from local disk or Azure Blob Storage and returns smaller filtered responses to React.

The JSON files are generated artifacts. Do not hand-edit files under `public/content`.

## Generated File Layout

```text
public/content/
  home.json
  site.json
  entries/index.json
  posts/index.json
  posts/yyyy/mm/dd/post-slug.json
  stories/index.json
  stories/yyyy/mm/dd/story-slug.json
  images/index.json
```

## Site Summary

`site.json` describes the published site and archive counts.

```ts
type SiteSummary = {
  generatedAt: string;
  key?: string;
  title: string;
  url?: string;
  nav?: SiteNavItem[];
  author?: SiteAuthor;
  entries: number;
  posts: number;
  stories: number;
  images: number;
};

type SiteNavItem = {
  label: string;
  href: string;
};

type SiteAuthor = {
  name: string;
  bio?: string;
  imageUrl?: string;
  links?: Array<{
    label: string;
    href: string;
  }>;
};
```

Current default site metadata can be overridden during content generation:

```powershell
$env:CONTENT_SITE_KEY = "kansaspattons"
$env:CONTENT_SITE_TITLE = "KansasPattons"
$env:CONTENT_SITE_URL = "https://kansaspattons.org"
$env:CONTENT_SITE_AUTHOR_JSON = '{"name":"Jeff Patton","bio":"Just a dad who takes too many pictures.","imageUrl":"/assets/images/bio-photo.jpg"}'
npm run build:content
```

## Home Summary

`home.json` is the compact home-page payload. The API combines it with `site.json` and returns a `site` object in `/api/home`.

```ts
type HomeSummary = {
  generatedAt: string;
  site?: SiteInfo;
  counts: {
    posts: number;
    stories: number;
    images: number;
  };
  recentEntries: EntrySummary[];
  recentPosts: EntrySummary[];
  recentStories: EntrySummary[];
  recentImages: ImageSummary[];
};
```

## Entry Summary

Entries come from `_posts/*.md`. Each entry is classified as either a WordPress-shaped `post` or social/media-shaped `story`.

```ts
type EntrySummary = {
  id: string;
  title: string;
  date: string;
  contentShape: "post" | "story";
  year: string;
  month: string;
  day: string;
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

type EntrySource = {
  type?: string;
  subtype?: string;
  id?: string;
  url?: string;
  caption?: string;
  mediaCount?: number;
  crossPostSource?: string;
};
```

Classification rule:

- `source.type: wordpress` becomes `contentShape: "post"`.
- A `wordpress` tag also becomes `contentShape: "post"`.
- Everything else currently becomes `contentShape: "story"`.

## Entry Detail

Detail files live under either `posts/yyyy/mm/dd/slug.json` or `stories/yyyy/mm/dd/slug.json`.

```ts
type EntryDocument = EntrySummary & {
  bodyHtml: string;
};
```

`bodyHtml` is rendered from Markdown with Jekyll includes removed and HTML sanitized.

## Image Summary

Images come from `_gallery/*.md`.

```ts
type ImageSummary = {
  id: string;
  title: string;
  date: string;
  year: string;
  month: string;
  day: string;
  route: string;
  rawUrl: string;
  thumbUrl: string;
  galleryId?: string;
  source?: string;
  sourceFilename?: string;
  postId?: string;
  postRoute?: string;
};
```

## Archive Index

`posts/index.json`, `stories/index.json`, `entries/index.json`, and `images/index.json` include archive navigation data.

```ts
type ArchiveYear = {
  year: string;
  count: number;
  href: string;
  months: ArchiveMonth[];
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
```

Entry indexes:

```ts
type EntryIndex = {
  generatedAt: string;
  posts: EntrySummary[];
  years: ArchiveYear[];
};
```

Image index:

```ts
type ImageIndex = {
  generatedAt: string;
  images: ImageSummary[];
  years: ArchiveYear[];
};
```

## API List Response

List endpoints return filtered, paged slices of the generated indexes.

```ts
type ApiListResponse<T> = {
  generatedAt: string;
  filters: {
    year?: string;
    month?: string;
    day?: string;
    cursor?: string;
    limit?: string;
  };
  years: ArchiveYear[];
  items: T[];
  page: {
    cursor: number;
    limit: number;
    total: number;
    nextCursor?: number;
  };
};
```

Image group responses use `groups` instead of `items` when `groupBy=year`, `groupBy=month`, or `groupBy=day`.

```ts
type ImageGroup = {
  key: string;
  label: string;
  href: string;
  count: number;
  images: ImageSummary[];
};
```
