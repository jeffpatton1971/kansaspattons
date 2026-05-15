# Platform Roadmap

This tracks the remaining work to move from the current KansasPattons migration
prototype to a reusable content platform for multiple sites.

## 1. Content Contract

Status: documented target shape with an initial validator.

- Use [`content-contract.md`](content-contract.md) as the shared envelope.
- Keep only three authored content types: `post`, `story`, and `gallery`.
- Treat images and videos as media assets, not authored content pages.
- Fold topical `tags` into `hashtags`. Initial migration is complete; `tags`
  should not be reintroduced.
- Keep `categories` provisional until a real site-section taxonomy is needed.
- Treat import `source` data as optional legacy metadata.
- Generate `taxonomy.json` so category and hashtag lists can be reviewed as
  data instead of pulled from ad hoc scripts.

Next work:

- Expand the validator from frontmatter/media checks into generated JSON contract checks.
- Move compiler/API/frontend types toward `contentType: "post" | "story" | "gallery"`.
- Remove compatibility fields after the frontend and API no longer need them.

## 2. Publish Pipeline

Status: workflow documented, implementation pending.

Target flow:

- `pull_request`: full validation and full site rebuild with no production publish.
- `push` to `main`: incremental publish for changed Markdown and changed local media.
- `workflow_dispatch`: manual full rebuild and republish.

Next work:

- Detect changed Markdown and local media files.
- Upload raw media and generated thumbnails to canonical Azure paths.
- Rewrite Markdown local media filenames to canonical `yyyy/mm/dd/filename.ext`
  keys.
- Generate JSON only for changed content plus affected indexes.
- Keep a manual full rebuild path for migrations and repair work.

## 3. `_gallery` Retirement

Status: generated image IDs and content references are canonicalized, but
`_gallery` still exists as import metadata.

Next work:

- Generate media indexes without requiring one Markdown file per image.
- Move needed captions, alt text, dates, and legacy data into generated media
  assets or source manifests.
- Stop creating new `_gallery` files.
- Remove `_gallery` after the publish pipeline can own media indexing.

## 4. Existing Content Cleanup

Status: most content now follows the direct-media versus gallery policy.

Next work:

- Continue treating `1-3` media items as direct content media.
- Continue treating `4+` meaningful media sets as galleries.
- Keep Facebook Mobile Uploads out of post/story/gallery archives.
- Add an Azure cleanup script for old source paths, but do not run it until the
  site is fully proven against canonical paths.

## 5. Shared API

Status: API lives in this repo but already has site-aware route families.

Target direction:

- Extract the API to a separate repo once the content contract stabilizes.
- Keep site-specific behavior in config, storage prefixes, and generated
  content artifacts.
- Add fixtures for at least two sites before extraction so site-specific logic
  cannot sneak into the API unnoticed.

Next endpoints:

- `/api/sites/{site}/hashtags/{hashtag}`
- `/api/sites/{site}/search`
- richer paging and filtering across posts, stories, galleries, and media

## 6. Frontend Discovery

Status: core archive and detail views exist.

Next work:

- Make hashtags clickable everywhere they render.
- Add a cross-type hashtag results page.
- Add category browse pages if categories continue to be useful as curated
  sections.
- Add search across title, summary, body, captions, hashtags, people, and
  locations.
- Finish video rendering and poster handling.
- Add stronger empty, loading, and error states for API-backed pages.

## 7. Validation And Test Suite

Status: initial content validation is wired up and passing with zero hard errors.

Next work:

- Promote more target-contract cleanup items into validator checks as the content is tightened.
- Add compiler tests.
- Add publish dry-run tests.
- Add API endpoint tests against fixture content.
- Add frontend smoke tests for key routes.
- Ensure Dependabot updates run the same validation/build/test suite before
  merge.
