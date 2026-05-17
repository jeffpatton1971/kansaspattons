# Platform Roadmap

This tracks the remaining work to move from the current KansasPattons migration
prototype to a reusable content platform for multiple sites.

For the immediate execution checklist, see
[`near-term-feature-completion.md`](near-term-feature-completion.md).

## 1. Content Contract

Status: documented target shape with an initial validator.

- Use [`content-contract.md`](content-contract.md) as the shared envelope.
- Keep only three authored content types: `post`, `story`, and `gallery`.
- Treat images and videos as media assets, not authored content pages.
- Fold topical `tags` into `hashtags`. Initial migration is complete; `tags`
  should not be reintroduced.
- Keep `categories` provisional until a real site-section taxonomy is needed.
- Keep people and places out of categories; generated content now carries
  `people` and `locations` metadata.
- Treat import `source` data as optional legacy metadata.
- Generate `taxonomy.json` so hashtag, category, people, and location lists can
  be reviewed as data instead of pulled from ad hoc scripts.

Next work:

- Expand the validator from frontmatter/media checks into generated JSON contract checks.
- Move compiler/API/frontend types toward `contentType: "post" | "story" | "gallery"`.
- Remove compatibility fields after the frontend and API no longer need them.

## 1a. Site Configuration

Status: initial config-driven shell is wired up.

- Use [`site-configuration.md`](site-configuration.md) for the editable site
  personality file.
- `content/site.config.json` controls title, URL, nav, author card, home
  banner, footer links/text, and theme variables.
- The content build emits those values in `site.json`.
- The API includes them in `/api/home`.
- The React shell reads the API-provided site object for the masthead, nav,
  banner, footer, font, and color variables.

Next work:

- Decide whether each sibling site keeps this config in its own repo or whether
  a shared theme package supplies starter configs.
- Add visual smoke tests for at least one alternate config.

## 2. Publish Pipeline

Status: workflow documented with dry-run planning, media upload execution, and
source-prep writing.

Target flow:

- `pull_request`: full validation and full site rebuild with no production publish.
- `push` to `main`: incremental publish for changed Markdown and changed local media.
- `workflow_dispatch`: manual full rebuild and republish.

Implemented:

- `npm run publish:plan` reports changed Markdown, planned media uploads,
  manifest additions, and affected generated JSON.
- `npm run publish:media:dry-run` previews planned Azure Blob uploads.
- `npm run publish:media` uploads planned local media to canonical
  `images/yyyy/mm/dd/filename.ext` paths.
- Image media uploads generate resized thumbnails with `sharp` and upload them
  to canonical `thumbs/yyyy/mm/dd/filename.ext` paths.
- Video media uploads generate poster images with `ffmpeg-static` and upload
  them under the `thumbs` prefix as `.jpg` files.
- `npm run publish:prepare` rewrites Markdown media references and updates
  `content/media/index.json`.
- `npm run publish:cleanup-media` previews local draft media removal after
  upload and source prep.
- `npm run publish:cleanup-media:write` removes verified local draft media.
- `npm run build:content:incremental` writes only JSON paths affected by the
  publish plan.
- `npm run publish:content:incremental:dry-run` and
  `npm run publish:content:incremental` publish only the planned JSON paths.
- Generated search artifacts are included in full builds and in incremental
  publish plans as `search/index.json`.

Next work:

- Keep a manual full rebuild path for migrations and repair work.

## 3. `_gallery` Retirement

Status: retired. Generated image IDs and content references are canonicalized.
The site has a checked-in `content/media/index.json` source manifest, and the
build and validator require that manifest. Legacy `_gallery` records and the
migration-only scripts that consumed them have been removed from the normal
workspace.

Next work:

- Keep migration history in Git.
- Use `content/media/index.json` and the publish pipeline for any future media
  additions or corrections.

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

Implemented endpoints:

- `/api/sites/{site}/taxonomy/{family}/{slug}` is available for hashtags,
  categories, people, and locations.
- `/api/sites/{site}/search`

Next endpoints:

- richer paging and filtering across posts, stories, galleries, and media

## 6. Frontend Discovery

Status: core archive/detail views and baseline cross-type search exist.

Implemented:

- Hashtag, category, people, and location taxonomy pages render matching posts,
  stories, and galleries together.
- `/search` renders paged, clickable search results across posts, stories, and
  galleries.
- `/api/search` and `/api/sites/{site}/search` rank results from generated
  `search/index.json`.

Next work:

- Add category browse pages if categories continue to be useful as curated
  sections.
- Expand search to media captions if raw media-library search becomes useful.
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
