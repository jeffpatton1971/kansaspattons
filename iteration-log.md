# Iteration Log

Detailed working notes for the React migration live here. This file is intentionally conversational and decision-oriented; `CHANGELOG.md` is reserved for published behavior changes and bug fixes.

## 2026-05-13

### React Migration Kickoff

- Started work on the `react-site` branch.
- Goal: move the site away from Jekyll's full static rebuild model while preserving GitHub-authored Markdown as the durable content source.
- Initial direction:
  - Keep `_posts` and `_gallery` as the canonical source directories during the first migration phase.
  - Generate React-readable JSON artifacts into `public/content`.
  - Build a React/Vite application shell that reads those artifacts at runtime.
  - Delay any permanent content directory migration until the browsing, routing, and content API shape feel proven.
- Reasoning:
  - The current repo has a large number of Markdown content records, especially gallery items.
  - Moving files before the runtime model is proven would add churn without reducing risk.
  - A generated-content layer gives us a clean bridge from Jekyll-shaped content to a future shared content platform.

### Routing Ideas

- Desired post browsing routes:
  - `/posts`
  - `/posts/:year`
  - `/posts/:year/:month`
  - `/posts/:year/:month/:day`
  - `/posts/:year/:month/:day/:slug`
- Desired image browsing should feel parallel to posts, but may need a more visual interaction model.
- Early UI concept:
  - Use horizontal, scrollable date shelves for years, months, days, posts, and images.
  - Avoid locking into a literal carousel dependency until we understand the data density and mobile ergonomics.

### First Prototype Pass

- Added a Vite, React, and TypeScript app at the repo root.
- Kept legacy source content in `_posts` and `_gallery`.
- Added `scripts/build-content.ts` to generate runtime JSON under `public/content`.
- Generated content currently includes:
  - `posts/index.json` with lightweight post summaries and date archive metadata.
  - `posts/:year/:month/:day/:slug.json` with sanitized post HTML.
  - `images/index.json` with gallery item metadata and date archive metadata.
  - `site.json` with generated totals.
- The first content build processed the full current archive:
  - 1,148 posts.
  - 8,528 image records.
- Added initial React routes:
  - `/`
  - `/posts`
  - `/posts/:year`
  - `/posts/:year/:month`
  - `/posts/:year/:month/:day`
  - `/posts/:year/:month/:day/:slug`
  - `/images`
  - `/images/:year`
  - `/images/:year/:month`
  - `/images/:year/:month/:day`
  - `/images/:year/:month/:day/:imageId`
  - `/blog/:year/:month/:day/:slug` redirecting to the new post route.
- Added horizontal shelf navigation for year/month/day browsing.
- Added a grid-based image browser with an image detail state when an image is selected.
- Added related-image rendering on post detail pages when a post references a gallery.

### Issues Found

- TypeScript 6 rejected the side-effect CSS import until the Vite client type reference was added in `src/vite-env.d.ts`.
- `tsc -b` emitted a stray `vite.config.js` until `tsconfig.node.json` was updated with `noEmit`.
- The first dev-server health check ran before Vite finished starting; the server was healthy after startup completed.
- Vite reported a `vite:prepare-out-dir` timing warning during production build. This is probably tied to copying generated content files into `dist`; the current prototype produces about 1,151 generated content files, which is much smaller than the Jekyll output surface but still worth watching.

### Open Design Questions

- Whether generated content should remain ignored build output or be committed for GitHub Pages-only deployment.
- Whether `_posts` and `_gallery` should stay canonical long term or eventually migrate to a cleaner `/content/sites/kansaspattons` shape.
- Whether image browsing should stay date-first or add gallery/album-first browsing as a peer view.
- Whether the date shelves should evolve into a richer virtualized carousel for very dense years.
- Whether post JSON should stay one-file-per-post or shift to year/month chunks to reduce build output file count further.

### Interaction Refinement

- Changed post rows/cards into single clickable links instead of showing a separate `Open` action.
- Added a reusable image carousel for images attached to a post.
  - The carousel appears even for small image sets so the interaction stays consistent.
  - Each carousel image links into the image archive route for that specific image.
- Simplified selected image detail in the image archive.
  - Removed the side panel with date/title/original/related-post actions.
  - Added a clickable breadcrumb showing `Images / year / month / day / image title`.
  - Kept the large selected image as the main focus.
- Production build passed after these changes.

### Image Archive Density

- The first image archive pass still showed too many thumbnail cards at broad archive levels.
- Changed image browsing to be date-drill-first:
  - `/images` shows years and an archive count.
  - `/images/:year` shows years, months, and the scoped count.
  - `/images/:year/:month` shows years, months, days, and the scoped count.
  - `/images/:year/:month/:day` is the first level that renders image thumbnails.
- This keeps the image page from acting like a giant media dump and makes the shelves carry the archive navigation.
- Production build passed after this change.

### Image Archive Navigation Density Correction

- The previous date-drill-first change removed thumbnail overload but still displayed stacked rows for years, months, and days.
- Changed image navigation to show only one shelf at a time:
  - `/images` shows only the Years shelf.
  - `/images/:year` shows only the Months shelf.
  - `/images/:year/:month` shows only the Days shelf.
  - `/images/:year/:month/:day` shows the image grid without the stacked date shelves.
- Added a compact breadcrumb above scoped archive levels so the current path remains visible without needing multiple shelves.
- Selected images reuse the breadcrumb with the image title appended.
- Production build passed after this correction.

### Month-Level Image Grouping

- Adjusted `/images/:year/:month` so it no longer shows a Days shelf.
- Month view now renders images grouped by day:
  - Each day gets a compact header with the date and image count.
  - Each day shows a horizontal thumbnail strip.
  - Day headers link to the day route.
  - Individual thumbnails link to the selected image route.
- This makes month browsing visual without returning to the large ungrouped thumbnail wall.
- Production build passed after this change.

### Year-Level Image Grouping

- Followed the month grouping logic up one level.
- Adjusted `/images/:year` so it no longer shows a Months shelf.
- Year view now renders images grouped by month:
  - Each month gets a compact header with the month label and image count.
  - Each month shows a horizontal thumbnail strip.
  - Month headers link to the month route.
  - Individual thumbnails link to the selected image route.
- Generalized the image grouping renderer so month groups and day groups share the same UI.
- Production build passed after this change.

### Root-Level Image Grouping

- Followed the visual grouping logic to `/images`.
- The root image page no longer shows a Years shelf.
- Root view now renders images grouped by year:
  - Each year gets a compact header with the year and image count.
  - Each year shows a horizontal thumbnail preview strip.
  - Year headers link to the year route.
  - Individual thumbnails link to selected image routes.
- Added a preview limit for root/year summary groups so broad archive pages do not render thousands of thumbnails at once.
- Added a compact `+count` tile linking to the full group when a preview strip is capped.
- Production build passed after this change.

### Carousel Layout And Posts Blank Screen

- The grouped image UI had the right hierarchy but still felt like a filmstrip.
- Changed grouped image sections into larger carousel-style panels:
  - Added arrow controls per group.
  - Increased slide size and changed the preview shape from square thumbnails to wider image panels.
  - Kept capped previews and the overflow tile for broad archive groups.
- Investigated `/posts` rendering as a blank screen.
  - Found 17 generated legacy post dates in a browser-invalid format, such as `2009-11-02T09:55:00 -0600`.
  - Fixed the content compiler to normalize spaced timezone offsets into ISO-compatible values.
  - Made date label formatting defensive so one malformed date cannot blank a route.
  - Rebuilt content and confirmed 0 invalid generated post dates.
- Production build passed after these changes.

### Embla Carousel Adoption

- Decided to use Embla Carousel for image group previews.
- Added `embla-carousel-react`.
- Replaced the hand-rolled scroll container in grouped image previews with Embla:
  - Embla now handles drag, snap behavior, selected slide tracking, and previous/next API calls.
  - The site still owns all markup and styling.
- Restyled grouped image previews into a stacked carousel treatment:
  - Active slide is larger and centered.
  - Neighboring slides are slightly rotated, scaled down, and layered behind the active image.
  - Distant slides fade back.
  - Broad archive groups still use capped previews with a `+count` overflow slide.
- Production build passed.
- Smoke checks returned 200 for `/images`, `/images/2009`, and `/posts`.

### Post Calendar Navigation

- Replaced the stacked year/month/day shelves on `/posts` with a left-side calendar control.
- `/posts` now resolves to the latest archive month instead of rendering every post at once.
- Added reusable `ArchiveCalendar` component:
  - Year selector.
  - Month selector with unavailable months disabled.
  - Previous/next month controls.
  - Calendar grid for the selected month.
  - Clickable days when posts exist on that day.
- Posts render to the right of the calendar and are filtered by selected month or selected day.
- Verified that March 2011 exists in the post archive and can be reached via `/posts/2011/03`.
- Production build passed.
- Smoke checks returned 200 for `/posts`, `/posts/2011/03`, and `/posts/2011/03/01`.
- Open question: whether to apply the same calendar control to images alongside, or in place of, the current visual grouped image browser.

### Shared Archive Shell

- Moved from a posts-only calendar layout to a shared archive shell.
- Archive pages now use a top nav/header followed by a three-column body:
  - Left rail: route-aware archive calendar.
  - Center: primary posts or images content.
  - Right rail: reserved breathing room for now.
- `/posts` uses the left calendar as a post archive control.
- `/images` uses the same left calendar component as an image archive control while keeping the visual grouped image browser in the center.
- Calendar remains sticky in the left rail on desktop and stacks above content on smaller screens.
- Production build passed.
- Smoke checks returned 200 for `/posts`, `/posts/2011/03`, `/images`, and `/images/2009/10/18`.

### Home Author Rail

- Updated the home page to use the same left/main/right shell as archive pages.
- Added an author information card in the left rail using the existing site author details:
  - Bio photo from `/assets/images/bio-photo.jpg`.
  - Name: Jeff Patton.
  - Bio: "Just a dad who takes too many pictures."
  - Website, Bluesky, GitHub, and Instagram links.
- Kept recent posts, recent images, and archive metrics in the center content area.
- Lucide does not include GitHub/Instagram brand icons in the installed package, so those links use the generic external-link icon for now.
- Production build passed.
- Smoke checks returned 200 for `/` and `/assets/images/bio-photo.jpg`.

### Home Right Rail Metrics

- Moved the home page Posts and Images metric cards from the center overview area into the right rail.
- Home layout now reads as:
  - Left rail: author information.
  - Center: archive intro, recent posts, and recent images.
  - Right rail: archive total cards linking to posts and images.
- Added a home-specific archive shell column width so the right rail has enough room for stacked metric cards.
- Production build passed.
- Smoke check returned 200 for `/`.

### Post Shape Taxonomy

- Discussed splitting posts into two presentation/content shapes:
  - `blog`: longer-form posts, probably all original WordPress posts.
  - `story`: social/media-first posts, probably Instagram and most Facebook content.
- Current generated post source counts:
  - WordPress: 74 posts with `sourceType: "wordpress"`.
  - WordPress-tagged but missing `source.type`: 17 posts.
  - Instagram: 1,014 posts.
  - Facebook: 43 posts.
- Initial classification idea:
  - `wordpress` and WordPress-tagged unknowns become `blog`.
  - `instagram` becomes `story`.
  - `facebook` likely becomes `story`, especially because current Facebook samples are album-oriented.
- Open question: whether any Facebook posts should become a third shape such as `album`, or whether `story` can handle media-first Facebook albums well enough.

### Older WordPress Source Metadata

- Added richer source frontmatter to the 17 older WordPress-tagged posts that were missing `source.type`.
- Added:
  - `source:`
  - `  type: wordpress`
- Did not add WordPress IDs or URLs because those values were not present in the older frontmatter.
- Rebuilt generated content and confirmed:
  - `wordpress`: 91 posts.
  - `missingWordpress`: 0 posts.
  - No `unknown` source posts remain in the current generated post index.
- Production build passed after the metadata update.

### Posts And Stories Split

- Split generated entry content into two explicit shapes:
  - `post`: WordPress-shaped content.
  - `story`: social/media-shaped content.
- Classification rules implemented in the compiler:
  - `source.type: wordpress` or `tags: wordpress` => `post`.
  - Everything else => `story`.
  - Facebook currently falls into `story` and remains a provisional classification.
- Generated output now includes:
  - `public/content/posts/index.json` and `public/content/posts/...` for WordPress-shaped posts.
  - `public/content/stories/index.json` and `public/content/stories/...` for Instagram/Facebook-shaped stories.
  - `public/content/entries/index.json` for all entries, used by legacy redirects.
- Added `/stories` archive routes and story detail routes.
- Updated nav with a Stories entry.
- Updated legacy `/blog/...` redirect logic to look up the generated all-entry index and redirect to either `/posts/...` or `/stories/...`.
- Updated home metrics to show Posts, Stories, and Images.
- Verified generated counts:
  - Posts: 91.
  - Stories: 1,057.
  - All entries: 1,148.
  - Sources: 91 WordPress, 1,014 Instagram, 43 Facebook.
- Production build passed.
- Smoke checks returned 200 for `/posts`, `/stories`, a story detail route, and a post detail route.

### Home Load Performance

- Investigated slow home page load.
- Found that home was fetching full archive indexes to render a small summary:
  - `posts/index.json`: about 84 KB.
  - `stories/index.json`: about 898 KB.
  - `images/index.json`: about 7.36 MB.
- The image index was the main issue; home only needed the image count and 18 recent images.
- Added generated `public/content/home.json` with:
  - post/story/image counts.
  - six recent WordPress-shaped posts.
  - eighteen recent images.
- Refactored `HomePage` to fetch only `home.json`.
- New home data payload is about 21 KB.
- Production build passed.
- Smoke check returned 200 for `/`.

### Home Recent Posts And Stories

- The home page was still only rendering recent WordPress-shaped posts.
- Added `recentStories` to generated `public/content/home.json` so home can show a compact story set without loading the full stories index.
- Added a neutral `EntrySummaryList` card for home page content:
  - Date.
  - Title.
  - One to two lines of excerpt text.
  - The same shape is used for both posts and stories.
- Updated the home page center column to show separate Recent Posts and Recent Stories sections above Recent Images.
- Verified generated home data:
  - 6 recent posts.
  - 6 recent stories.
  - 18 recent images.
- Production build passed.
- Smoke checks returned 200 for `/`, `/posts`, and `/stories`.

### Home Chronological Updates

- The home page briefly grouped Recent Posts and Recent Stories into separate sections.
- Changed the home page back to a single Recent Updates stream.
- Generated `recentEntries` now merges:
  - 6 most recent WordPress-shaped posts.
  - 6 most recent Instagram/Facebook-shaped stories.
  - The combined set is sorted newest-first by date.
- This keeps posts and stories in the same compact card shape while preserving chronological order.
- Verified generated home data contains 6 posts and 6 stories in `recentEntries`.
- Production build passed.
- Smoke checks returned 200 for `/`, `/posts`, and `/stories`.

### API And Published Content Direction

- Discussed the first API surface as four route families:
  - `/home`
  - `/posts`
  - `/stories`
  - `/images`
- Current thinking:
  - Keep GitHub-authored Markdown as the canonical authoring source.
  - Compile Markdown and gallery records during a publish action.
  - Store normalized, rendered content as read-optimized JSON documents.
  - Let React consume compact API responses instead of loading large archive indexes up front.
- Recommended direction for the first real API pass:
  - Treat the current generated JSON as a prototype for response contracts.
  - Move toward publish-time JSON artifacts in object storage first.
  - Add Azure Functions as a thin query/read layer when the client needs filtering, pagination, or route-specific composition.
  - Consider Mongo/Cosmos-style document storage only if date/tag/source/location queries become awkward with static JSON shards.
- Key open design point:
  - Whether published content should live as immutable JSON blobs plus manifests, or as queryable documents in a database.
  - The blob-first approach looks simpler and cheaper for read-mostly archive content; database storage becomes attractive if we want rich faceting, admin tools, search, or cross-site aggregation.

### Storage-Backed API Scaffold

- Started the first Markdown-to-JSON-to-API vertical slice.
- Added a nested TypeScript Azure Functions app under `api/`.
- Added root scripts:
  - `npm run api:build`
  - `npm run api:start`
- Added endpoint families:
  - `GET /api/home`
  - `GET /api/posts`
  - `GET /api/posts/{year}/{month}/{day}/{slug}`
  - `GET /api/stories`
  - `GET /api/stories/{year}/{month}/{day}/{slug}`
  - `GET /api/images`
  - `GET /api/images/{year}/{month}/{day}/{imageId}`
- The API reads the same generated JSON artifacts currently used by React.
- Added a content store abstraction:
  - Uses `CONTENT_BASE_URL` when pointing at a storage account/container/prefix.
  - Falls back to `CONTENT_LOCAL_ROOT` for local development against `public/content`.
  - Caches JSON artifacts in memory per Function instance with `CONTENT_CACHE_SECONDS` defaulting to 60 seconds.
- Added list API behavior:
  - Date filters by `year`, `month`, and `day`.
  - Cursor/limit paging.
  - Calendar/archive metadata included with post, story, and image list responses.
  - Image lists support `groupBy=year`, `groupBy=month`, and `groupBy=day` preview groups.
- Added `/api/home` composition data:
  - Site title.
  - Nav items.
  - Author card data.
  - Counts.
  - Recent post/story entries.
  - Recent images.
- Added `api/README.md` and `api/local.settings.sample.json`.
- Added `api/dist/` and `api/local.settings.json` to `.gitignore`.
- Verification:
  - `npm install` inside `api/` completed with 0 vulnerabilities.
  - `npm run api:build` passed.
  - `npm run build` passed for the React/content app.
  - Direct local content-reader smoke checks loaded `/home`, `posts/index.json`, and a real story document.
- Local endpoint smoke testing is blocked until Azure Functions Core Tools is installed or otherwise available as `func`.

### Local Functions Tooling Documentation

- Added Windows and macOS setup notes to `api/README.md` for Azure Functions Core Tools.
- Documented the expected `func --version` verification step.
- Included Windows options:
  - Microsoft-recommended v4.x 64-bit MSI path.
  - `winget install Microsoft.Azure.FunctionsCoreTools`.
  - `choco install azure-functions-core-tools`.
  - `npm install -g azure-functions-core-tools@4`.
- Included macOS Homebrew setup:
  - `brew tap azure/functions`.
  - `brew install azure-functions-core-tools@4`.
  - `brew link --overwrite azure-functions-core-tools@4` for upgrades.
- Added Azurite notes because the sample local settings use `AzureWebJobsStorage=UseDevelopmentStorage=true`.
- Added example local endpoint URLs for `/api/home`, `/api/posts`, `/api/stories`, and `/api/images`.
- Added troubleshooting notes for the case where Azurite is installed but `func` is not on `PATH`.
- Added a note that npm deprecation warnings during Azurite installation are dependency warnings, not necessarily install failures.
- Verified Azurite `3.35.0` starts locally and opens the blob endpoint on `127.0.0.1:10000`.
- Created local, gitignored `api/local.settings.json` from the sample file for this workspace.
- `func` is still not visible to Codex's current PowerShell process; endpoint smoke testing remains blocked until `func --version` works in the same shell context.

### React API Wiring

- Rewired the React content fetch layer from `/content/*.json` artifacts to `/api/...` endpoints.
- Added a Vite dev proxy:
  - `/api/*` routes to `http://localhost:7071`.
- Added a compatibility adapter in `src/content.ts` so existing pages can continue receiving the current in-memory shapes:
  - API `items` become `posts` for post/story/entry indexes.
  - API `items` become `images` for the image index.
- Added `GET /api/entries` for legacy `/blog/...` redirect lookups.
- Widened API list limits for the compatibility pass:
  - Posts/stories/entries allow up to 2,000 summaries.
  - Images allow up to 10,000 summaries.
- This is intentionally a transitional step:
  - The site now runs through the API.
  - The pages still load full archive lists in places where they did before.
  - A later pass should move posts/stories/images pages to paged and grouped API calls instead of client-side full-index filtering.
- Added `api/README.md` instructions for running the full local stack:
  - Azurite.
  - Azure Functions API.
  - Vite React app with `/api` proxy.
- Verification:
  - `npm run api:build` passed.
  - `npm run build` passed.
  - Direct API smoke checks returned 200 for `/api/home`, `/api/posts`, `/api/stories`, `/api/images`, and `/api/entries`.
  - Vite proxy smoke checks returned 200 for `/api/home`, `/api/posts`, `/api/stories`, `/api/images`, `/`, `/posts`, `/stories`, and `/images`.
  - `/api/posts?limit=2000` returned 91 posts.
  - `/api/images?limit=10000` returned 8,528 images.

### API-Native Archive Loading

- Moved the archive pages beyond full-index compatibility mode.
- Posts and stories now call filtered, paged API requests for the current route:
  - `/posts` calls `/api/posts?limit=48`.
  - `/posts/:year/:month/:day` passes year/month/day filters.
  - Stories follow the same pattern through `/api/stories`.
- Posts and stories no longer fetch all summaries and then filter in React.
- Image archives now use API grouping:
  - `/images` calls `/api/images?groupBy=year`.
  - `/images/:year` calls `/api/images?year=YYYY&groupBy=month`.
  - `/images/:year/:month` calls `/api/images?year=YYYY&month=MM&groupBy=day`.
  - `/images/:year/:month/:day` calls a day-scoped API list instead of the full image index.
- Image group responses carry `count` plus a capped preview list, so broad archive pages can show totals without transferring all images.
- Added `galleryId` filtering to `/api/images`.
- Post/story detail pages now load related images with targeted gallery queries instead of loading all 8,528 images.
- Legacy `/blog/...` redirects now query `/api/entries` with the legacy date scope instead of loading all entries.
- Tightened the API content cache:
  - Successful reads are still cached briefly.
  - Failed reads are no longer cached, which avoids a 60-second stale 404 when a local content rebuild temporarily removes an artifact.
- Verification:
  - `npm run api:build` passed.
  - `npm run build` passed.
  - `/api/posts?limit=48` returned 48 of 91 posts.
  - `/api/stories?year=2026&month=04&limit=48` returned 10 stories.
  - `/api/images?groupBy=year` returned 20 year groups.
  - `/api/images?year=2026&groupBy=month` returned 4 month groups.
  - `/api/images?year=2026&month=04&groupBy=day` returned 8 day groups.
  - `/api/images?year=2026&month=04&day=16&limit=10000` returned 2 images.
  - `/api/images?galleryId=instagram-2026-04-16-194804-better-late-than-never&limit=1000` returned 2 images.
  - Vite route smoke checks returned 200 for `/`, `/posts`, `/stories`, `/images`, `/images/2026`, `/images/2026/04`, and `/images/2026/04/16`.

### Storage Publish Tool

- Added `scripts/publish-content.ts` to publish generated JSON artifacts to Azure Blob Storage.
- Added root scripts:
  - `npm run publish:content`
  - `npm run publish:content:dry-run`
- Added Azure SDK dev dependencies:
  - `@azure/identity`
  - `@azure/storage-blob`
- Publish configuration:
  - `CONTENT_STORAGE_ACCOUNT`
  - `CONTENT_STORAGE_CONTAINER`
  - `CONTENT_STORAGE_PREFIX`, defaulting in docs to `content/kansaspattons/current`
  - `AZURE_STORAGE_CONNECTION_STRING` as an alternate auth path
  - `CONTENT_PUBLISH_ROOT`, defaulting to `public/content`
  - `CONTENT_STORAGE_CACHE_CONTROL`, defaulting to `public, max-age=60`
  - `CONTENT_PUBLISH_DRY_RUN=true` as an alternate dry-run flag
- The script validates required artifacts before upload:
  - `home.json`
  - `site.json`
  - `posts/index.json`
  - `stories/index.json`
  - `images/index.json`
- Upload behavior:
  - Uploads every generated content file under the configured prefix.
  - Sets JSON content type and cache-control metadata.
  - Writes `_publish.json` with publish timestamp, file count, byte count, and the content base URL.
  - Prints the `CONTENT_BASE_URL` for the Function app.
- Added publish instructions to `api/README.md` for PowerShell and macOS/bash.
- Dry-run verification against the likely production target:
  - Storage account: `prdwebappstorage`.
  - Container: `kansaspattons`.
  - Prefix: `content/kansaspattons/current`.
  - Files: 1,154.
  - Bytes: 12,298,442.
  - Function app setting would be `CONTENT_BASE_URL=https://prdwebappstorage.blob.core.windows.net/kansaspattons/content/kansaspattons/current/`.
- No real upload was performed during this iteration.
- Verification:
  - `npm run publish:content:dry-run` passed after a content rebuild.
  - `npm run build` passed.
  - `npm run api:build` passed.
- Note:
  - A parallel dry-run/build attempt caused temporary `EPERM rmdir` errors because two `build-content` runs cleaned `public/content` at the same time. Running the commands sequentially resolved it.

### Content Schema And Multi-Site API Shape

- Question:
  - Are the generated JSON shapes documented?
  - Can the API and storage model support more than one site while keeping each site in its own repo?
- Findings:
  - The JSON shapes existed as TypeScript types and generated artifacts, but they were not documented as a stable contract.
  - The API was still largely site-specific because it used one content root/base URL and hardcoded KansasPattons site shell data in the home payload.
- Added documentation:
  - `docs/content-schema.md` documents the generated JSON contract:
    - `site.json`
    - `home.json`
    - entry summaries and entry details
    - image summaries
    - archive navigation structures
    - paged API list responses
    - grouped image responses
  - `docs/multi-site-content.md` documents the intended reusable hosting pattern:
    - separate source repos per site
    - generated JSON per repo
    - GitHub Actions publishing into site-specific Azure Storage prefixes
    - one shared Azure Functions API using named site routes
- API changes:
  - Added `/api/sites/{site}/home`.
  - Added `/api/sites/{site}/entries`.
  - Added `/api/sites/{site}/posts` and `/api/sites/{site}/posts/{year}/{month}/{day}/{slug}`.
  - Added `/api/sites/{site}/stories` and `/api/sites/{site}/stories/{year}/{month}/{day}/{slug}`.
  - Added `/api/sites/{site}/images` and `/api/sites/{site}/images/{year}/{month}/{day}/{imageId}`.
  - Kept existing routes such as `/api/home`, `/api/posts`, `/api/stories`, and `/api/images` working for the default site.
- Content source resolution:
  - Existing single-site settings still work:
    - `CONTENT_BASE_URL`
    - `CONTENT_LOCAL_ROOT`
  - Named sites can now resolve through:
    - site-specific env vars, such as `CONTENT_BASE_URL_KANSASPATTONS`
    - JSON maps, such as `CONTENT_SITE_BASE_URLS`
    - templates, such as `CONTENT_BASE_URL_TEMPLATE=https://.../content/{site}/current/`
  - Matching local settings were added for local multi-site development.
- Generated site metadata:
  - `site.json` now includes:
    - `key`
    - `title`
    - optional `url`
    - `nav`
    - `author`
  - The content builder supports environment overrides such as:
    - `CONTENT_SITE_KEY`
    - `CONTENT_SITE_TITLE`
    - `CONTENT_SITE_URL`
    - `CONTENT_SITE_AUTHOR_JSON`
    - `CONTENT_SITE_NAV_JSON`
- Publish changes:
  - `scripts/publish-content.ts` now derives its default prefix from `CONTENT_SITE_KEY`.
  - The default prefix is `content/{CONTENT_SITE_KEY}/current`.
- Frontend change:
  - The home page author card now renders from API-provided site metadata instead of hardcoded text.
- Verification:
  - `npm run api:build` passed.
  - `npm run build:content` passed.
  - `npm run build` passed.
  - A named-site content resolver smoke check read `site.json` for `kansaspattons` through `CONTENT_LOCAL_ROOT_TEMPLATE`.
  - `npm run publish:content:dry-run` passed with:
    - `CONTENT_SITE_KEY=kansaspattons`
    - `CONTENT_STORAGE_ACCOUNT=prdwebappstorage`
    - `CONTENT_STORAGE_CONTAINER=kansaspattons`
  - Dry-run target remained `content/kansaspattons/current`.

### Article, Story, Gallery Content Model

- Goal:
  - Document and wire up a cleaner content graph:
    - Articles behind `/posts`.
    - Stories behind `/stories`.
    - Galleries behind `/galleries`.
    - Images as reusable assets shared by all three.
- Documentation:
  - Added `docs/content-model.md`.
  - Updated `docs/content-schema.md`.
  - Updated `docs/multi-site-content.md`.
  - Updated `api/README.md`.
- Content model direction:
  - `article` is the long-term name for WordPress/blog-shaped posts.
  - `story` is the long-term name for image-first social posts.
  - `gallery` is the long-term name for an image collection.
  - `image` remains a reusable asset record.
  - Compatibility fields such as `contentShape` and `excerpt` remain for now.
- Generator changes:
  - Entry JSON now includes:
    - `siteKey`
    - `type`
    - `status`
    - `authors`
    - `summary`
    - `imageIds`
    - `related`
    - story `caption`
    - article/story `bodyMarkdown`
  - Generated `site.json` and `home.json` now include gallery counts.
  - Generated `site.json` nav now includes Galleries.
  - Generated galleries are derived from image records grouped by `gallery`.
  - Gallery summaries include:
    - cover image
    - image count
    - related article/story links
    - tags/categories/authors inherited from related content when available
  - Gallery details include the expanded image list.
  - Image source values now emit the source type from object frontmatter instead of `[object Object]`.
  - Authored `content_type: gallery` posts are now treated as gallery metadata sources and merged into the generated gallery with the same `gallery` ID.
  - Facebook album imports now become galleries by default instead of story entries.
  - Facebook Mobile Uploads albums are excluded from story/gallery archives when marked with `exclude_from_archives: true`; their individual image records remain in `/images`.
  - `home.json` and `site.json` now publish source counts for:
    - WordPress articles.
    - Instagram stories.
    - Facebook galleries.
- API changes:
  - Added `/api/galleries`.
  - Added `/api/galleries/{year}/{month}/{day}/{slug}`.
  - Added `/api/sites/{site}/galleries`.
  - Added `/api/sites/{site}/galleries/{year}/{month}/{day}/{slug}`.
  - Added `source` filtering to post, story, entry, and gallery list endpoints.
  - The publish script now validates `galleries/index.json`.
- React changes:
  - Added `/galleries` archive route.
  - Added `/galleries/:year`, `/galleries/:year/:month`, and `/galleries/:year/:month/:day`.
  - Added gallery detail route at `/galleries/:year/:month/:day/:slug`.
  - Added Galleries to the top navigation, home Recent Updates link row, and right-rail metrics.
  - Added source badges in the right rail for WordPress, Instagram, and Facebook.
  - Source badges link to filtered archive views:
    - `/posts?source=wordpress`
    - `/stories?source=instagram`
    - `/galleries?source=facebook`
  - Gallery detail pages now render the gallery archive calendar in the left rail.
  - Gallery cards preserve the active source filter when opening a detail page, so Facebook-filtered browsing keeps a Facebook-filtered calendar.
- Sample authoring changes:
  - `_posts/2009-10-16-site-changes.md` now has `content_type: article`, `authors`, and `summary`.
  - `_posts/2010-12-25-christmas-2025.md` now has `content_type: article`, `authors`, and `summary`.
  - `_posts/2026-04-16-194804-better-late-than-never.md` now has `content_type: story`, `authors`, and `summary`.
  - `_posts/2008-12-26-085654-christmas-2008.md` now has `content_type: gallery`, `slug`, `cover_image`, `authors`, and `summary`.
  - All four Mobile Uploads album posts now have `exclude_from_archives: true`.
- Generated output:
  - 91 articles.
  - 1,014 stories.
  - 1,117 galleries.
  - 8,528 images.
  - Source badge counts:
    - WordPress: 91.
    - Instagram: 1,014.
    - Facebook: 39.
- Note:
  - Mobile Uploads accounts for 3,758 Facebook image records, but those records are no longer exposed as gallery documents.
  - This keeps `/galleries` focused on intentionally named albums while preserving Mobile Uploads images in `/images`.
- Verification:
  - `npm run build:content` passed.
  - `npm run api:build` passed.
  - `npm run build` passed.
  - `npm run publish:content:dry-run` passed with:
    - `CONTENT_SITE_KEY=kansaspattons`
    - `CONTENT_STORAGE_ACCOUNT=prdwebappstorage`
    - `CONTENT_STORAGE_CONTAINER=kansaspattons`
  - Dry-run publish now sees 2,229 generated files and 24,602,422 bytes.

### Tailwind And shadcn Styling Foundation

- Direction:
  - Use Tailwind CSS for utility composition and responsive layout.
  - Use shadcn/ui for reusable primitives that can be copied or shared across future sites.
  - Keep site-specific personality in CSS variables rather than hard-coding component forks.
- Setup:
  - Installed Tailwind CSS v4 and `@tailwindcss/vite`.
  - Added the Tailwind Vite plugin.
  - Added the `@/*` alias for `src/*`.
  - Initialized shadcn with the Nova/Radix preset in `components.json`.
  - Added the shared `cn` helper at `src/lib/utils.ts`.
  - Added shadcn theme tokens to `src/styles.css`.
  - Added Geist Variable as the initial contemporary typeface.
- Installed shadcn primitives:
  - `Button`
  - `Card`
  - `Badge`
  - `Separator`
  - `Skeleton`
  - `Tooltip`
- First converted UI surface:
  - The archive right rail now uses shadcn cards for archive totals and source filters.
  - Source filters now render as shadcn badges.
  - Loading state now uses shadcn skeletons.
  - The app is wrapped in `TooltipProvider` for future standard tooltips.
- Documentation:
  - Added `docs/design-system.md` with setup notes and cross-site styling guidance.
- Verification:
  - `npm run build` passed.

### Full Post Frontmatter Normalization

- Goal:
  - Stop relying on compiler inference for imported posts.
  - Make every `_posts` Markdown file declare the new content shape directly.
- Added `scripts/normalize-post-frontmatter.ts`.
- Added `npm run normalize:posts`.
- The normalizer is idempotent and supports:
  - `npm run normalize:posts -- --dry-run`
  - `npm run normalize:posts`
- Normalized every `_posts/*.md` file to include:
  - `content_type`
  - `slug`
  - `post_id`
  - `status`
  - `authors`
  - `summary`
- Migration counts:
  - 1,148 Markdown post files processed.
  - 91 files classified as `article`.
  - 1,014 files classified as `story`.
  - 43 files classified as `gallery`.
  - 1,143 files received explicit `content_type`.
  - 1,146 files received explicit `slug`.
  - 2 files received or corrected `post_id`.
  - 1,148 files received explicit `status`.
  - 1,143 files received explicit `authors`.
  - 1,143 files received explicit `summary`.
- Compiler follow-up:
  - `scripts/build-content.ts` now honors explicit `slug` frontmatter for post/story routes.
  - It also falls back to top-level `id` when `post_id` is absent.
- Verification:
  - A post-frontmatter validation pass found zero missing normalized fields.
  - `npm run normalize:posts -- --dry-run` reports zero pending changes after the migration.
  - `npm run build` passed and still generated 1,105 entries, 1,117 galleries, and 8,528 images.

### Direct Images Versus True Galleries

- Clarified the content authoring distinction:
  - Use a first-class `content_type: gallery` page when an image set deserves browseable album treatment.
  - Use direct `images` frontmatter when images are just attachments to an article or story.
- Updated the Pumpkin Patch sample:
  - `_posts/2009-10-18-pumpkin-patch.md` remains the article.
  - Added `_posts/2009-10-18-pumpkin-patch-gallery.md` as the first-class gallery source.
  - The gallery source uses rich image references with `id`, `caption`, and `alt` placeholders.
  - The article now links to the gallery through `related` instead of embedding the old Jekyll gallery include.
- Updated the Big Boy sample:
  - `_posts/2013-05-29-big-boy.md` now uses direct `images` frontmatter and `cover_image`.
  - `_gallery/wp-20130529-002.md` no longer has a `gallery` value, so it no longer generates a one-image gallery.
- Compiler/API/UI changes:
  - `scripts/build-content.ts` now resolves rich `images` frontmatter into generated `imageIds`.
  - Direct image attachments can set `coverImage`.
  - The image API supports `imageId` query filtering in addition to `galleryId`.
  - Post/story details now fetch both direct image attachments and gallery-backed images.
  - Post/story details now resolve `related` gallery links and render those galleries inline below the entry body.
  - Legacy URLs are derived from the filename slug while modern routes use explicit `slug` frontmatter.
- Verification:
  - `npm run build` passed and now generates 1,105 entries, 1,116 galleries, and 8,528 images.
  - `npm run api:build` passed.
  - `npm run normalize:posts -- --dry-run` reports zero pending changes across 1,149 `_posts` files.

### Gallery Relationship Migration

- Agreed that `4+` images is the right threshold for a true gallery shape.
- Added `scripts/migrate-gallery-relationships.ts`:
  - `npm run migrate:galleries` runs a dry-run and validates generated Markdown frontmatter.
  - `npm run migrate:galleries:write` applies the migration.
  - The script keeps Facebook `Mobile Uploads` albums excluded instead of expanding huge catch-all imports into authored gallery files.
- Applied the migration:
  - `807` existing entries moved to direct `images` frontmatter.
  - `269` article/story entries now link to first-class related galleries.
  - `269` gallery source Markdown files were created.
  - `36` existing gallery source files were aligned with rich image references.
  - `4` small Facebook gallery sources became direct-image stories.
  - `1,003` image records were detached from small gallery groups.
  - `1,115` old Jekyll gallery includes were removed.
- Updated story details so related-gallery stories still lead with an image carousel.
- Updated content-model and generated-schema docs with the `1-3 direct / 4+ gallery` policy.
- Verification:
  - `npm run build` passed and generated `1,109` entries, `305` galleries, and `8,528` images.
  - `npm run api:build` passed.
  - `npm run normalize:posts -- --dry-run` reports zero pending changes across `1,418` `_posts` files.

### Story And Gallery Carousel Rendering

- Split image rendering into content-specific UI:
  - Stories now use a focused, Instagram-like carousel with one large image and controls below it.
  - Story images are no longer clickable inside the carousel.
  - Stories backed by related gallery documents use the same focused carousel for the lead media.
  - Galleries now use a peek carousel with the selected image centered and previous/next images angled out from the sides.
- Updated gallery detail pages and inline related galleries to use the gallery peek carousel instead of thumbnail grids or horizontal clickable strips.
- Follow-up story carousel adjustment:
  - Centered the story image frame within the detail column.
  - Capped the story image frame at `640px`.
  - Changed story images to `object-fit: contain` so the photo is not cropped just to fill the square.
- Follow-up story page layout adjustment:
  - Added a story-specific detail grid so the center column is capped around the story media instead of using the broad archive/post column.
  - This keeps the right-rail metric badges visually closer to the story content and removes the large empty band between the image and metrics.
  - Re-anchored that grid to the normal page start so the layout stays aligned with the title/nav instead of being centered in the viewport.
- Follow-up detail shell adjustment:
  - Replaced the story-only detail grid with a shared `page--detail` shell for posts and stories.
  - The detail shell keeps a three-column body but gives the right rail a real proportional column instead of a narrow fixed card lane.
  - Post and story detail content now fills the center lane, so a post without images no longer leaves a large unused band before the metrics.
- Verification:
  - `npm run build` passed and generated `1,109` entries, `305` galleries, and `8,528` images.
  - Follow-up `npm run build` passed with the story image sizing adjustment.
  - Follow-up `npm run build` passed with the story detail grid adjustment.
  - Follow-up `npm run build` passed with the story detail grid re-anchoring.
  - Follow-up `npm run build` passed with the shared post/story detail shell.

### Image Storage Migration Manifest

- Agreed on the target canonical asset layout:
  - `https://{account}.blob.core.windows.net/{siteId}/images/{year}/{month}/{day}/{filename}`
  - `https://{account}.blob.core.windows.net/{siteId}/thumbs/{year}/{month}/{day}/{filename}`
- Added `scripts/image-storage-migration-manifest.ts`.
- Added npm commands:
  - `npm run assets:manifest` for dry-run summary output.
  - `npm run assets:manifest:write` to write the full JSON plan to `.tmp/image-storage-migration-manifest.json`.
- Added `docs/image-storage-migration.md`.
- Updated content-model docs to describe canonical computed image URLs.
- Manifest verification:
  - Scanned `8,528` image metadata records.
  - Planned `17,056` copy operations: one raw image and one thumbnail per image.
  - Found `0` target path collisions.
  - Found `0` case-insensitive target path collisions.
  - Wrote the ignored `.tmp/image-storage-migration-manifest.json` manifest.
  - `npm run build` passed and generated `1,109` entries, `305` galleries, and `8,528` images.

### Post And Story Card Shapes

- Started making the two content shapes visually distinct.
- WordPress-shaped posts now render as article cards:
  - Date and title remain prominent.
  - Excerpts show substantially more text, up to about 10 lines.
  - `/posts` uses a two-column article card grid on desktop.
  - Home recent posts keep a compact one-column variant.
- Stories now render as media-first cards:
  - Story summaries receive a generated `coverImage` from the first image in their related gallery.
  - `/stories` uses an image-forward grid with square media, date, and caption/title text.
  - All 1,057 generated stories currently have cover images.
- Generated cover images are added to summaries so the story archive does not need to fetch the large image index.
- Production build passed.
- Smoke checks returned 200 for `/`, `/posts`, and `/stories`.

### Shared Right Rail Metrics

- Added a reusable `ArchiveMetrics` component for the Posts, Stories, and Images total cards.
- Reused the compact generated `home.json` payload for those metrics instead of loading full archive indexes.
- Rendered the metric rail on `/posts`, `/stories`, and `/images` so the right column is no longer empty on archive pages.
- Widened the shared archive shell's right rail so the cards have enough room to read as actual cards.
- Production build passed.
- Smoke checks returned 200 for `/`, `/posts`, `/stories`, and `/images`.

### Image Storage Blob Migration Runner

- Moved from planning to executable migration tooling.
- Added `scripts/migrate-image-storage.ts`.
- Added npm commands:
  - `npm run assets:migrate` for a no-write migration preview.
  - `npm run assets:migrate:write` to copy blobs from the manifest.
- Runner behavior:
  - Reads `.tmp/image-storage-migration-manifest.json`.
  - Re-validates zero target collisions before any write.
  - Uses the same Azure auth pattern as generated content publishing.
  - Creates the target container if needed.
  - Copies blobs with Azure Blob `syncCopyFromURL`.
  - Skips existing canonical target blobs by default so reruns are safe.
  - Supports `--limit`, `--offset`, `--kind`, `--concurrency`, and `--overwrite`.
  - Writes `.tmp/image-storage-migration-result.json` after write runs.
- Documentation now covers dry-run, pilot batch, full migration, and auth setup.
- Verification:
  - `npm run assets:migrate` passed and previewed all `17,056` copy operations.
  - `npm run assets:migrate -- --limit=10` passed and previewed a scoped batch.
  - `npm run build` passed.
  - A pilot `npm run assets:migrate:write -- --limit=20` was blocked before copying because this shell does not have Azure storage credentials or an active Azure login.
  - The runner now reports that auth failure with concise setup guidance instead of a large credential stack trace.

### Video Thumbnail Migration Handling

- A real write run copied most image assets, then stopped after hitting the default `--max-errors=20`.
- The failures all shared the same shape:
  - `kind: thumb`
  - `.mp4` source paths under `thumbs/{sourceType}/yyyy/mm/dd`
  - Azure reported that the blob did not exist.
- Conclusion: imported videos have raw video blobs, but we do not currently have separate generated thumbnail blobs for those videos.
- Updated the manifest planner so future manifests:
  - Still include raw video copy operations.
  - Do not schedule `.mp4` thumbnail copy operations by default.
  - Record skipped video thumbnail placeholders separately.
  - Supports `--include-video-thumbs` if real video thumbnail blobs are later generated and should be included in a manifest.
- Updated the migration runner so older manifests are also safe:
  - `.mp4` thumbnail operations are skipped by default.
  - `--include-video-thumbs` exists as an explicit escape hatch if real video thumbnail blobs are ever generated.
- Verification:
  - `npm run assets:manifest` now reports `16,999` copy operations and `57` skipped video thumbnail operations.
  - `npm run assets:manifest:write` refreshed `.tmp/image-storage-migration-manifest.json` with the video-aware plan.
  - `npm run assets:manifest -- --include-video-thumbs` verified the escape hatch restores the original `17,056` operation plan.
  - `npm run assets:migrate -- --limit=10` now scopes against the updated `16,999` operation manifest.
  - `npm run build` passed.

### Missing Instagram Source Cleanup

- Reviewed the follow-up migration result after video thumbnail placeholders were skipped.
- Final hard failures were:
  - `2` missing raw Instagram image blobs.
  - `3` missing Instagram thumbnail blobs where the raw image still exists.
- Confirmed the three raw fallback URLs return `200`.
- Removed the two `_gallery` records whose raw source files are missing:
  - `instagram-2021-04-27-135635-some-pix-from-the-morning-07`
  - `instagram-2024-06-25-195503-round-4-of-cruise-pictures-these-were-at-oceancaymscmarinereserve-lovely-01`
- Updated affected story metadata:
  - `2021-04-27` media count reduced from `7` to `6`.
  - `2024-06-25` media count reduced from `10` to `9`.
  - `2024-06-25` cover image moved to the next available image.
- Changed three thumbnail-only gaps to use the existing raw image URL as `thumb_url`.
- Verification:
  - `npm run assets:manifest:write` now reports `8,526` images and `16,995` copy operations.
  - `npm run build` passed and generated `8,526` images.
  - `npm run assets:migrate -- --limit=10` passed against the refreshed manifest.

### Header Body Footer Layout

- Added an app-level shell:
  - Sticky header.
  - Shared routed body.
  - Persistent footer.
- Marked home, post archive, story archive, gallery archive, and image archive pages as landing pages.
- Landing pages now reserve a consistent body height between the header and footer so the footer begins from a predictable visual position.
- Detail pages remain natural-height pages:
  - Post detail.
  - Story detail.
  - Gallery detail.
  - Selected image detail.
- Updated `home.json` so `recentEntries` is a five-item date-sorted feed from posts, stories, and galleries.
- Added `recentGalleries` to the home payload.
- Updated the home page to render only the first five recent updates.
- Updated the home page and generated home payload to use ten recent images.
- Updated content-schema docs and API/frontend types for mixed post/story/gallery recent updates.
- Verification:
  - `npm run build` passed.
  - `npm run api:build` passed.
  - Generated `home.json` now has `5` recent entries and `5` recent galleries.

### PattonTech-Inspired Layout Pass

- Reviewed `D:\CODE\Sites\pattontech` as the visual reference.
- Noted the current PattonTech site uses:
  - `mmistakes/minimal-mistakes@4.28.0`.
  - `minimal_mistakes_skin: dark`.
  - A masthead navigation row.
  - Author profile enabled by default for pages and posts.
  - A home overlay header image with compact title/excerpt content.
- Chose to mimic the reusable design language instead of copying the Jekyll theme directly:
  - Dark Minimal Mistakes-style skin.
  - Constrained masthead and page width.
  - Three-column archive body with a profile/calendar left rail, primary content column, and metrics right rail.
  - Dark raised cards and panels.
  - Muted metadata with blue/green accent links.
- Updated the home page language so it reads like the archive itself rather than a prototype implementation note.
- Verification:
  - `npm run build` passed.
  - Local Vite smoke checks returned `200` for `/`, `/posts`, `/stories`, `/galleries`, and `/images`.

### Home Banner Structure Adjustment

- Adjusted the home page to better match the PattonTech layout sequence:
  - Header/nav.
  - Full-width banner.
  - Three-column body.
- Moved the KansasPattons intro out of the center column and into a dedicated banner below the masthead.
- Kept the author card, recent updates/images, and metrics in the three-column archive body beneath the banner.
- Verification:
  - `npm run build` passed.
  - Local Vite smoke checks returned `200` for `/`, `/posts`, and `/galleries`.

### Home Recent Feed Caps

- Reduced the home Recent Updates feed from `6` items to `5` items.
- Reduced the home Recent Images feed from `18` items to `10` items.
- Kept the generated `home.json` and `/api/home` response aligned with the rendered home page.
- Verification:
  - `npm run build` passed.
  - Generated `public/content/home.json` reports:
    - `recentEntries: 5`
    - `recentPosts: 5`
    - `recentStories: 5`
    - `recentGalleries: 5`
    - `recentImages: 10`
  - `/api/home` reports the same counts.
  - Local Vite smoke check returned `200` for `/`.

### Archive Pagination Pass

- Added a shared pagination component for archive pages.
- Updated `/posts` and `/stories` to request `4` entries per page from the API.
- Updated `/galleries` to request `4` galleries per page from the API.
- Pagination links use a readable shape:
  - Previous control.
  - First page.
  - Neighboring page links around the current page.
  - Ellipsis gaps.
  - Last page.
  - Next control.
- Page state is stored in the `page` query parameter while preserving filters such as `source`.
- Calendar links continue to reset pagination so date-filtered views start on page `1`.
- Updated `/images` differently:
  - Root image browsing paginates year groups.
  - Year image browsing paginates month groups.
  - Month image browsing paginates day groups.
  - The large grouped carousel tile presentation remains intact.
  - Image group pagination labels use group ranges such as year ranges instead of raw image counts.
- Verification:
  - `npm run build` passed.
  - `/api/posts?limit=4&cursor=0` returned `4` items out of `91`, so posts now produce `23` pages.
  - `/api/stories?limit=4&cursor=4` returned `4` items out of `1018`.
  - `/api/galleries?limit=4&cursor=0` returned `4` items out of `305`.
  - `/api/images?groupBy=year` returned `20` year groups from `2026` through `2003`.
  - Local Vite smoke checks returned `200` for `/posts`, `/posts?page=2`, `/stories?page=2`, and `/images?page=2`.

### Archive Cleanup Pass

- Removed the home page secondary links beside:
  - Recent Updates.
  - Recent Images.
- Removed the Sources card from the archive metrics rail.
- Removed archive heading Reset links from:
  - `/posts`
  - `/stories`
  - `/galleries`
  - `/images`
- The Reset links were a convenience from earlier iterations:
  - They linked back to the base archive path.
  - They cleared date path segments, source filters, and pagination query parameters.
  - They are not technically required because navigation, calendar links, breadcrumbs, and direct archive nav now cover the same escape paths.
- Removed count suffixes from post, story, and gallery archive titles, keeping counts in the range text beneath the lists.
- Changed image group pagination from `4` grouped tiles per page to `1` grouped tile per page.
- Verification:
  - `npm run build` passed.
  - Local Vite smoke checks returned `200` for `/`, `/posts`, `/stories`, `/galleries`, and `/images?page=2`.

### Image Detail Cleanup

- Removed the image breadcrumb strip from image archive and selected image views.
- Selected image page titles now render only the selected image date.
- Day-level image archive pages still include the daily image count in the title because those pages show a day collection rather than one selected image.
- Verification:
  - `npm run build` passed.
  - Confirmed no remaining `ImageBreadcrumb` or `.image-breadcrumb` references in `src`.
  - Local Vite smoke checks returned `200` for:
    - `/images/2026/04/16`
    - `/images/2026/04/16/instagram-2026-04-16-194804-better-late-than-never-01`

### Detail Page Archive Shell And Story Metadata

- Updated individual post and story detail pages to use the shared archive shell:
  - Left rail: route-aware calendar for posts or stories.
  - Center: selected post or story.
  - Right rail: Posts, Stories, and Images metric cards.
- Kept post details article-led:
  - Date, title, source, metadata, body, then attached image carousel.
- Changed story details to be media-led:
  - Date/source/metadata at the top.
  - Attached image carousel before the story body.
  - The story title is no longer rendered as the main visual heading when images exist, because the title is usually the Instagram caption repeated in the body.
- Added generated metadata fields from frontmatter:
  - `hashtags`
  - `handles`
  - `location`
  - richer `source` details such as source id, URL, caption, media count, and cross-post source.
- Added a reusable metadata chip component for categories, tags, Instagram hashtags, Instagram handles, and location.
- Corrected scalar category/tag handling in the compiler so older WordPress frontmatter such as `categories: site` is preserved instead of dropped.
- Fixed missing numeric source metadata so an absent `media_count` no longer becomes `0` in generated JSON.
- Production build passed.
- Smoke checks returned 200 for `/`, `/posts`, `/stories`, `/images`, `/posts/2010/12/25/christmas-2025`, and `/stories/2026/02/26/091137-breakfast-theroost920mass`.
