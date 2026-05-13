# KansasPattons Content API

This is the first API slice for the React migration. It reads the JSON artifacts produced from Markdown and exposes them through Azure Functions.

## Content Source

The API reads content from one of two places:

- `CONTENT_BASE_URL`: a storage-backed HTTP base URL, such as `https://account.blob.core.windows.net/container/content/kansaspattons/current/`.
- `CONTENT_LOCAL_ROOT`: a local generated content folder for development. The sample value is `../public/content` when running from the `api` directory.
- `CONTENT_CACHE_SECONDS`: optional in-memory JSON cache duration per Function instance. Defaults to `60`.

`CONTENT_BASE_URL` wins when it is set. This lets local development use generated files while deployed Functions read the same shape from an Azure Storage account.

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
