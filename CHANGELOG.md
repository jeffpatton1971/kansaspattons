# Changelog

Published behavior changes and bug fixes for the React site migration.

## Unreleased

### Added

- Started the React migration branch with a documented split between detailed iteration notes and public-facing changelog entries.
- Added a Vite, React, and TypeScript application shell.
- Added a content compiler that converts existing `_posts` and `_gallery` Markdown into generated JSON content for React.
- Added post archive routes for all posts, year, month, day, and individual post views.
- Added image archive routes for all images, year, month, day, and selected image views.
- Added horizontal archive shelves for browsing years, months, and days.
- Added carousel-style browsing for images attached to individual posts.
- Added legacy `/blog/:year/:month/:day/:slug.html` redirect support into the new post route shape.
- Added a reusable archive calendar control for date-based browsing.
- Added a shared archive page shell with a left calendar rail and central content area for posts and images.
- Added an author information card in the home page left rail.
- Added a separate Stories archive and detail route for social/media-shaped entries.
- Added generated content indexes for posts, stories, and all entries.
- Added a compact generated `home.json` summary for the home page.
- Added generated cover image metadata to entry summaries.
- Added shared Posts, Stories, and Images metric cards to archive and detail page right rails.
- Added generated story metadata for hashtags, Instagram handles, location, and richer source details.
- Added metadata chips for categories, tags, hashtags, handles, and location on post and story detail pages.
- Added recent stories to the compact home page summary.
- Added a shared compact home entry card for recent posts and recent stories.
- Added a generated `recentEntries` home feed that combines recent posts and stories.
- Added a TypeScript Azure Functions API scaffold for storage-backed content endpoints.
- Added API endpoints for home, posts, stories, images, entry details, and image details.
- Added API list filtering and paging by date with cursor/limit query parameters.
- Added API documentation and local settings sample for reading generated content from local files or a storage URL.
- Added short-lived API artifact caching with configurable `CONTENT_CACHE_SECONDS`.
- Added Windows and macOS setup documentation for Azure Functions Core Tools and Azurite.
- Added troubleshooting notes for Azurite npm warnings and missing `func` PATH setup.
- Added a Vite `/api` proxy for local React development against Azure Functions.
- Added an `/api/entries` endpoint for legacy redirect lookups.
- Added frontend API adapters so existing pages can consume API list responses.

### Changed

- Added `source.type: wordpress` frontmatter to older WordPress-tagged posts that were missing structured source metadata.
- Split generated entries into WordPress-shaped Posts and Instagram/Facebook-shaped Stories.
- Updated legacy `/blog/...` redirects to resolve to either Posts or Stories based on generated entry metadata.
- Changed the home page to load the compact summary instead of full post, story, and image indexes.
- Changed the home page to show posts and stories together in a single date-sorted Recent Updates stream.
- Changed WordPress-shaped Posts to render as article-style cards with expanded excerpts.
- Changed Stories to render as image-first media cards.
- Made post cards fully clickable instead of using a separate `Open` button.
- Changed image archive browsing so thumbnails render only after selecting a specific day.
- Changed image archive navigation to show a single year/month/day shelf at a time instead of stacked shelves.
- Changed month-level image browsing to show thumbnails grouped by day.
- Changed year-level image browsing to show thumbnails grouped by month.
- Changed root image browsing to show thumbnails grouped by year.
- Limited broad image-group thumbnail previews and added a compact overflow tile linking into the full group.
- Changed grouped image previews from filmstrip-style thumbnail rows to larger carousel-style panels with arrow controls.
- Added Embla Carousel for grouped image previews and restyled those previews as layered stacked carousels.
- Changed `/posts` from an all-posts view to a calendar-led month/day archive view.
- Changed `/images` to include the same calendar archive control in the left rail while preserving visual image browsing in the center.
- Changed the home page to use the shared left/main/right shell layout.
- Moved the home page Posts and Images metric cards into the right rail.
- Changed individual post and story detail pages to use the shared archive shell with a left calendar rail and right metric rail.
- Changed story detail pages to lead with the attached image carousel before rendering the story body.
- Changed the content compiler to preserve scalar category and tag frontmatter values.
- Changed the React content fetch layer to use `/api/...` endpoints instead of direct `/content/...` JSON files.
- Simplified selected image detail into a breadcrumb-led view with the image as the primary focus.

### Fixed

- Added Vite client type declarations so TypeScript accepts the app stylesheet import during production builds.
- Prevented TypeScript from emitting generated JavaScript for Vite configuration during production builds.
- Fixed generated legacy post dates with spaced timezone offsets that could blank the `/posts` route at runtime.
- Made date label rendering defensive so malformed dates do not crash archive pages.
- Fixed missing numeric source metadata being emitted as `0` in generated content.
