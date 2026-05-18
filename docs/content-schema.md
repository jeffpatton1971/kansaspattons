# Generated Content Schema

The site is authored in Markdown and gallery Markdown records. `npm run build:content` turns that source into static JSON under `public/content`. The Azure Functions API reads those JSON artifacts from local disk or Azure Blob Storage and returns smaller filtered responses to React.

The JSON files are generated artifacts. Do not hand-edit files under `public/content`.

For the final shared content envelope, see [`content-contract.md`](content-contract.md).
For migration context and authoring examples, see [`content-model.md`](content-model.md).
For site title, nav, banner, footer, and theme configuration, see
[`site-configuration.md`](site-configuration.md).

Migration note: the current generated schema still includes compatibility names
such as `type: "article"`, `contentShape`, `tags`, `categories`, and `source`.
The target shared contract uses the three authored content types `post`,
`story`, and `gallery`, folds topical tags into `hashtags`, and treats source
data as optional legacy metadata.

Authored Markdown has now been normalized so topical `tags` are folded into
`hashtags`; new content should not add a `tags` field.

## Generated File Layout

```text
public/content/
  home.json
  site.json
  taxonomy.json
  search/index.json
  media/index.json
  entries/index.json
  posts/index.json
  posts/yyyy/mm/dd/post-slug.json
  stories/index.json
  stories/yyyy/mm/dd/story-slug.json
  galleries/index.json
  galleries/yyyy/mm/dd/gallery-slug.json
  images/index.json
```

## Search Index

`search/index.json` is the generated cross-type discovery index for posts,
stories, and galleries. It is intentionally separate from the raw media library;
media assets can be discovered through their owning content or gallery.

```ts
type SearchIndex = {
  generatedAt: string;
  items: SearchIndexItem[];
};

type SearchIndexItem = {
  siteKey: string;
  id: string;
  type: "post" | "story" | "gallery";
  title: string;
  date: string;
  year: string;
  month: string;
  day: string;
  route: string;
  summary: string;
  authors: string[];
  people: string[];
  categories: string[];
  hashtags: string[];
  locations: string[];
  imageCount?: number;
  coverImage?: {
    id: string;
    rawUrl: string;
    thumbUrl: string;
    alt: string;
  };
  searchText: string;
};
```

The API strips `searchText` from result payloads and adds `score` plus
`matchedTerms`:

```text
/api/{site}/search?q={term}
```

## Taxonomy Index

`taxonomy.json` is the generated review/browse index for user-facing metadata.
It is built from normalized `hashtags`, `categories`, `people`, and `locations`
on posts, stories, and galleries.

```ts
type TaxonomyIndex = {
  generatedAt: string;
  hashtags: TaxonomyTerm[];
  categories: TaxonomyTerm[];
  people: TaxonomyTerm[];
  locations: TaxonomyTerm[];
};

type TaxonomyTerm = {
  value: string;
  label: string;
  slug: string;
  count: number;
  href: string;
  items: TaxonomyContentRef[];
};

type TaxonomyContentRef = {
  id: string;
  type: "post" | "story" | "gallery";
  title: string;
  date: string;
  route: string;
};
```

Current category aliases normalize obvious wording variants:

```text
Birthdays -> Birthday
July Fourth / Fourth Of July / 4th Of July -> July 4th
New Years / New Years Day / New Year's Day -> New Year
Field-Day -> Field Day
Field-Trips -> Field Trips
First-Grade -> First Grade
Last-Day -> Last Day
```

People and places are generated as separate metadata indexes instead of being
kept as categories:

```text
Nathan / Natalie / Sarah / Grandma / Grandpa -> people
CPLS / Cair Paravel Latin School / Cair Paravel -> locations: Cair Paravel
Crown-Center / Crown Center -> locations: Crown Center
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
  banner?: SiteBanner;
  footer?: SiteFooter;
  theme?: SiteTheme;
  entries: number;
  posts: number;
  stories: number;
  galleries: number;
  images: number;
  sourceCounts?: SourceCount[];
};

type SourceCount = {
  source: "wordpress" | "instagram" | "facebook";
  label: string;
  count: number;
  href: string;
};

type SiteNavItem = {
  label: string;
  href: string;
  icon?: string;
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

type SiteBanner = {
  eyebrow?: string;
  title?: string;
  text?: string;
  backgroundImage?: string;
  backgroundPosition?: string;
  backgroundSize?: string;
};

type SiteFooter = {
  brandText?: string;
  text?: string;
  links?: SiteNavItem[];
  copyright?: string;
};

type SiteTheme = {
  fontFamily?: string;
  background?: string;
  text?: string;
  surface?: string;
  surfaceRaised?: string;
  border?: string;
  muted?: string;
  accent?: string;
  accentStrong?: string;
  bannerBackground?: string;
  headerBackground?: string;
  footerBackground?: string;
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

`home.json` is the compact home-page payload. The shared API combines it with `site.json` and returns a `site` object in `/api/{site}/home`.

```ts
type HomeSummary = {
  generatedAt: string;
  site?: SiteInfo;
  counts: {
    posts: number;
    stories: number;
    galleries: number;
    images: number;
  };
  recentEntries: Array<EntrySummary | GallerySummary>;
  recentPosts: EntrySummary[];
  recentStories: EntrySummary[];
  recentGalleries: GallerySummary[];
  recentImages: ImageSummary[];
  sourceCounts?: SourceCount[];
};
```

## Entry Summary

Entries come from `_posts/*.md`. Each entry is classified as either a WordPress-shaped `post` or social/media-shaped `story`.

```ts
type EntrySummary = {
  siteKey: string;
  id: string;
  type: "article" | "story";
  title: string;
  date: string;
  status: "draft" | "published" | "archived";
  contentShape: "post" | "story";
  year: string;
  month: string;
  day: string;
  slug: string;
  route: string;
  legacyUrl: string;
  authors: string[];
  summary: string;
  excerpt: string;
  categories: string[];
  tags: string[];
  hashtags: string[];
  people: string[];
  locations: string[];
  handles: string[];
  location?: string;
  sourceType?: string;
  source?: EntrySource;
  galleryIds: string[];
  imageIds: string[];
  related: ContentLink[];
  caption?: string;
  coverImage?: {
    id: string;
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

type ContentLink = {
  type?: "article" | "story" | "gallery";
  id: string;
  title?: string;
  route?: string;
  rel?: string;
};
```

Classification rule:

- All `_posts` Markdown files are now expected to carry explicit `content_type`, `slug`, `post_id`, `status`, `authors`, and `summary` frontmatter.
- Direct post images can be authored with rich `images` frontmatter. The compiler resolves those entries into generated `imageIds` and `coverImage`.
- The source migration policy treats `1-3` images as direct `images` attachments and `4+` images as first-class galleries referenced through `related`.
- `content_type: article` becomes `type: "article"` and `contentShape: "post"`.
- `content_type: story` becomes `type: "story"` and `contentShape: "story"`.
- `content_type: gallery` becomes a gallery metadata source and is merged into the generated gallery with the same `gallery` ID.
- Facebook album imports become galleries by default.
- Facebook `Mobile Uploads` album imports are excluded from post/story/gallery archives when `exclude_from_archives: true` is set. The individual images remain in `images/index.json`.
- Without an explicit `content_type`, `source.type: wordpress` becomes `type: "article"`.
- A `wordpress` tag also becomes `type: "article"`.
- Everything else currently becomes `type: "story"`.

## Entry Detail

Detail files live under either `posts/yyyy/mm/dd/slug.json` or `stories/yyyy/mm/dd/slug.json`.

```ts
type EntryDocument = EntrySummary & {
  bodyMarkdown: string;
  bodyHtml: string;
};
```

`bodyHtml` is rendered from Markdown with Jekyll includes removed and HTML sanitized.

## Image Summary

Images come from `content/media/index.json`, and generated image IDs are
canonical media keys rather than Markdown document IDs. The current build
requires `content/media/index.json` and emits the same manifest to
`public/content/media/index.json`.

Example:

```text
id: 2009/10/18/img58363.jpg
route: /images/2009/10/18/img58363.jpg
rawUrl: https://prdwebappstorage.blob.core.windows.net/kansaspattons/images/2009/10/18/img58363.jpg
thumbUrl: https://prdwebappstorage.blob.core.windows.net/kansaspattons/thumbs/2009/10/18/img58363.jpg
```

```ts
type ImageSummary = {
  siteKey: string;
  id: string;
  type: "image";
  kind?: "image" | "video";
  title: string;
  date: string;
  year: string;
  month: string;
  day: string;
  route: string;
  rawUrl: string;
  thumbUrl: string;
  caption?: string;
  alt?: string;
  galleryId?: string;
  source?: string;
  sourceFilename?: string;
  postId?: string;
  postRoute?: string;
};
```

## Gallery Summary

Galleries are generated from image records grouped by `gallery`.

```ts
type GallerySummary = {
  siteKey: string;
  id: string;
  type: "gallery";
  title: string;
  date: string;
  status: "draft" | "published" | "archived";
  year: string;
  month: string;
  day: string;
  slug: string;
  route: string;
  legacyUrl?: string;
  authors: string[];
  summary: string;
  categories: string[];
  tags: string[];
  hashtags: string[];
  people: string[];
  locations: string[];
  sourceType?: string;
  source?: EntrySource;
  imageIds: string[];
  imageCount: number;
  coverImageId: string;
  coverImage: {
    id: string;
    rawUrl: string;
    thumbUrl: string;
    alt: string;
  };
  related: ContentLink[];
};
```

Gallery detail files add the expanded image payload:

```ts
type GalleryDocument = GallerySummary & {
  descriptionMarkdown?: string;
  descriptionHtml?: string;
  images: ImageSummary[];
};
```

## Archive Index

`posts/index.json`, `stories/index.json`, `galleries/index.json`, `entries/index.json`, and `images/index.json` include archive navigation data.

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

Gallery index:

```ts
type GalleryIndex = {
  generatedAt: string;
  galleries: GallerySummary[];
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
    source?: string;
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

Image list endpoints also accept relationship filters:

```text
GET /api/images?imageId=2013-05-29-wp-20130529-002
GET /api/images?galleryId=gallery-2009-10-18
GET /api/images?imageId=one,two&galleryId=gallery-id
```
