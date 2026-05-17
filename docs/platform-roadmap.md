# Platform Roadmap

This tracks the remaining work to move from the current KansasPattons migration
prototype to a reusable content platform for multiple sites.

For the immediate execution checklist, see
[`near-term-feature-completion.md`](near-term-feature-completion.md).

For a future smaller-site migration from GitHub Pages/Jekyll to this React,
generated-content, Azure Static Web Apps layout, see
[`github-pages-to-swa-agent-playbook.md`](github-pages-to-swa-agent-playbook.md).

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

Status: workflow documented with dry-run planning, media upload execution,
source-prep writing, and initial GitHub Actions automation.

Target flow:

- `pull_request`: full validation and full site rebuild with no production publish.
- `push` to `main`: incremental publish for changed Markdown and changed local media.
- tag push: full rebuild and republish for versioned site changes.
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
- `.github/workflows/pr-ci.yml` runs validation and tests for pull requests and
  Dependabot updates.
- `.github/workflows/publish.yml` runs incremental publish on `main`, full
  rebuild publish on tags, and deploys the built React site plus managed API to
  Azure Static Web Apps.
- `publish:plan` supports commit-range planning with `--base`/`--head` or
  `PUBLISH_PLAN_BASE`/`PUBLISH_PLAN_HEAD` for clean GitHub Actions checkouts.
- `public/staticwebapp.config.json` provides the Azure Static Web Apps SPA
  fallback and selects the Node API runtime.

Next work:

- Validate the workflows against repository secrets/variables in GitHub.
- Add content deletion handling for incremental publish, or keep deletions on
  the tagged full-rebuild path.

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

Status: API still lives in this repo, but it can now be deployed as a
standalone Function App and the React frontend can call an external API host
through `VITE_API_BASE_URL`.

Target direction:

- Extract the API to a separate repo once the standalone Azure deployment is
  proven from this repo.
- Keep site-specific behavior in config, storage prefixes, and generated
  content artifacts.
- Add fixtures for at least two sites before extraction so site-specific logic
  cannot sneak into the API unnoticed.

Implemented:

- `/api/health` reports the content-source runtime configuration without
  exposing secrets.
- `.github/workflows/api-publish.yml` deploys the existing `api/` Azure
  Functions project to a standalone Function App when
  `AZURE_API_FUNCTION_APP_NAME` is configured.
- The React app uses `VITE_API_BASE_URL` when present and otherwise falls back
  to same-origin `/api`.

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

Status: initial content validation and split test suites are wired up.

Implemented:

- `npm run test:site` runs the production build and Playwright browser smoke
  tests for the React site.
- `npm run api:test` runs API-local tests under `api/`.
- `npm run test` runs both suites from the repo root.
- Site Playwright tests mock `/api/*` from generated `public/content` JSON, so
  they can run without a local Functions host.
- API tests use API-local dependencies so they can move with the API repo later.

Next work:

- Promote more target-contract cleanup items into validator checks as the content is tightened.
- Add compiler tests.
- Add publish dry-run tests.
- Add API endpoint tests against fixture content.
- Ensure Dependabot updates run the same validation/build/test suite before
  merge.
