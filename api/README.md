# KansasPattons Content API

This is the first API slice for the React migration. It reads the JSON artifacts produced from Markdown and exposes them through Azure Functions.

## Content Source

The API reads content from one of two places:

- `CONTENT_BASE_URL`: a storage-backed HTTP base URL, such as `https://account.blob.core.windows.net/container/content/kansaspattons/current/`.
- `CONTENT_LOCAL_ROOT`: a local generated content folder for development. The sample value is `../public/content` when running from the `api` directory.
- `CONTENT_CACHE_SECONDS`: optional in-memory JSON cache duration per Function instance. Defaults to `60`.

`CONTENT_BASE_URL` wins when it is set. This lets local development use generated files while deployed Functions read the same shape from an Azure Storage account.

For the target content model, see [`../docs/content-model.md`](../docs/content-model.md). For the generated JSON contract, see [`../docs/content-schema.md`](../docs/content-schema.md). For the reusable multi-site storage/API pattern, see [`../docs/multi-site-content.md`](../docs/multi-site-content.md).

### Multi-Site Content Sources

The one-site routes can continue to use `CONTENT_BASE_URL` and `CONTENT_LOCAL_ROOT`. A shared Function app can also serve named sites through `/api/sites/{site}/...`.

Named-site storage can be configured with one of these patterns:

- `CONTENT_BASE_URL_TEMPLATE`, such as `https://account.blob.core.windows.net/sites/content/{site}/current/`.
- `CONTENT_SITE_BASE_URLS`, a JSON object mapping site keys to content base URLs.
- Site-specific variables, such as `CONTENT_BASE_URL_KANSASPATTONS`.

Local development has matching options:

- `CONTENT_LOCAL_ROOT_TEMPLATE`
- `CONTENT_SITE_LOCAL_ROOTS`
- Site-specific variables, such as `CONTENT_LOCAL_ROOT_KANSASPATTONS`

Resolution order for named sites is site-specific variable, JSON map, then template.

## Local Setup

### Install Azure Functions Core Tools

The `func` command comes from Azure Functions Core Tools. This project uses the v4 Node/TypeScript programming model, so install Core Tools v4.

Microsoft's current local-development docs are here:

- Azure Functions local development: <https://learn.microsoft.com/azure/azure-functions/functions-run-local>
- Core Tools README/install options: <https://github.com/Azure/azure-functions-core-tools>

#### Windows

Recommended Microsoft path:

1. Install the v4.x Windows 64-bit MSI from the Microsoft docs.
2. Open a new PowerShell window.
3. Verify:

```powershell
func --version
```

Package-manager options from the Core Tools README:

```powershell
winget install Microsoft.Azure.FunctionsCoreTools
```

or:

```powershell
choco install azure-functions-core-tools
```

or, if you prefer npm-managed tools:

```powershell
npm install -g azure-functions-core-tools@4
```

If `func` still is not recognized, close and reopen the terminal. If that does not work, check that the install location was added to `PATH`.

Quick Windows checks:

```powershell
where.exe func
npm list -g --depth=0
npm prefix -g
```

If `npm list -g --depth=0` shows `azurite` but not `azure-functions-core-tools`, then Azurite installed but Core Tools did not. Install Core Tools with one of the commands above.

#### macOS

Microsoft's current docs use Homebrew:

```bash
brew tap azure/functions
brew install azure-functions-core-tools@4
```

If you are upgrading from an older Core Tools install:

```bash
brew update
brew link --overwrite azure-functions-core-tools@4
```

Verify:

```bash
func --version
```

### Install Azurite For Local Runtime Storage

The sample `local.settings.json` uses:

```json
"AzureWebJobsStorage": "UseDevelopmentStorage=true"
```

That tells the local Functions host to use Azurite, Azure's local Storage emulator. Install it globally:

```powershell
npm install -g azurite
```

Start Azurite in a separate terminal before `func start`:

```powershell
azurite
```

On macOS the same commands work in a shell:

```bash
npm install -g azurite
azurite
```

You can also use the Azurite extension in VS Code.

NPM may print deprecation warnings while installing Azurite, such as warnings for old transitive packages like `glob`, `rimraf`, or `uuid`. Those warnings do not necessarily mean the Azurite install failed. Verify the install with:

```powershell
azurite --version
```

If Azurite prints a version, continue. This project has been smoke-tested with Azurite `3.35.0`.

### Run This API Locally

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

Then try:

```text
http://localhost:7071/api/home
http://localhost:7071/api/posts?limit=6
http://localhost:7071/api/stories?limit=6
http://localhost:7071/api/images?groupBy=year
```

## Run The React Site Against The API

Use three terminals:

1. Start Azurite:

```powershell
cd D:\CODE\Sites\kansaspattons
azurite --location .tmp\azurite
```

2. Start the API:

```powershell
cd D:\CODE\Sites\kansaspattons
npm run api:start
```

3. Start the React dev server:

```powershell
cd D:\CODE\Sites\kansaspattons
npm run dev
```

Vite proxies `/api/*` to `http://localhost:7071`, so the React app can call same-origin API paths such as `/api/home`.

If port `5173` is already occupied by an older Vite process, start another port:

```powershell
npm run dev -- --host 127.0.0.1 --port 5174
```

Then open:

```text
http://127.0.0.1:5174/
```

## Endpoints

- `GET /api/home`
- `GET /api/sites/{site}/home`
- `GET /api/sites/{site}/entries?year=2026&cursor=0&limit=24`
- `GET /api/posts?year=2013&month=08&day=10&cursor=0&limit=24`
- `GET /api/posts?source=wordpress&cursor=0&limit=24`
- `GET /api/posts/{year}/{month}/{day}/{slug}`
- `GET /api/sites/{site}/posts?year=2013&month=08&day=10&cursor=0&limit=24`
- `GET /api/sites/{site}/posts/{year}/{month}/{day}/{slug}`
- `GET /api/stories?year=2026&month=04&cursor=0&limit=24`
- `GET /api/stories?source=instagram&cursor=0&limit=24`
- `GET /api/stories/{year}/{month}/{day}/{slug}`
- `GET /api/sites/{site}/stories?year=2026&month=04&cursor=0&limit=24`
- `GET /api/sites/{site}/stories/{year}/{month}/{day}/{slug}`
- `GET /api/galleries?year=2010&month=12&cursor=0&limit=24`
- `GET /api/galleries?source=facebook&cursor=0&limit=24`
- `GET /api/galleries/{year}/{month}/{day}/{slug}`
- `GET /api/sites/{site}/galleries?year=2010&month=12&cursor=0&limit=24`
- `GET /api/sites/{site}/galleries/{year}/{month}/{day}/{slug}`
- `GET /api/images?year=2026&month=04&day=16&cursor=0&limit=48`
- `GET /api/images?groupBy=year`
- `GET /api/images?galleryId=instagram-2026-04-16-194804-better-late-than-never`
- `GET /api/images/{year}/{month}/{day}/{imageId}`
- `GET /api/sites/{site}/images?groupBy=year`
- `GET /api/sites/{site}/images/{year}/{month}/{day}/{imageId}`

The list endpoints return archive calendar data, filters, and paged items. Post, story, and gallery lists can filter by `source`. Image lists can also return grouped previews with `groupBy=year`, `groupBy=month`, or `groupBy=day`, or narrow to one or more galleries with comma-separated `galleryId` values.

## Publish Flow

1. Build JSON from Markdown and gallery records.
2. Upload generated JSON artifacts to a storage account container/prefix.
3. Point the Function app at that prefix with `CONTENT_BASE_URL`.
4. React consumes the Function app endpoints instead of loading large generated indexes directly.

### Publish JSON To Azure Storage

The repo includes a publish script that uploads `public/content/**` to Azure Blob Storage.

Dry run first:

```powershell
$env:CONTENT_SITE_KEY = "kansaspattons"
$env:CONTENT_STORAGE_ACCOUNT = "prdwebappstorage"
$env:CONTENT_STORAGE_CONTAINER = "kansaspattons"
npm run publish:content:dry-run
```

The dry run rebuilds content, validates required artifacts, prints file counts, and shows the `CONTENT_BASE_URL` to use for the Function app.

Actual upload:

```powershell
$env:CONTENT_SITE_KEY = "kansaspattons"
$env:CONTENT_STORAGE_ACCOUNT = "prdwebappstorage"
$env:CONTENT_STORAGE_CONTAINER = "kansaspattons"
npm run publish:content
```

macOS/bash equivalent:

```bash
export CONTENT_SITE_KEY="kansaspattons"
export CONTENT_STORAGE_ACCOUNT="prdwebappstorage"
export CONTENT_STORAGE_CONTAINER="kansaspattons"
npm run publish:content:dry-run
```

Authentication options:

- Use `az login` and let `DefaultAzureCredential` authenticate the upload.
- Or set `AZURE_STORAGE_CONNECTION_STRING`.

Optional settings:

- `CONTENT_SITE_KEY`: defaults to `kansaspattons`; also controls the default storage prefix.
- `CONTENT_SITE_TITLE`: defaults to `KansasPattons`.
- `CONTENT_SITE_URL`: optional canonical site URL included in `site.json`.
- `CONTENT_SITE_AUTHOR_JSON`: optional author object included in `site.json`.
- `CONTENT_SITE_NAV_JSON`: optional navigation array included in `site.json`.
- `CONTENT_SITE_THEME_JSON`: optional theme object included in `site.json`.
- `CONTENT_SITE_BANNER_EYEBROW`, `CONTENT_SITE_BANNER_TITLE`, `CONTENT_SITE_BANNER_TEXT`, `CONTENT_SITE_BANNER_IMAGE`: optional banner overrides.
- `CONTENT_SITE_FOOTER_BRAND`, `CONTENT_SITE_FOOTER_TEXT`, `CONTENT_SITE_FOOTER_LINKS_JSON`, `CONTENT_SITE_FOOTER_COPYRIGHT`: optional footer overrides.
- `CONTENT_PUBLISH_ROOT`: defaults to `public/content`.
- `CONTENT_STORAGE_PREFIX`: full generated-content Blob prefix; defaults to `content/{CONTENT_SITE_KEY}/current`.
- `CONTENT_STORAGE_CACHE_CONTROL`: defaults to `public, max-age=60`.
- `CONTENT_PUBLISH_DRY_RUN=true`: dry-run mode without passing `--dry-run`.

The script uploads a `_publish.json` manifest into the target prefix with the publish timestamp, file count, byte count, and content base URL.

After upload, set the Function app setting:

```text
CONTENT_BASE_URL=https://prdwebappstorage.blob.core.windows.net/kansaspattons/content/kansaspattons/current/
```

If the publish workflow explicitly sets `CONTENT_STORAGE_PREFIX=current`, use:

```text
CONTENT_BASE_URL=https://prdwebappstorage.blob.core.windows.net/kansaspattons/current/
```

For the current HTTP reader, this URL must be readable by the Function app. That can mean public blob access for this content prefix or a future private-storage reader that uses Azure credentials.
