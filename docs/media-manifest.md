# Media Manifest

The media manifest replaces the old Jekyll-era one-Markdown-file-per-image
model. The React/API site uses this manifest as the media source of truth.

## Goals

- Avoid creating one Markdown file per image.
- Keep images/videos decoupled from posts, stories, and galleries.
- Track canonical Azure Storage paths.
- Track captions, alt text, dimensions, hashes, and usage relationships.
- Support incremental publish without scanning every blob every time.
- Work across multiple sites using the same shape.

## Manifest Location

The first implementation uses a checked-in source manifest:

```text
content/media/index.json
```

The content build publishes that manifest into generated JSON artifacts:

```text
public/content/media/index.json
dist/content/media/index.json
```

During migration, `public/content/images/index.json` can continue to exist as
the React/API media-browse index. Long term, it can either be generated from the
media manifest or folded into the same endpoint.

For very large sites, the manifest can later be sharded:

```text
media/index.json
media/2026/index.json
media/2026/04/index.json
```

## Shape

```ts
type MediaManifest = {
  schemaVersion: "2026-05-15";
  generatedAt: string;
  site: {
    key: string;
    title?: string;
  };
  storage: {
    accountName: string;
    containerName: string;
    baseUrl: string;
    rawPrefix: "images";
    thumbPrefix: "thumbs";
  };
  assets: MediaAsset[];
};

type MediaAsset = {
  id: string; // yyyy/mm/dd/filename.ext
  kind: "image" | "video";
  date: string;
  year: string;
  month: string;
  day: string;
  filename: string;
  title?: string;
  caption?: string;
  alt?: string;
  rawUrl: string;
  thumbUrl?: string;
  posterUrl?: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
  contentType?: string;
  byteSize?: number;
  hash?: {
    algorithm: "sha256";
    value: string;
  };
  people?: string[];
  locations?: string[];
  usedBy?: MediaUsage[];
  legacy?: {
    galleryMarkdownId?: string;
    source?: "wordpress" | "instagram" | "facebook" | "legacy";
    sourceFilename?: string;
    sourceUrl?: string;
    postId?: string;
    galleryId?: string;
  };
};

type MediaUsage = {
  contentType: "post" | "story" | "gallery";
  id: string;
  route?: string;
  role?: "cover" | "inline" | "gallery-item" | "story-media";
};
```

## Publish Flow

For new content:

1. Author Markdown with local image filenames.
2. Publish uploads raw media to `images/yyyy/mm/dd/filename.ext`.
3. Publish creates thumbnails or video posters.
4. Publish rewrites Markdown media refs to canonical media keys.
5. Publish updates the media manifest with the new/changed assets.
6. Build uses the media manifest.

The current dry-run planning command is:

```powershell
npm run publish:plan
```

It reads changed Markdown from the Git working tree, resolves local draft media
references, computes SHA-256 hashes and byte sizes, detects canonical key
collisions against `content/media/index.json`, and reports the media manifest
assets that would be added.

The current media upload dry run and write command are:

```powershell
npm run publish:media:dry-run
npm run publish:media
```

`publish:media` uploads local draft media from the publish plan to canonical
Azure Blob paths. It does not overwrite existing blobs by default. Image uploads
generate resized thumbnail files with `sharp`, then upload those thumbnails to
the planned `thumbs/yyyy/mm/dd/filename.ext` paths. Video uploads generate
poster images with `ffmpeg-static`, then upload those posters under the
`thumbs` prefix as `.jpg` files.

The current source-prep command is:

```powershell
npm run publish:prepare
```

It applies the planned Markdown rewrites and appends planned media assets to
`content/media/index.json` when the plan has no issues. It intentionally does
not remove local draft media files or publish generated JSON yet.

The current local draft media cleanup commands are:

```powershell
npm run publish:cleanup-media
npm run publish:cleanup-media:write
```

Cleanup is separate from upload and source prep. It reads the publish plan and
media publish result, verifies the authored Markdown now references canonical
media keys, verifies raw upload completion for newly added media, then removes
the local draft files only in explicit write mode.

The current incremental generated-content publish commands are:

```powershell
npm run publish:content:incremental:dry-run
npm run publish:content:incremental
```

The incremental content build writes only the generated JSON paths listed by
the publish plan, and the publish step uploads only those same JSON paths.

For existing content, the initial source manifest has already been generated
and checked in at `content/media/index.json`. The compiler and validator require
that manifest, and the publish pipeline now owns new media additions.

## Why Not Store This In Posts?

Posts, stories, and galleries should only reference media IDs. The manifest owns
media facts:

- storage URLs
- file hashes
- dimensions
- thumbnail/poster paths
- legacy import details
- usage relationships

This lets the same media asset be reused by more than one content item without
duplicating storage details everywhere.
