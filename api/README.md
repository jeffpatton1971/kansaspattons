# KansasPattons Content API

This is the first API slice for the React migration. It reads the JSON artifacts produced from Markdown and exposes them through Azure Functions.

## Content Source

The API reads content from one of two places:

- `CONTENT_BASE_URL`: a storage-backed HTTP base URL, such as `https://account.blob.core.windows.net/container/content/kansaspattons/current/`.
- `CONTENT_LOCAL_ROOT`: a local generated content folder for development. The sample value is `../public/content` when running from the `api` directory.
- `CONTENT_CACHE_SECONDS`: optional in-memory JSON cache duration per Function instance. Defaults to `60`.

`CONTENT_BASE_URL` wins when it is set. This lets local development use generated files while deployed Functions read the same shape from an Azure Storage account.

## Local Setup

```powershell
npm install
Copy-Item local.settings.sample.json local.settings.json
npm run build
func start
```

From the repo root:

```powershell
npm run build:content
npm run api:build
npm run api:start
```

## Endpoints

- `GET /api/home`
- `GET /api/posts?year=2013&month=08&day=10&cursor=0&limit=24`
- `GET /api/posts/{year}/{month}/{day}/{slug}`
- `GET /api/stories?year=2026&month=04&cursor=0&limit=24`
- `GET /api/stories/{year}/{month}/{day}/{slug}`
- `GET /api/images?year=2026&month=04&day=16&cursor=0&limit=48`
- `GET /api/images?groupBy=year`
- `GET /api/images/{year}/{month}/{day}/{imageId}`

The list endpoints return archive calendar data, filters, and paged items. Image lists can also return grouped previews with `groupBy=year`, `groupBy=month`, or `groupBy=day`.

## Publish Flow

1. Build JSON from Markdown and gallery records.
2. Upload generated JSON artifacts to a storage account container/prefix.
3. Point the Function app at that prefix with `CONTENT_BASE_URL`.
4. React consumes the Function app endpoints instead of loading large generated indexes directly.
