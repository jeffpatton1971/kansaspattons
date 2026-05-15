# Content Contract

This is the target contract for the shared content platform. It is the shape new
content should move toward, even while the current generated JSON still carries
some compatibility fields from the Jekyll and social imports.

## Contract Goals

- Only three authored content types exist: `post`, `story`, and `gallery`.
- Images and videos are media assets, not authored content pages.
- `_gallery` is legacy import metadata and should disappear from normal
  authoring once the publish pipeline owns media upload and indexing.
- All authored content shares one envelope and one metadata block.
- Child payloads differ only where the content actually behaves differently.
- The contract should work across multiple sites without site-specific API code.

## Shared Envelope

Every published content document should have the same outer shape.

```ts
type ContentType = "post" | "story" | "gallery";
type ContentStatus = "draft" | "published" | "archived";

type ContentEnvelope<TPayload> = {
  schemaVersion: "2026-05-15";
  site: SiteRef;
  id: string;
  contentType: ContentType;
  status: ContentStatus;
  title: string;
  slug: string;
  route: string;
  canonicalUrl?: string;
  dates: ContentDates;
  metadata: ContentMetadata;
  payload: TPayload;
  legacy?: LegacyContentInfo;
};

type SiteRef = {
  key: string;
  title?: string;
};

type ContentDates = {
  published: string;
  updated?: string;
  created?: string;
};
```

The `legacy` block is optional migration information. New content should not
need it, and renderers should not rely on it for normal behavior.

```ts
type LegacyContentInfo = {
  source?: "wordpress" | "instagram" | "facebook" | "manual";
  sourceId?: string;
  sourceUrl?: string;
  legacyUrl?: string;
  importedAt?: string;
};
```

## Shared Metadata

Metadata belongs to every authored content type.

```ts
type ContentMetadata = {
  summary?: string;
  authors: PersonRef[];
  people?: PersonRef[];
  hashtags: string[];
  locations?: LocationRef[];
  coverMedia?: MediaRef;
  categories?: string[];
  related?: RelatedContentRef[];
};

type PersonRef = {
  id?: string;
  name: string;
  handle?: string;
  url?: string;
};

type LocationRef = {
  name: string;
  locality?: string;
  region?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
};

type RelatedContentRef = {
  contentType: ContentType;
  id: string;
  route?: string;
  title?: string;
  rel?: "gallery" | "companion" | "previous" | "next" | "related";
};
```

`tags` should not be part of the final contract. Existing tags should be folded
into `hashtags` when they are topical labels. Import/system labels such as
`wordpress`, `instagram`, and `facebook` should move into `legacy.source` or
published metrics, not user-facing tags.

Current normalization also removes migration-only labels such as `gallery` and
`album` from user-facing taxonomy fields.

Hashtags must be stored without a leading `#`, lowercase, and with no spaces.
For example, author `Good Morning` or `#GoodMorning` as `goodmorning`.
Known typo aliases are normalized during taxonomy cleanup and enforced by
validation, such as `brekfast` to `breakfast` and `tradtions` to `traditions`.

`categories` are provisional. They can remain as an optional field while we
decide whether we need curated site sections, but they should not be required
for routing, search, or filtering yet.

Current category cleanup keeps categories as curated site buckets, seasons,
holidays, and event concepts. Known aliases normalize spelling and readability
variants such as `Birthdays` to `Birthday`, `Fourth Of July` to `July 4th`, and
`New Years Day` to `New Year`.

People and places should not remain in categories. Current entity cleanup moves
`Nathan`, `Natalie`, `Sarah`, `Grandma`, and `Grandpa` into `people`, and moves
`CPLS` / `Cair Paravel Latin School` / `Cair Paravel` and `Crown Center` into
`locations`.

## Media References

Posts, stories, and galleries reference media by canonical media key.

```ts
type MediaKind = "image" | "video";

type MediaRef = {
  id: string; // yyyy/mm/dd/filename.ext
  kind?: MediaKind;
  caption?: string;
  alt?: string;
  credit?: string;
};
```

Media assets are generated publish artifacts. They back the raw `/images`
library, but they are not authored content documents.

```ts
type MediaAsset = {
  site: SiteRef;
  id: string; // yyyy/mm/dd/filename.ext
  kind: MediaKind;
  date: string;
  filename: string;
  rawUrl: string;
  thumbUrl?: string;
  posterUrl?: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
  caption?: string;
  alt?: string;
  usedBy?: RelatedContentRef[];
  legacy?: LegacyContentInfo;
};
```

Canonical storage paths remain:

```text
https://{account}.blob.core.windows.net/{siteId}/images/yyyy/mm/dd/filename.ext
https://{account}.blob.core.windows.net/{siteId}/thumbs/yyyy/mm/dd/filename.ext
```

## Post Payload

Posts are article-shaped content and live under `/posts`.

```ts
type PostPayload = {
  bodyMarkdown: string;
  bodyHtml: string;
  media?: MediaRef[];
  galleries?: RelatedContentRef[];
  relatedPosts?: RelatedContentRef[];
};
```

Policy:

- A post may use direct media for small attached sets.
- A post may reference one or more galleries.
- Linked galleries should render inline on the post detail page and also remain
  available under `/galleries`.
- Posts can link to other posts through `relatedPosts`.

## Story Payload

Stories are image-first or social-shaped content and live under `/stories`.

```ts
type StoryPayload = {
  text?: string;
  bodyMarkdown?: string;
  bodyHtml?: string;
  media: MediaRef[];
  galleries?: RelatedContentRef[];
};
```

Policy:

- A story should render media first, with text below it.
- The default story view should feel closer to an Instagram post than a blog
  article.
- A story may still reference a gallery when the image set has a meaningful
  collection identity.

## Gallery Payload

Galleries are ordered media collections and live under `/galleries`.

```ts
type GalleryPayload = {
  descriptionMarkdown?: string;
  descriptionHtml?: string;
  coverMedia: MediaRef;
  media: MediaRef[];
};
```

Policy:

- A gallery owns an ordered media list.
- Each media item may have its own caption and alt text.
- One media item is the cover.
- A gallery may stand alone or be linked from posts/stories.

## Archive And Discovery

Core routes:

```text
/posts
/stories
/galleries
/images
/hashtags/{hashtag}
/search
```

Hashtags should be clickable everywhere they render. A hashtag view should
return matching posts, stories, and galleries together, sorted by date.

Search should index:

- title
- summary
- body text
- captions
- hashtags
- people
- location names

## Publish Triggers

Recommended GitHub Actions split:

- `pull_request`: full validation and full site rebuild, but no production
  publish.
- `push` to `main`: incremental publish for changed Markdown and changed local
  media.
- `workflow_dispatch`: manual full rebuild and republish for repairs,
  migrations, dependency updates, and index regeneration.

The full rebuild path should always remain available, but it should not be the
default for every content edit.

## Shared API Direction

The API should be treated as a shared platform component, even while it lives in
this repo during early development.

Target endpoint families:

```text
/api/sites/{site}/home
/api/sites/{site}/posts
/api/sites/{site}/stories
/api/sites/{site}/galleries
/api/sites/{site}/images
/api/sites/{site}/hashtags/{hashtag}
/api/sites/{site}/search
```

Before extracting the API to its own repo, the site-specific assumptions should
be isolated behind:

- site configuration
- storage prefixes
- generated content contracts
- tests that can run against more than one fixture site

## Validation And Tests

The publish pipeline should fail before publishing when content is invalid.

Validation should cover:

- frontmatter matches the content contract
- exactly one of `post`, `story`, or `gallery` is used
- canonical media keys exist after publish rewrite
- cover media exists in the media list or media index
- hashtags are normalized
- required authors are present
- routes are unique per site
- canonical media keys have no collisions
- `_gallery` is not required for new authored content

The initial validator command is:

```powershell
npm run content:validate
```

It writes `.tmp/content-validation-report.json` and separates hard errors from
target-contract cleanup counts so migrated content can be tightened in measured
passes.

Test coverage should include:

- content compiler unit tests
- publish rewrite dry-run tests
- API endpoint tests against fixture content
- frontend smoke tests for core routes
- dependency-update CI that runs build, API build, validation, and tests
