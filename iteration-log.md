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
