# Multi-Site Content Hosting

The content pipeline should work for KansasPattons and other sites without forcing all sites into one repository. The preferred shape is:

1. Each site keeps its own source repository and authoring workflow.
2. Each repository runs the same Markdown-to-JSON build.
3. GitHub Actions publishes that site's generated JSON to a site-specific Azure Storage prefix.
4. One Azure Functions API can serve either the default site routes or named site routes.

## Storage Layout

Use one storage account and either one shared container or one container per site. The shared-container layout keeps the API configuration simple:

```text
https://account.blob.core.windows.net/sites/content/kansaspattons/current/
https://account.blob.core.windows.net/sites/content/patton-tech/current/
https://account.blob.core.windows.net/sites/content/another-site/current/
```

The publish script defaults to this blob prefix pattern:

```text
content/{CONTENT_SITE_KEY}/current
```

For KansasPattons that becomes:

```text
content/kansaspattons/current
```

The actual blob container is controlled separately by `CONTENT_STORAGE_CONTAINER`.

## Publishing From Each Repo

Each site repo can publish with the same command shape:

```powershell
$env:CONTENT_SITE_KEY = "kansaspattons"
$env:CONTENT_SITE_TITLE = "KansasPattons"
$env:CONTENT_STORAGE_ACCOUNT = "prdwebappstorage"
$env:CONTENT_STORAGE_CONTAINER = "sites"
npm run publish:content
```

If a site needs a different prefix, set it explicitly:

```powershell
$env:CONTENT_STORAGE_PREFIX = "content/kansaspattons/current"
```

The publish script writes a `_publish.json` manifest beside the generated artifacts.

## API Route Options

The original one-site routes still work:

```text
GET /api/home
GET /api/posts
GET /api/stories
GET /api/images
```

Named site routes are available for a shared API:

```text
GET /api/sites/{site}/home
GET /api/sites/{site}/entries
GET /api/sites/{site}/posts
GET /api/sites/{site}/posts/{year}/{month}/{day}/{slug}
GET /api/sites/{site}/stories
GET /api/sites/{site}/stories/{year}/{month}/{day}/{slug}
GET /api/sites/{site}/galleries
GET /api/sites/{site}/galleries/{year}/{month}/{day}/{slug}
GET /api/sites/{site}/images
GET /api/sites/{site}/images/{year}/{month}/{day}/{imageId}
```

Site keys are lowercase letters, numbers, and hyphens. Examples:

```text
kansaspattons
patton-tech
another-site
```

## API Storage Configuration

For a single default site, use the existing setting:

```text
CONTENT_BASE_URL=https://prdwebappstorage.blob.core.windows.net/sites/content/kansaspattons/current/
```

For a shared API, the easiest configuration is a template:

```text
CONTENT_BASE_URL_TEMPLATE=https://prdwebappstorage.blob.core.windows.net/sites/content/{site}/current/
```

Then `/api/sites/kansaspattons/home` reads:

```text
https://prdwebappstorage.blob.core.windows.net/sites/content/kansaspattons/current/home.json
```

You can also use an explicit JSON map:

```json
{
  "kansaspattons": "https://prdwebappstorage.blob.core.windows.net/sites/content/kansaspattons/current/",
  "patton-tech": "https://prdwebappstorage.blob.core.windows.net/sites/content/patton-tech/current/"
}
```

Put that JSON in:

```text
CONTENT_SITE_BASE_URLS
```

Local development has matching options:

```text
CONTENT_LOCAL_ROOT=../public/content
CONTENT_LOCAL_ROOT_TEMPLATE=../sites/{site}/public/content
CONTENT_SITE_LOCAL_ROOTS={"kansaspattons":"../public/content","patton-tech":"../patton-tech/public/content"}
```

Resolution order for named sites:

1. Site-specific environment variable, such as `CONTENT_BASE_URL_KANSASPATTONS`.
2. JSON map, such as `CONTENT_SITE_BASE_URLS`.
3. Template, such as `CONTENT_BASE_URL_TEMPLATE`.

The same order applies to local roots.

## Recommended First Deployment

Start with KansasPattons as the default site:

```text
CONTENT_BASE_URL=https://prdwebappstorage.blob.core.windows.net/sites/content/kansaspattons/current/
```

Then add named-site support before onboarding the second site:

```text
CONTENT_BASE_URL_TEMPLATE=https://prdwebappstorage.blob.core.windows.net/sites/content/{site}/current/
```

That lets the same Function app serve both:

```text
/api/home
/api/sites/kansaspattons/home
/api/sites/patton-tech/home
```

If blob content is private, the current HTTP reader will need to be replaced or extended with an authenticated Azure Blob reader. The generated JSON shape and route design do not need to change for that.
