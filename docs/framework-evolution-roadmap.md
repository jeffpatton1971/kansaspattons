# Framework Evolution Roadmap

This roadmap describes how to evolve the current React/API migration into a
Jekyll-like, extensible React content framework for multiple sites:

- KansasPattons: image-heavy family archive.
- sysop71: mixed creator site with posts, images, video, and gaming content.
- PattonTech: mostly text-heavy technical blog.

The goal is not to clone Jekyll. The goal is to keep Jekyll's best extension
ideas, especially collections, layouts, frontmatter, and themes, while using a
React render layer and shared API.

## Target Architecture

```text
Authoring source
  Markdown, frontmatter, media manifests, collection definitions

Builder / Compiler
  Parses, validates, normalizes, derives content types, writes JSON

Content Runtime / API
  Serves generated content through /api/{siteid}/...

Layout Engine
  Chooses page structure from item type, collection config, and site layout

Render Engine
  React routes, data loading, loading/error states, components

Theme System
  Tailwind tokens, CSS variables, skins, icons, typography, UI primitives
```

The key separation:

```text
Compiler decides what content is.
Layout engine decides what structure it uses.
Render engine draws it.
Theme decides how it feels.
```

## Core Domain Model

Introduce a base `Item` model that every authored collection derives from.

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
  coverImage?: MediaRef;
  imageIds?: string[];
  galleryIds?: string[];
  related?: RelatedItemRef[];
  legacy?: Record<string, unknown>;
  presentation?: PresentationHints;
};
```

Derived authored types extend the base item:

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

This is not necessarily class inheritance in TypeScript. Prefer discriminated
types and schema composition, but keep the same mental model: every collection
inherits the shared `Item` envelope and adds fields.

Example:

```ts
type Post = Item & {
  itemType: 'post';
  readingTime?: number;
};

type GalleryPost = Post & {
  itemType: 'gallery-post';
  galleryIds: string[];
};

type Tournament = Item & {
  itemType: 'tournament';
  game: string;
  startDate: string;
  endDate?: string;
  teams: TournamentTeam[];
  winner?: string;
};
```

## Phase 1: Preserve Config And Presentation Metadata

Status: partially started.

Goals:

- `content/site.config.json` remains the site-author editable source of truth.
- `public/content/site.json` remains generated output.
- Optional config sections stay optional.
- Add explicit `layout` config alongside `theme`.
- Preserve page/post frontmatter presentation hints instead of discarding them.

Add to `site.config.json`:

```json
{
  "theme": {
    "name": "patton-modern",
    "skin": "dark"
  },
  "layout": {
    "preset": "media-archive",
    "home": {
      "banner": true,
      "authorCard": true,
      "sections": ["recentEntries", "recentImages"]
    },
    "posts": {
      "archiveCard": "text-summary",
      "detailLayout": "article"
    }
  }
}
```

Jekyll-style frontmatter to preserve:

```yaml
layout: single
classes:
  - wide
toc: true
author_profile: true
header:
  overlay_image: /assets/images/header.jpg
sidebar:
  nav: docs
```

Compiler output should normalize that to:

```json
{
  "layout": "single",
  "presentation": {
    "classes": ["wide"],
    "toc": true,
    "authorProfile": true,
    "header": {
      "overlayImage": "/assets/images/header.jpg"
    },
    "sidebar": {
      "nav": "docs"
    }
  }
}
```

Acceptance criteria:

- `site.json` includes `theme` and `layout`.
- Existing KansasPattons output does not regress.
- sysop71 can omit banner and author.
- PattonTech can carry Minimal Mistakes-style frontmatter without losing it.

## Phase 2: Define The Item Contract

Goals:

- Add a formal base item type in docs and TypeScript.
- Rename internal types toward `ItemSummary`, `ItemDocument`, and
  `CollectionIndex`.
- Keep backward-compatible aliases while migrating.
- Make `PostSummary` and `PostDocument` derived types, not the root concept.

Generated JSON should move toward:

```text
public/content/items/index.json
public/content/posts/index.json
public/content/posts/{year}/{month}/{day}/{slug}.json
```

Do not remove current `posts`, `stories`, and `galleries` routes during this
phase. Add the generic item layer beside them first.

Acceptance criteria:

- Shared fields are documented once as `Item`.
- Existing post/story/gallery JSON still works.
- Search and taxonomy can reference any `Item`-derived type.

## Phase 3: Collection Definitions

Goals:

- Reintroduce Jekyll-style collections as first-class framework config.
- Let sites define folders such as `_tournaments`, `_projects`, or `_events`.
- Let each collection extend the base item contract with custom fields.

Proposed source:

```text
content/collections.json
_tournaments/
_projects/
_events/
```

Example:

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
        "status": {
          "type": "enum",
          "values": ["upcoming", "active", "completed"]
        },
        "teams": { "type": "array" },
        "winner": { "type": "string" }
      }
    }
  }
}
```

Generated output:

```text
public/content/tournaments/index.json
public/content/tournaments/{slug}.json
```

API routes:

```text
/api/{siteid}/collections/tournaments
/api/{siteid}/collections/tournaments/{slug}
```

Optional friendly aliases:

```text
/api/{siteid}/tournaments
/api/{siteid}/tournaments/{slug}
```

Acceptance criteria:

- sysop71 `_tournaments` can compile without custom one-off code.
- Collection documents participate in search and taxonomy when configured.
- Collection schemas validate frontmatter.

## Phase 4: Layout Engine

Goals:

- Separate page structure from visual theme.
- Resolve layouts from item frontmatter, collection config, and site defaults.
- Support layout presets for different site personalities.

Layout resolution order:

```text
item.presentation.layout or item.layout
collection.layout
site.layout defaults for item type
layout preset default
framework fallback
```

Example registry:

```ts
export const layoutRegistry = {
  'media-archive': mediaArchiveLayout,
  'creator-blog': creatorBlogLayout,
  'technical-blog': technicalBlogLayout,
};
```

Initial presets:

```text
media-archive
  KansasPattons. Image-heavy home, recent images, story cards.

creator-blog
  sysop71. Header/footer, no banner by default, post cards with cover images.

technical-blog
  PattonTech. Banner optional, text-first archives, no image requirement.
```

Acceptance criteria:

- KansasPattons keeps its current layout.
- sysop71 can use image-summary post cards without forking app code.
- PattonTech can use text-summary post cards and a technical article detail.

## Phase 5: Render Engine

Goals:

- Make React routing generic enough for framework collections.
- Keep loading, error, pagination, archive, and detail behavior reusable.
- Keep collection-specific detail layouts possible.

Core render engine pieces:

```text
Route registry
Archive page shell
Detail page shell
Card renderer
Section renderer
Pagination
Taxonomy/search result renderer
Media renderer
```

Config-driven page sections:

```json
{
  "layout": {
    "home": {
      "sections": ["recentPosts", "recentImages", "featuredGalleries"]
    }
  }
}
```

Section registry:

```ts
const sectionRegistry = {
  recentEntries: RecentEntriesSection,
  recentPosts: RecentPostsSection,
  recentImages: RecentImagesSection,
  featuredGalleries: FeaturedGalleriesSection,
};
```

Acceptance criteria:

- Home pages can vary by site without duplicating the whole app.
- Archive pages can render card variants from config.
- Detail pages can use layout-specific components.

## Phase 6: Theme System

Goals:

- Keep Tailwind CSS as the styling foundation.
- Keep shadcn/ui primitives available for shared controls.
- Use CSS variables for long-lived theme tokens.
- Add FontAwesome support for sites that want broader icon vocabulary.
- Keep lucide available for default framework UI icons.

Theme config controls visual language:

```json
{
  "theme": {
    "name": "patton-modern",
    "skin": "dark",
    "fontFamily": "Geist",
    "accent": "#78a6cb",
    "radius": "0.5rem",
    "icons": {
      "provider": "fontawesome"
    }
  }
}
```

FontAwesome integration should be isolated behind an icon adapter:

```ts
type IconName = string;

type IconProvider = {
  render(name: IconName, props: IconProps): ReactNode;
};
```

This lets site config use:

```json
{ "label": "Tournaments", "href": "/tournaments", "icon": "fa-trophy" }
```

without forcing every component to import FontAwesome directly.

Implementation notes:

- Continue using Tailwind utility classes for local composition.
- Keep colors, fonts, radii, and surfaces in CSS variables.
- Add FontAwesome packages only when the icon adapter is implemented.
- Avoid mixing icon libraries in individual components; route everything
  through the adapter once it exists.

Acceptance criteria:

- Existing lucide icons still work.
- FontAwesome icons can be referenced by site nav/config.
- Theme tokens can make KansasPattons, sysop71, and PattonTech feel distinct
  without layout forks.

## Phase 7: Builder / Compiler Refactor

Goals:

- Split the current large `scripts/build-content.ts` into framework modules.
- Make source readers, schema validators, item normalizers, and JSON writers
  independently testable.

Suggested module shape:

```text
scripts/content/
  compiler.ts
  config.ts
  collections.ts
  item-schema.ts
  markdown-reader.ts
  media-resolver.ts
  taxonomy-builder.ts
  search-builder.ts
  writers.ts
```

Acceptance criteria:

- Compiler tests can validate one collection without running the whole site.
- New collections require config/schema additions more than custom code.
- Incremental publish can understand collection config changes.

## Phase 8: API Generalization

Goals:

- Keep current explicit routes for stable site features.
- Add generic collection endpoints.
- Ensure API does not invent presentation defaults.

Routes:

```text
/api/{siteid}/items
/api/{siteid}/collections
/api/{siteid}/collections/{collection}
/api/{siteid}/collections/{collection}/{slug}
```

Existing routes remain:

```text
/api/{siteid}/posts
/api/{siteid}/stories
/api/{siteid}/galleries
/api/{siteid}/images
```

Acceptance criteria:

- Existing sites do not break.
- New collections can be served without custom API functions per collection.
- API tests include a custom collection fixture.

## Phase 9: Migration Proofs

Use three sites as acceptance fixtures:

### KansasPattons

```json
{
  "layout": {
    "preset": "media-archive"
  }
}
```

Must preserve:

- image-heavy homepage,
- story image cards,
- gallery/image browsing,
- family archive tone.

### sysop71

```json
{
  "layout": {
    "preset": "creator-blog",
    "home": {
      "banner": false,
      "authorCard": false,
      "sections": ["recentPosts", "recentImages"]
    },
    "posts": {
      "archiveCard": "image-summary"
    }
  }
}
```

Must support:

- mixed post and media presence,
- no required banner,
- image-summary cards,
- future `_tournaments`.

### PattonTech

```json
{
  "layout": {
    "preset": "technical-blog",
    "home": {
      "banner": true,
      "authorCard": false,
      "sections": ["recentPosts"]
    },
    "posts": {
      "archiveCard": "text-summary",
      "detailLayout": "single"
    }
  }
}
```

Must support:

- text-first archives,
- Minimal Mistakes-style `single` layout vocabulary,
- few or no post images,
- technical article readability.

## Recommended Execution Order

1. Add `layout` types to `site.config.json`, `site.json`, API types, and React
   types.
2. Add card variants for posts and stories.
3. Make archive card selection config-driven.
4. Make home sections config-driven.
5. Add layout preset registry.
6. Add base `Item` docs and TypeScript aliases.
7. Add generic collection config parsing.
8. Compile one simple custom collection from sysop71.
9. Add generic API collection endpoints.
10. Add FontAwesome icon adapter.
11. Refactor compiler internals into modules.
12. Add PattonTech as the technical-blog proof.

## Non-Goals For The First Pass

- Do not build a public plugin marketplace.
- Do not convert every current type name at once.
- Do not remove existing `/posts`, `/stories`, or `/galleries` routes.
- Do not require every site to use images.
- Do not make FontAwesome mandatory for every site.
- Do not fork the React app per site.

## Completion Criteria

The framework reaches the target shape when:

- Every authored document compiles to an `Item`-derived payload.
- Sites can define at least one custom collection without custom compiler code.
- Layout presets can change home/archive/detail structure per site.
- Themes can change visual tokens without changing layout structure.
- Tailwind remains the shared styling base.
- FontAwesome can be used through a config-driven icon adapter.
- KansasPattons, sysop71, and PattonTech all render distinct site personalities
  from the same framework.

