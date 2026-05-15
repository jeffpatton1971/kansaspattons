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
- One raw copy operation per image.
- One thumb copy operation per image when a real thumbnail asset exists.
- Skipped copy operation records for video thumbnail placeholders, because imported videos do not currently have generated thumbnail blobs.
- Current source URL/blob.
- Target URL/blob.
- Target collision checks.
- Case-insensitive target collision checks.
- Current source path-shape summary.

The generated manifest is intentionally written under `.tmp/`, which is ignored by git.

## Blob Copy Tooling

Preview the copy migration without touching Azure:

```powershell
npm run assets:migrate
```

Run a small write batch first:

```powershell
npm run assets:migrate:write -- --limit=20
```

Run the full migration:

```powershell
npm run assets:migrate:write
```

The migration runner:

- Reads `.tmp/image-storage-migration-manifest.json`.
- Re-checks manifest collision counts before copying.
- Creates the target container if needed.
- Copies each source blob to the canonical target blob with Azure Blob `syncCopyFromURL`.
- Skips existing target blobs by default so the migration can be safely re-run.
- Skips video thumbnail placeholder operations by default.
- Writes `.tmp/image-storage-migration-result.json` after write runs.
- Never deletes old blobs.

Useful options:

```powershell
npm run assets:migrate -- --kind=raw
npm run assets:migrate -- --kind=thumb
npm run assets:migrate:write -- --offset=1000 --limit=500
npm run assets:migrate:write -- --concurrency=12
npm run assets:migrate:write -- --overwrite
npm run assets:migrate:write -- --include-video-thumbs
```

Use `--overwrite` only when you deliberately want to recopy blobs that already exist at the canonical target path.
Use `--include-video-thumbs` only if video thumbnails have been generated as real blobs and should be copied.

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
npm run assets:manifest -- --include-video-thumbs
```

The migration runner authenticates the same way the publish tooling does:

```powershell
$env:AZURE_STORAGE_CONNECTION_STRING = "<storage connection string>"
npm run assets:migrate:write -- --limit=20
```

Or use Azure identity after logging in with the Azure CLI:

```powershell
az login
npm run assets:migrate:write -- --limit=20
```

On Windows, Azure PowerShell auth also works:

```powershell
Connect-AzAccount
npm run assets:migrate:write -- --limit=20
```

If a write run fails with Azure storage authentication before processing any operations, no blobs were copied. Set a connection string or sign in, then re-run the same command.

## Migration Sequence

1. Generate the manifest and confirm there are zero target collisions.
2. Run `npm run assets:migrate` and confirm the operations in scope.
3. Run a small `npm run assets:migrate:write -- --limit=20` batch.
4. Run `npm run assets:migrate:write` for the full copy.
5. Verify every target blob exists.
6. Update the content compiler to compute `rawUrl` and `thumbUrl` from the canonical storage shape.
7. Keep old blobs in place during a burn-in period.
8. Remove legacy blob paths only after the React/API site has been verified against the canonical paths.

The `_gallery` Markdown files should continue to exist as image metadata records for now. Once the compiler computes canonical URLs, authored `raw_url` and `thumb_url` can become compatibility fields or be removed in a later cleanup.
