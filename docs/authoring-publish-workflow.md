# Authoring And Publish Workflow

This is the intended long-term workflow for new content after the React/API migration.

## Goal

Images should be decoupled from posts, stories, and galleries.

- Posts, stories, and galleries are authored content.
- Images are reusable media assets.
- `/images` is a raw media library and archive browser.
- `/posts`, `/stories`, and `/galleries` reference image assets by ID/path.
- New image uploads should not require one Markdown page per image.
- The only final authored content types are `post`, `story`, and `gallery`.
- `tags` should collapse into `hashtags`; import/system labels should move to
  legacy metadata rather than user-facing filters.

The existing `_gallery/*.md` files are useful import metadata from the GitHub Pages/Jekyll migration. They should be treated as legacy input, not the long-term authoring model.

The target content envelope and child payload shapes are defined in
[`content-contract.md`](content-contract.md).

The planned replacement for legacy one-file-per-image `_gallery` metadata is
defined in [`media-manifest.md`](media-manifest.md).

## Draft Authoring

Draft Markdown may use simple local filenames. The author should not need to know the final Azure Blob path.

Example gallery draft:

```yaml
---
content_type: gallery
title: Pumpkin Patch
date: 2009-10-18
cover_image: img58363.jpg
images:
  - id: img58363.jpg
    caption:
    alt:
  - id: img58393.jpg
    caption:
    alt:
---
```

Example post draft with a small image set:

```yaml
---
content_type: post
title: Big Boy
date: 2013-05-29
cover_image: wp-20130529-002.jpg
images:
  - id: wp-20130529-002.jpg
    caption:
    alt:
---
```

Example post draft that references a gallery:

```yaml
---
content_type: post
title: Pumpkin Patch
date: 2009-10-18
related:
  - type: gallery
    id: pumpkin-patch-gallery
    rel: photos
---
```

Inline Markdown images can also use local filenames while the content is in draft form:

```md
We had a great day.

![Pumpkin patch](img58363.jpg)
```

The exact local folder convention is still open. Reasonable options are:

- Images sit beside the Markdown file during draft authoring.
- Images sit in a draft asset folder named for the post/story/gallery slug.
- Images are attached by an editor workflow before publish.

The important rule is that local filenames are temporary authoring references.

## Publish Rewrite

During publish, the action should convert local image filenames to canonical date-scoped media keys.

Canonical media key:

```text
yyyy/mm/dd/filename.ext
```

Canonical Azure paths:

```text
https://{account}.blob.core.windows.net/{siteId}/images/yyyy/mm/dd/filename.ext
https://{account}.blob.core.windows.net/{siteId}/thumbs/yyyy/mm/dd/filename.ext
```

The date comes from the content document date unless a future image-specific date override is added.

Draft gallery:

```yaml
cover_image: img58363.jpg
images:
  - id: img58363.jpg
    caption:
    alt:
  - id: img58393.jpg
```

Published gallery:

```yaml
cover_image: 2009/10/18/img58363.jpg
images:
  - id: 2009/10/18/img58363.jpg
    caption:
    alt:
  - id: 2009/10/18/img58393.jpg
```

Draft inline Markdown:

```md
![Pumpkin patch](img58363.jpg)
```

Published inline Markdown:

```md
![Pumpkin patch](2009/10/18/img58363.jpg)
```

## Publish Action Responsibilities

The publish action should:

1. Read changed or new Markdown content.
2. Identify image references in frontmatter and Markdown body.
3. Resolve local image files.
4. Compute canonical media keys from the content date and filename.
5. Check whether target blobs already exist.
6. Compare hashes when a target blob exists.
7. Upload raw images to `images/yyyy/mm/dd/filename.ext`.
8. Generate and upload thumbnails to `thumbs/yyyy/mm/dd/filename.ext`.
9. Rewrite the Markdown image references to canonical media keys.
10. Remove local image files from the repo after a successful upload and rewrite.
11. Build generated JSON from the canonical Markdown.

## GitHub Action Triggers

The target publish flow should separate validation from production publishing.

```text
pull_request       full validation and full site rebuild, no production publish
push to main       incremental publish for changed Markdown and local media
workflow_dispatch  manual full rebuild and republish
```

The pull-request rebuild protects the shared API/content contract before a merge.
The push-to-main incremental path keeps normal authoring fast. The manual full
rebuild remains available for migrations, dependency updates, index repairs, and
large cleanup work.

## Existing Content Canonicalization

Existing migrated content can be canonicalized with the image reference migration tool.

Dry run:

```powershell
npm run images:canonicalize
```

Write Markdown changes:

```powershell
npm run images:canonicalize:write
```

The tool:

- Builds a map from legacy `_gallery` image IDs to canonical `yyyy/mm/dd/filename.ext` media keys.
- Rewrites `_posts` frontmatter fields such as `cover_image` and `images[].id`.
- Writes `.tmp/image-canonicalization-report.json`.
- Reports missing references.
- Reports canonical path collisions.
- Refuses to write if canonical collisions exist.

After write mode, run a manual full rebuild:

```powershell
npm run build
```

The compiler then emits canonical image IDs, canonical raw/thumb URLs, and image routes shaped like:

```text
/images/yyyy/mm/dd/filename.ext
```

## Content Validation

Run validation after content migrations, before publishing, and in pull-request
checks.

```powershell
npm run content:validate
```

The validator writes `.tmp/content-validation-report.json`, exits nonzero for
hard publish blockers, and keeps target-contract cleanup counts separate from
errors.

Strict mode can be used later when we are ready to promote more cleanup items to
CI failures:

```powershell
npm run content:validate:strict
```

The current contract frontmatter migration can be checked and applied with:

```powershell
npm run content:contract:migrate
npm run content:contract:migrate:write
```

That migration aligns authored Markdown with the final `post` terminology by
rewriting old `article` compatibility values in `content_type`, `related.type`,
and companion relationship names.

User-facing taxonomy can be normalized with:

```powershell
npm run taxonomy:normalize
npm run taxonomy:normalize:write
```

That migration folds `tags` into normalized `hashtags`, removes import/source
labels such as `wordpress`, `instagram`, `facebook`, `gallery`, and `album`
from user-facing taxonomy fields, and normalizes duplicate category casing.
Hashtags are written without a leading `#`, lowercased, and with spaces removed.
Known typo aliases are also normalized, including common breakfast misspellings,
`tradtions`, `happythanksgivng`, and similar obvious one-off typos.

The content build emits the current aggregate taxonomy list to:

```text
public/content/taxonomy.json
dist/content/taxonomy.json
```

The category alias rules currently merge common wording variants such as
`Birthdays` into `Birthday`, `Fourth Of July` into `July 4th`, `New Years Day`
into `New Year`, and hyphenated event names into readable labels.

People and places can be moved out of categories with:

```powershell
npm run entities:normalize
npm run entities:normalize:write
```

That migration moves people-like category values into `people` and place-like
category values into `locations`, then removes those values from `categories`.
The current alias set handles `Nathan`, `Natalie`, `Sarah`, `Grandma`,
`Grandpa`, `CPLS`, `Cair Paravel Latin School`, `Cair Paravel`, and
`Crown Center`.

## Collision Policy

Filename collisions are acceptable during draft authoring because filenames are scoped at publish time.

After publish, `img58363.jpg` becomes:

```text
2009/10/18/img58363.jpg
```

If a blob already exists at the canonical key:

- If the existing blob hash matches the local file hash, reuse the existing asset.
- If the hash differs, fail the publish with a clear error or create a deterministic renamed key such as `img58363-2.jpg`.

The first implementation should prefer failing clearly over silently renaming or overwriting. Silent overwrites are not acceptable for archive media.

## Generated JSON Shape

Published content JSON should use canonical media keys in relationships.

```ts
type ContentImageRef = {
  id: string; // yyyy/mm/dd/filename.ext
  caption?: string;
  alt?: string;
};

type ImageAsset = {
  siteKey: string;
  id: string; // yyyy/mm/dd/filename.ext
  type: "image";
  date: string;
  rawUrl: string;
  thumbUrl: string;
  caption?: string;
  alt?: string;
  source?: string;
};
```

Posts and stories can either reference `images` directly or link to one or more galleries.

Galleries own ordered image lists and should be the preferred shape for meaningful image sets.

Hashtags should be emitted as normalized, clickable metadata. A hashtag route
should return posts, stories, and galleries together, sorted by date.

## Routing Implications

Long-term route meanings:

```text
/posts       authored article documents
/stories     authored story documents
/galleries   authored gallery documents
/images      raw media library browsing
```

An image may still be selectable in `/images`, but that view is a media-library view. It should not imply that every image is an authored page.

## Open Decisions

- Final local draft asset folder convention.
- Thumbnail generation library and dimensions.
- Video poster/thumbnail generation.
- Whether publish should fail on hash mismatch or auto-rename with a deterministic suffix.
- Whether EXIF dates can optionally override content dates for media-library sorting.
- Whether `categories` remain as curated site sections or are removed from the
  final user-facing model.
