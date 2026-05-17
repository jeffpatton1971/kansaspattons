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
- `tags` should collapse into `hashtags`; import/system labels should remain in
  legacy metadata rather than user-facing filters.

The target content envelope and child payload shapes are defined in
[`content-contract.md`](content-contract.md).

The replacement for legacy one-file-per-image media metadata is defined in
[`media-manifest.md`](media-manifest.md).

Site presentation settings are defined in
[`site-configuration.md`](site-configuration.md).

GitHub Actions publishing is defined in [`github-actions.md`](github-actions.md).

The current reference files for the target post/story/gallery shapes are listed
in [`golden-content-examples.md`](golden-content-examples.md).

## Draft Authoring

Draft Markdown may use simple local filenames. The author should not need to know the final Azure Blob path.

Example post with no images:

```yaml
---
content_type: post
title: Site Update
slug: site-update
post_id: 2026-05-16-site-update
date: 2026-05-16 09:00:00
status: published
authors:
  - Jeff Patton
hashtags:
  - siteupdate
categories:
  - Family
people: []
locations: []
summary: "A short update about the site."
---
```

Example gallery draft:

```yaml
---
content_type: gallery
title: Pumpkin Patch
slug: pumpkin-patch
post_id: 2009-10-18-pumpkin-patch-gallery
date: 2009-10-18
status: published
authors:
  - Jeff Patton
hashtags:
  - pumpkinpatch
categories:
  - Family
people:
  - Natalie
locations: []
summary: "Fourteen photos from the family pumpkin patch trip."
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
slug: big-boy
post_id: 2013-05-29-big-boy
date: 2013-05-29
status: published
authors:
  - Jeff Patton
people:
  - Nathan
hashtags: []
categories: []
locations: []
summary: "Nathan went potty like a big boy."
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
slug: pumpkin-patch
post_id: 2009-10-18-pumpkin-patch
date: 2009-10-18
status: published
authors:
  - Jeff Patton
hashtags:
  - pumpkinpatch
categories:
  - Family
people:
  - Natalie
locations: []
summary: "A family trip to the pumpkin patch."
related:
  - type: gallery
    id: pumpkin-patch-gallery
    rel: photos
---
```

Example story draft with images:

```yaml
---
content_type: story
title: Breakfast
slug: breakfast
post_id: 2026-04-12-105120-breakfast
date: 2026-04-12 10:51:20
status: published
authors:
  - Jeff Patton
hashtags:
  - breakfast
categories: []
people: []
locations: []
summary: "Breakfast."
cover_image: breakfast-01.jpg
images:
  - id: breakfast-01.jpg
    caption:
    alt:
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
11. Update `content/media/index.json`.
12. Build generated JSON from the canonical Markdown and media manifest.

Use the publish planner to see what would be affected by the current Git working
tree:

```powershell
npm run publish:plan
```

The planner writes `.tmp/publish-plan-report.json` and reports changed content
Markdown, changed local media files, affected generated JSON, affected indexes,
planned media uploads, planned media manifest assets, planned Markdown rewrites,
and publish-plan issues. It computes SHA-256 hashes and byte sizes for local
draft media, maps local references to canonical blob paths, and detects manifest
key collisions before anything is uploaded. It does not write files or upload
blobs.

The media upload dry run uses that same plan and shows the exact Azure Blob
operations that would run:

```powershell
npm run publish:media:dry-run
```

When the dry run looks right, upload the planned local media:

```powershell
npm run publish:media
```

`publish:media` uploads only planned media references whose manifest action is
`add`. Existing manifest-backed media with a matching SHA-256 hash is skipped,
and existing target blobs are not overwritten unless `--overwrite` is supplied
explicitly. Image uploads generate resized thumbnails into
`.tmp/media-derivatives` and upload them to
`thumbs/yyyy/mm/dd/filename.ext`. Video uploads generate poster images with
`ffmpeg-static` and upload those posters under the `thumbs` prefix as `.jpg`
files.

Derivative generation can be tuned with:

```powershell
$env:MEDIA_THUMBNAIL_WIDTH = "960"
$env:MEDIA_THUMBNAIL_QUALITY = "82"
$env:MEDIA_POSTER_TIMESTAMP = "00:00:01"
```

The `--skip-derivatives` flag keeps the old fallback behavior for images only:
the original image is uploaded to the thumbnail path instead of a resized
thumbnail. That flag is intended as an emergency escape hatch, not the normal
publish path.

The planner is intentionally one step earlier than the generated-content publish
dry run:

```powershell
npm run publish:prepare
```

`publish:prepare` runs the same checks as `publish:plan`, but when there are no
planning issues it rewrites local draft media references in changed Markdown to
canonical media keys and appends planned assets to `content/media/index.json`.
It does not remove local media files or publish generated JSON.

After media upload and source prep, preview the local draft media cleanup:

```powershell
npm run publish:cleanup-media
```

When the cleanup dry run looks right, remove the uploaded local draft media:

```powershell
npm run publish:cleanup-media:write
```

The cleanup command reads `.tmp/publish-plan-report.json` and
`.tmp/publish-media-result.json`. It only deletes local media files when the
Markdown/frontmatter no longer references the local filename and the raw media
upload was verified, or when the media was marked `reuse-existing` by the
manifest hash check.

The generated-content publish dry run remains:

```powershell
npm run publish:content:dry-run
```

For normal pushes, publish only the generated JSON paths affected by the
current publish plan:

```powershell
npm run publish:content:incremental:dry-run
npm run publish:content:incremental
```

The incremental content build still evaluates the content graph so archive
indexes, taxonomy, and related content stay correct, but it writes and publishes
only the JSON paths listed in `.tmp/publish-plan-report.json`. Changed content
Markdown also marks `search/index.json` as affected so search stays current
with normal incremental publishes.

Use `publish:plan` to reason about authoring/source changes. Use
`publish:media:dry-run` and `publish:media` to upload local draft media to
canonical storage paths. Use `publish:prepare` to apply source-side canonical
media rewrites and manifest additions. Use `publish:content:incremental:dry-run`
to reason about generated JSON artifact upload for normal changes. Keep
`publish:content:dry-run` for manual full republishes.

The current safe sequence is:

```powershell
npm run publish:plan
npm run publish:media:dry-run
npm run publish:media
npm run publish:prepare
npm run publish:cleanup-media
npm run publish:cleanup-media:write
npm run publish:content:incremental:dry-run
npm run publish:content:incremental
```

## GitHub Action Triggers

The target publish flow should separate validation from production publishing.

```text
pull_request       full validation and full site rebuild, no production publish
push to main       incremental publish for changed Markdown and local media
tag push           full rebuild and republish for versioned site changes
workflow_dispatch  manual full rebuild and republish
```

The pull-request rebuild protects the shared API/content contract before a merge.
The push-to-main incremental path keeps normal authoring fast. Tag pushes are
the release path for larger site-structure changes and rebuild all generated
content before deploying the React site to GitHub Pages. The manual full rebuild
remains available for migrations, dependency updates, index repairs, and large
cleanup work.

For dependency updates and pull requests, the current combined verification
command is:

```powershell
npm run test
```

That command runs the site build, Playwright smoke tests, and the API-local test
suite. See [`testing.md`](testing.md) for details.

## Existing Content Canonicalization

Existing migrated content has been canonicalized. Authored Markdown now uses
canonical media keys, and the compiler emits image routes shaped like:

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

Current hard blockers include invalid content types, legacy `article`
terminology, missing required metadata, duplicate IDs/routes, non-canonical
media keys, external or absolute media URLs in authored references, media keys
missing from `content/media/index.json`, gallery cover/image mismatches, source
labels in user-facing taxonomy, people/place values left in categories, and
missing related content.

The report also includes the count of unique media IDs referenced by authored
content. That count helps verify the site is moving toward manifest-backed media
instead of depending on one Markdown document per image.

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

The shared alias source for validation and cleanup scripts is:

```text
content/taxonomy.aliases.json
```

The content build emits the current aggregate taxonomy list to:

```text
public/content/taxonomy.json
dist/content/taxonomy.json
```

The content build also emits the cross-type search artifact:

```text
public/content/search/index.json
dist/content/search/index.json
```

That index covers posts, stories, and galleries. The API reads it through:

```text
/api/search?q={term}
/api/sites/{site}/search?q={term}
```

Taxonomy terms are intended to be browsable:

```text
/hashtags/{slug}
/categories/{slug}
/people/{slug}
/locations/{slug}
```

The matching API shape is:

```text
/api/taxonomy/{family}/{slug}
/api/sites/{site}/taxonomy/{family}/{slug}
```

Each term response returns related posts, stories, and galleries together,
sorted by date.

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
- Whether publish should fail on hash mismatch or auto-rename with a deterministic suffix.
- Whether EXIF dates can optionally override content dates for media-library sorting.
- Whether `categories` remain as curated site sections or are removed from the
  final user-facing model.
