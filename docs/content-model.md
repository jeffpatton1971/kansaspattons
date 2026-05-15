# Content Model

The long-term content model is a small content graph. Articles, stories, galleries, and images share enough metadata to be searched and rendered together, but each content type has a payload that matches how people actually use it.

## Principles

- Markdown remains the authoring format for human-written content.
- Images are first-class assets and can be reused by articles, stories, and galleries.
- Articles, stories, and galleries have stable IDs and routes.
- Site identity is metadata, not business logic. Each repo can publish with its own `CONTENT_SITE_KEY`.
- The generated JSON can evolve while old compatibility fields remain during migration.

The planned authoring and publish rewrite workflow is documented in
[`authoring-publish-workflow.md`](authoring-publish-workflow.md).

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

type ContentImageRef = {
  id: string;
  caption?: string;
  alt?: string;
};
```

## Image Relationship Policy

Image relationships are authored according to the size and meaning of the image set:

- `1-3` images belong directly to the article or story with rich `images` frontmatter.
- `4+` images become a first-class `content_type: gallery` document.
- Articles and stories link to their gallery with `related`, and the React detail view renders that gallery inline as well as under `/galleries`.
- Facebook `Mobile Uploads` albums remain excluded from post/story/gallery archives because they are catch-all import containers rather than meaningful authored galleries.

## Articles

Articles are the traditional blog-post shape and live under `/posts`.

```ts
type Article = ContentBase & {
  type: "article";
  bodyMarkdown: string;
  bodyHtml: string;
  images?: ContentImageRef[];
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
related:
  - type: gallery
    id: "wordpress-2010-12-25-013400-december-25-2010"
    rel: photos
---
```

An article can embed images directly in Markdown, attach a small image set with `images`, or reference a gallery with `related`.

Single-image or small image sets should usually use direct image references:

```yaml
cover_image: 2013-05-29-wp-20130529-002
images:
  - id: 2013-05-29-wp-20130529-002
    caption:
    alt:
```

Meaningful photo sets should use a gallery instead of pretending every attached image set is a gallery.

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
cover_image: instagram-2026-04-16-194804-better-late-than-never-01
images:
  - id: instagram-2026-04-16-194804-better-late-than-never-01
    caption:
    alt:
  - id: instagram-2026-04-16-194804-better-late-than-never-02
    caption:
    alt:
hashtags: []
handles: []
---
```

## Galleries

Galleries are image collections and live under `/galleries`. A gallery may stand alone, or an article/story may reference it.

```ts
type Gallery = ContentBase & {
  type: "gallery";
  images?: ContentImageRef[];
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
related:
  - type: article
    id: field-trip
    rel: companion-article
---
```

Named Facebook album posts use the same gallery shape:

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

Example of the newer rich gallery authoring shape:

```yaml
gallery: gallery-2009-10-18
cover_image: 2009-10-18-img58363
images:
  - id: 2009-10-18-img58363
    caption:
    alt:
  - id: 2009-10-18-img58393
    caption:
    alt:
```

Facebook album imports are treated as galleries by default. Facebook's catch-all `Mobile Uploads` albums are the exception: they are marked with `exclude_from_archives: true` and are not published as galleries or story entries. Their individual image records still remain available through `/images` by date.

## Images

Images are reusable assets, not authored content pages. Posts, stories, and galleries should reference image assets, while `/images` should behave as a raw media library and archive browser.

Canonical image URLs should be derived from the site asset base and image date parts:

```text
{assetBaseUrl}/{siteId}/images/{year}/{month}/{day}/{filename}
{assetBaseUrl}/{siteId}/thumbs/{year}/{month}/{day}/{filename}
```

For the current Azure Blob layout, `{siteId}` is the blob container name. Existing `raw_url` and `thumb_url` frontmatter can remain during migration, but new compiler code should prefer computed canonical URLs once the blobs have been copied.

For new authored content, draft Markdown may use simple local filenames. The publish action should upload the assets, rewrite those local filenames to canonical media keys, and remove the local image files from the repo.

Draft:

```yaml
cover_image: img58363.jpg
images:
  - id: img58363.jpg
```

Published:

```yaml
cover_image: 2009/10/18/img58363.jpg
images:
  - id: 2009/10/18/img58363.jpg
```

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
