# Content Model

The long-term content model is a small content graph. Articles, stories, galleries, and images share enough metadata to be searched and rendered together, but each content type has a payload that matches how people actually use it.

## Principles

- Markdown remains the authoring format for human-written content.
- Images are first-class assets and can be reused by articles, stories, and galleries.
- Articles, stories, and galleries have stable IDs and routes.
- Site identity is metadata, not business logic. Each repo can publish with its own `CONTENT_SITE_KEY`.
- The generated JSON can evolve while old compatibility fields remain during migration.

## Shared Metadata

All first-class content should resolve to this base shape.

```ts
type ContentType = "article" | "story" | "gallery";
type ContentStatus = "draft" | "published" | "archived";

type ContentBase = {
  siteKey: string;
  id: string;
  type: ContentType;
  title: string;
  slug: string;
  route: string;
  date: string;
  status: ContentStatus;
  authors: string[];
  tags: string[];
  categories: string[];
  summary?: string;
  coverImageId?: string;
  related?: ContentLink[];
};

type ContentLink = {
  type?: ContentType;
  id: string;
  title?: string;
  route?: string;
  rel?: string;
};
```

## Articles

Articles are the traditional blog-post shape and live under `/posts`.

```ts
type Article = ContentBase & {
  type: "article";
  bodyMarkdown: string;
  bodyHtml: string;
  imageIds: string[];
  galleryIds: string[];
};
```

Authoring example:

```yaml
---
title: "Christmas 2025"
content_type: article
date: 2010-12-25 01:34:00
authors:
  - Jeff
summary: "A Christmas family update that uses a related image gallery."
tags:
  - wordpress
categories:
  - holidays
gallery: "wordpress-2010-12-25-013400-december-25-2010"
---
```

An article can embed images directly in Markdown, reference one or more galleries, or do both.

## Stories

Stories are image-forward social posts and live under `/stories`. They can still carry text, but the images are the primary payload.

```ts
type Story = ContentBase & {
  type: "story";
  caption?: string;
  imageIds: string[];
  galleryIds: string[];
  hashtags: string[];
  handles: string[];
  location?: string;
};
```

Authoring example:

```yaml
---
title: "Better late than never"
content_type: story
date: 2026-04-16 19:48:04
authors:
  - Jeff Patton
summary: "Better late than never"
source:
  type: instagram
gallery: "instagram-2026-04-16-194804-better-late-than-never"
hashtags: []
handles: []
---
```

## Galleries

Galleries are image collections and live under `/galleries`. A gallery may stand alone, or an article/story may reference it.

```ts
type Gallery = ContentBase & {
  type: "gallery";
  imageIds: string[];
  imageCount: number;
  coverImageId: string;
  descriptionMarkdown?: string;
  descriptionHtml?: string;
};
```

Current generated galleries are derived from image records grouped by `gallery`. The first related article/story, when one exists, supplies the gallery title, summary, authors, tags, categories, and related content link.

Future explicit gallery authoring can use a Markdown file that looks like:

```yaml
---
title: "Field Trip"
content_type: gallery
date: 2024-05-01
authors:
  - Jeff Patton
summary: "Images from the field trip."
cover_image: "field-trip-001"
gallery: "field-trip-2024"
tags:
  - school
---
```

Current sampled gallery authoring uses an existing named Facebook album post:

```yaml
---
title: "Christmas 2008"
content_type: gallery
slug: christmas-2008
date: 2008-12-26 08:56:54
authors:
  - Jeff Patton
summary: "A Facebook album preserved as a named Christmas gallery."
gallery: facebook-2008-12-26-085654-christmas-2008
cover_image: facebook-2008-12-26-085654-christmas-2008-0001
tags:
  - facebook
  - album
categories:
  - facebook
  - album
---
```

During generation, this source metadata is merged into the gallery produced from matching image records. Its legacy `/blog/...` URL redirects to the gallery route.

Facebook album imports are treated as galleries by default. Facebook's catch-all `Mobile Uploads` albums are the exception: they are marked with `exclude_from_archives: true` and are not published as galleries or story entries. Their individual image records still remain available through `/images` by date.

## Images

Images are reusable assets.

```ts
type ImageAsset = {
  siteKey: string;
  id: string;
  type: "image";
  title: string;
  date: string;
  route: string;
  rawUrl: string;
  thumbUrl: string;
  caption?: string;
  alt?: string;
  galleryId?: string;
  postId?: string;
  postRoute?: string;
  tags?: string[];
};
```

## Routing

```text
/posts       -> articles
/stories     -> stories
/galleries   -> galleries
/images      -> image asset/archive browsing
```

## Migration Notes

All Markdown posts in `_posts` have been normalized to declare the source content shape explicitly. Each post now carries:

- `content_type`
- `slug`
- `post_id`
- `status`
- `authors`
- `summary`

The normalizer can be rerun safely:

```powershell
npm run normalize:posts -- --dry-run
npm run normalize:posts
```

The current JSON still includes compatibility fields such as `contentShape: "post" | "story"` and `excerpt`. New code should prefer:

- `type` over `contentShape`.
- `summary` over `excerpt` for list cards.
- `authors` over `author`.
- `imageIds` and `galleryIds` for relationships.

Once the React UI and API fully use the new fields, the compatibility fields can be removed in a later cleanup.
