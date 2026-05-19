# Agent Briefing

This document is for ChatGPT, Codex, GitHub Copilot coding agent, or any AI
agent that needs to understand what this repository is and where the platform is
going.

Read this before making architectural changes.

## What This Is

This repository began as the KansasPattons site migration from a
Jekyll/GitHub Pages-style site into a React frontend backed by generated JSON
content and a shared API.

It is now also the **reference implementation** for a broader multi-site content
framework.

The framework direction is:

```text
Jekyll authoring ergonomics
+ React rendering
+ generated content JSON
+ shared multi-site API
+ site-specific layout presets
+ reusable theme tokens
+ extensible collections
```

The goal is not to clone Jekyll. The goal is to preserve the things Jekyll did
well:

- Markdown files with YAML frontmatter.
- `_posts` and custom collection folders.
- Site configuration.
- Layout names such as `single`.
- Theme conventions.
- Git-based authoring and deployment.

React, TypeScript, Tailwind, and the shared API should provide the modern
runtime and presentation layer.

## Repositories In Play

Current known sibling repositories:

```text
C:\code\sites\kansaspattons
C:\code\sites\sysop71
C:\code\sites\pattontech
C:\code\sites\ptech-sites-api
```

Responsibilities:

```text
kansaspattons
  Current framework/reference site and image-heavy family archive.

sysop71
  Sibling site using the framework. Mixed creator/gaming content. Expected to
  prove a no-banner layout and future custom collections such as tournaments.

pattontech
  Sibling site expected to prove a text-heavy technical blog layout, likely
  inspired by Minimal Mistakes and its `single` layout conventions.

ptech-sites-api
  Shared Azure Functions API. It serves generated content for multiple site ids.
  Do not move normal API runtime code back into site repos.
```

## Current Content Flow

Editable source:

```text
content/site.config.json
content/media/index.json
_posts/*.md
```

Generated output:

```text
public/content/site.json
public/content/home.json
public/content/posts/index.json
public/content/posts/{year}/{month}/{day}/{slug}.json
public/content/stories/index.json
public/content/galleries/index.json
public/content/images/index.json
public/content/search/index.json
public/content/taxonomy.json
```

Deployment/runtime flow:

```text
Markdown/frontmatter/source config
  -> npm run build:content
  -> public/content/*.json
  -> publish workflow uploads JSON/media to Azure Blob Storage
  -> ptech-sites-api reads Blob content
  -> React frontend fetches /api/{siteid}/...
  -> React renders routes and components
```

Important source/generated distinction:

```text
Edit:      content/site.config.json
Do not edit by hand: public/content/site.json
```

`public/content/site.json` is generated from `content/site.config.json`.

## Current Architecture

The current site framework has:

- React 19 frontend.
- Vite build.
- React Router.
- TypeScript.
- Tailwind CSS v4 and shadcn/ui primitives.
- Lucide icons for current built-in interface icons.
- Generated JSON content built by `scripts/build-content.ts`.
- Content validation in `scripts/validate-content.ts`.
- Azure Blob publishing scripts.
- Azure App Service Web App packaging through `webapp/server.cjs`.
- Shared API hosted separately in `ptech-sites-api`.

Current first-class content families:

```text
posts
stories
galleries
images
search
taxonomy
```

The route shape is explicit and site-scoped:

```text
/api/{siteid}/home
/api/{siteid}/posts
/api/{siteid}/posts/{year}/{month}/{day}/{slug}
/api/{siteid}/stories
/api/{siteid}/galleries
/api/{siteid}/images
/api/{siteid}/search
/api/{siteid}/taxonomy
```

Do not introduce default-site API routes such as `/api/home`.

## What We Are Building Toward

The long-term shape is documented in:

```text
docs/framework-evolution-roadmap.md
```

The big ideas:

1. Base `Item` model.
2. Derived content types.
3. Jekyll-like custom collections.
4. Builder/compiler split into modules.
5. Shared content runtime/API.
6. Layout engine.
7. Render engine.
8. Theme system.
9. Tailwind-based styling.
10. Optional FontAwesome support through an icon adapter.

Mental model:

```text
Compiler decides what content is.
Layout engine decides what structure it uses.
Render engine draws it.
Theme decides how it feels.
```

## Base Item Model

Future authored content should derive from a common `Item` concept.

Conceptually:

```ts
type Item = {
  id: string;
  siteKey: string;
  collection: string;
  itemType: string;
  title: string;
  slug: string;
  route: string;
  status: 'draft' | 'published' | 'archived';
  date?: string;
  summary?: string;
  excerpt?: string;
  bodyMarkdown?: string;
  bodyHtml?: string;
  authors?: string[];
  categories?: string[];
  hashtags?: string[];
  people?: string[];
  locations?: string[];
  coverImage?: unknown;
  imageIds?: string[];
  galleryIds?: string[];
  related?: unknown[];
  legacy?: Record<string, unknown>;
  presentation?: Record<string, unknown>;
};
```

Derived examples:

```text
Item
  Post
    GalleryPost
    TechnicalPost
    Story
  Gallery
  Page
  Tournament
  Event
  Project
```

Prefer TypeScript discriminated unions and schema composition over literal class
inheritance, but keep the inheritance mental model.

## Collections

We want to preserve Jekyll's extensibility:

```text
_posts
_tournaments
_projects
_events
```

The future collection config should allow a site to define a collection without
forking the app:

```json
{
  "collections": {
    "tournaments": {
      "label": "Tournaments",
      "source": "_tournaments",
      "route": "/tournaments",
      "itemType": "tournament",
      "layout": "tournament",
      "archiveLayout": "tournament-archive",
      "fields": {
        "game": { "type": "string", "required": true },
        "startDate": { "type": "date", "required": true },
        "teams": { "type": "array" }
      }
    }
  }
}
```

Do not solve this by writing one-off custom code for each sibling site unless
the framework is not ready yet and the work is explicitly temporary.

## Layouts Versus Themes

Keep these separate:

```text
layout = structure and information architecture
theme = visual language
```

Layout controls:

- home page composition,
- archive cards,
- detail page shape,
- banner presence,
- author/sidebar presence,
- image-heavy versus text-heavy presentation.

Theme controls:

- colors,
- fonts,
- spacing scale,
- radius,
- surfaces,
- icon provider,
- Tailwind/CSS variable values.

Expected layout presets:

```text
media-archive
  KansasPattons. Image-heavy, gallery/story/image browsing.

creator-blog
  sysop71. Header/footer, no banner by default, mixed posts and media, post
  cards with images when available.

technical-blog
  PattonTech. Text-first, Minimal Mistakes-inspired `single` layout, few or no
  post images.
```

## Theme And Styling Direction

Styling foundation:

```text
Tailwind CSS v4
shadcn/ui primitives
CSS variables for site theme tokens
```

Current built-in icons use Lucide.

Future FontAwesome support should be through an icon adapter, not direct
FontAwesome imports sprinkled across components:

```ts
type IconProvider = {
  render(name: string, props: IconProps): React.ReactNode;
};
```

This lets config use values such as:

```json
{ "label": "Tournaments", "href": "/tournaments", "icon": "fa-trophy" }
```

without making every component know about FontAwesome.

## Site Personalities

KansasPattons:

- Image-heavy family archive.
- Current layout is close to right.
- Banner and author card are appropriate when configured.
- Strong image, story, gallery, and archive browsing.

sysop71:

- Mixed creator/gaming site.
- Header/footer yes.
- No home banner unless configured.
- No author card unless configured.
- Posts should be able to render image-summary cards when post media exists.
- Should eventually support `_tournaments`.

PattonTech:

- Mostly text-heavy blog.
- Very few images.
- Likely uses banner.
- Post cards likely text-summary only.
- Should support Minimal Mistakes-like frontmatter and `layout: single`.

## Important Rules For Agents

- Read existing docs and code before editing.
- Do not add API runtime code to site repos.
- Do not invent alternate package scripts or JSON shapes for a sibling site.
- Do not edit generated `public/content/*.json` by hand as source.
- Do not make missing optional config sections render by default.
- Do not introduce hidden default site ids.
- Keep `/api/{siteid}/...` as the only public API route shape.
- Keep generated content out of Git unless the repo explicitly chooses to
  commit it.
- Preserve historical changelogs and iteration logs unless asked to curate them.
- Prefer framework improvements over one-off sibling-site hacks.

## Key Documents

Read these according to task:

```text
docs/framework-evolution-roadmap.md
  Long-term platform direction.

docs/react-api-site-migration-agent-playbook.md
  How to migrate a site repo into the current framework.

docs/adding-content-routes.md
  How to add a route family such as /stories.

docs/site-configuration.md
  How site.config.json maps to generated site.json and React shell behavior.

docs/design-system.md
  Tailwind/shadcn styling rules.

docs/content-contract.md
docs/content-schema.md
docs/content-model.md
  Current generated content shape and target content model.

docs/media-manifest.md
  Media source manifest and image/video asset handling.

docs/multi-site-content.md
  Shared API multi-site storage/routing rules.

docs/github-actions.md
  GitHub/Azure deployment setup.
```

## Validation Commands

For a site repo:

```powershell
npm run content:validate
npm run build
npm run test
git diff --check
```

For `ptech-sites-api`:

```powershell
npm test
npm run build
git diff --check
```

If changing framework-owned files for sibling repos, run the framework drift
check where applicable:

```powershell
.\templates\react-api-site\check-framework.ps1 -TargetRepo C:\code\sites\<target>
```

## Current Near-Term Direction

The best next implementation path is:

1. Add `layout` config to `site.config.json`, generated `site.json`, API types,
   and React types.
2. Add configurable post/story card variants.
3. Make archive card selection read from `site.layout`.
4. Make home sections read from `site.layout.home.sections`.
5. Add a layout preset registry.
6. Formalize `Item` types in TypeScript.
7. Add generic collection config parsing.
8. Prove `_tournaments` from sysop71.
9. Add generic API collection endpoints.
10. Add FontAwesome through an icon adapter.

Keep each step small and verified. The framework should evolve without
breaking KansasPattons, sysop71, or PattonTech.

