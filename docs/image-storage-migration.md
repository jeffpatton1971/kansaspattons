# Image Storage Migration

The long-term image storage shape removes source type from blob paths and keeps each site under its own storage container.

## Target Layout

```text
https://{account}.blob.core.windows.net/{siteId}/images/{year}/{month}/{day}/{filename}
https://{account}.blob.core.windows.net/{siteId}/thumbs/{year}/{month}/{day}/{filename}
```

For KansasPattons:

```text
https://prdwebappstorage.blob.core.windows.net/kansaspattons/images/2010/11/29/20101129-wp_0000562.jpg
https://prdwebappstorage.blob.core.windows.net/kansaspattons/thumbs/2010/11/29/20101129-wp_0000562.jpg
```

`source.type` remains image metadata, but it should not be part of the canonical asset path.

## Manifest Tooling

Generate a dry-run summary:

```powershell
npm run assets:manifest
```

Write the full JSON manifest to `.tmp/image-storage-migration-manifest.json`:

```powershell
npm run assets:manifest:write
```

The manifest includes:

- One image plan for each `_gallery` image document.
- Two copy operations per image: `raw` and `thumb`.
- Current source URL/blob.
- Target URL/blob.
- Target collision checks.
- Case-insensitive target collision checks.
- Current source path-shape summary.

The generated manifest is intentionally written under `.tmp/`, which is ignored by git.

## Configuration

Defaults are inferred from existing image metadata:

```text
CONTENT_SITE_KEY=kansaspattons
CONTENT_ASSET_CONTAINER={CONTENT_SITE_KEY}
CONTENT_ASSET_STORAGE_ACCOUNT={current raw_url account}
```

Optional overrides:

```powershell
$env:CONTENT_SITE_KEY = "kansaspattons"
$env:CONTENT_ASSET_STORAGE_ACCOUNT = "prdwebappstorage"
$env:CONTENT_ASSET_CONTAINER = "kansaspattons"
npm run assets:manifest:write
```

Equivalent CLI overrides:

```powershell
npm run assets:manifest -- --account=prdwebappstorage --container=kansaspattons --site=kansaspattons
```

## Migration Sequence

1. Generate the manifest and confirm there are zero target collisions.
2. Copy blobs from each `sourceUrl` to each `targetUrl`.
3. Verify every target blob exists.
4. Update the content compiler to compute `rawUrl` and `thumbUrl` from the canonical storage shape.
5. Keep old blobs in place during a burn-in period.
6. Remove legacy blob paths only after the React/API site has been verified against the canonical paths.

The `_gallery` Markdown files should continue to exist as image metadata records for now. Once the compiler computes canonical URLs, authored `raw_url` and `thumb_url` can become compatibility fields or be removed in a later cleanup.
