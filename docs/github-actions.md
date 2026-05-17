# GitHub Actions

The site has two workflow families: pull-request verification and production
publishing.

## Pull Request CI

Workflow:

```text
.github/workflows/pr-ci.yml
```

Triggers:

- pull requests targeting `main`
- manual `workflow_dispatch`

What it runs:

```powershell
npm ci
npm --prefix api ci
npx playwright install --with-deps chromium
npm run content:validate
npm run test
```

This is the Dependabot gate. It validates content, builds the React site, runs
Playwright smoke tests, and runs API-local tests.

## Main Branch Publish

Workflow:

```text
.github/workflows/publish.yml
```

Trigger:

- push to `main`

The main branch path is incremental. The workflow sets:

```text
PUBLISH_PLAN_BASE=${{ github.event.before }}
PUBLISH_PLAN_HEAD=${{ github.sha }}
```

Then it runs:

```powershell
npm run content:validate
npm run test
npm run publish:plan
npm run publish:media
npm run publish:prepare
npm run publish:cleanup-media
npm run publish:cleanup-media:write
npm run publish:content:incremental
npm run build
```

After `publish:prepare` and cleanup, the workflow commits source-side publish
updates back to `main` when needed. The commit message includes `[skip ci]` so
that source-normalization commit does not start a second publish run.

The workflow deploys the prebuilt `dist/` folder to Azure Static Web Apps and
deploys the `api/` folder as the managed Functions API. The React app and the
API are therefore served from the same origin, so production can keep using
`/api/...` routes.

Azure Static Web Apps reads `staticwebapp.config.json` from the deployed app
artifact. The source file lives at:

```text
public/staticwebapp.config.json
```

Vite copies that file into `dist/` during `npm run build`. The config provides
the SPA navigation fallback and leaves `/api/*` requests for the managed
Functions API.

## Tag Full Rebuild

Trigger:

- any new Git tag
- manual `workflow_dispatch`

Tag publishes are full rebuilds. This is the release/version path for larger
site-structure changes.

The tag path runs validation, tests, a full generated-content publish, a fresh
site build, and an Azure Static Web Apps deploy.

## Required GitHub Settings

The publish workflow uses three different kinds of GitHub configuration. They
look similar in YAML, but they serve different jobs.

| Name | Kind | Used by | Purpose |
| --- | --- | --- | --- |
| `AZURE_STATIC_WEB_APPS_API_TOKEN` | Secret | `Azure/static-web-apps-deploy@v1` | Authenticates the deploy action to the Azure Static Web App resource. This uploads `dist/` and the managed `api/`. |
| `AZURE_CLIENT_ID` | Secret | `azure/login@v2` | Identifies the Entra app/service principal used for Azure OIDC login. |
| `AZURE_TENANT_ID` | Secret | `azure/login@v2` | Identifies the Entra tenant for Azure OIDC login. |
| `AZURE_SUBSCRIPTION_ID` | Secret | `azure/login@v2` | Identifies the Azure subscription for Azure OIDC login. |
| `AZURE_STATIC_WEB_APP_URL` | Variable, optional | workflow environment | Production Static Web Apps URL shown on GitHub deployments. |
| `CONTENT_SITE_URL` | Variable, optional | content build | Canonical public site URL emitted into generated `site.json`. |
| `CONTENT_STORAGE_ACCOUNT` | Variable | publish scripts | Azure Storage account that receives generated JSON and media. |
| `CONTENT_STORAGE_CONTAINER` | Variable | publish scripts | Azure Blob container for this site. |
| `CONTENT_SITE_KEY` | Variable | publish scripts | Site key, currently `kansaspattons`. |
| `CONTENT_STORAGE_PREFIX` | Variable, optional | publish scripts | Optional prefix before `{site}/current/` in Blob storage. |

### Static Web Apps Deployment Token

`AZURE_STATIC_WEB_APPS_API_TOKEN` is poorly named, but it is not an API auth
token for visitors and it is not used by our `/api/*` routes.

It is the Azure Static Web Apps deployment token. The Static Web Apps deploy
action passes it to Azure so Azure knows which Static Web App resource should
receive the deployment. In our workflow it is used here:

```yaml
- name: Deploy Azure Static Web App
  uses: Azure/static-web-apps-deploy@v1
  with:
    azure_static_web_apps_api_token: ${{ secrets.AZURE_STATIC_WEB_APPS_API_TOKEN }}
    action: upload
    app_location: dist
    api_location: api
```

What it can do:

- Deploy the static frontend artifact.
- Deploy the managed Functions API from `api/`.
- Identify the target Azure Static Web App resource during deployment.

What it does not do:

- It does not grant users access to the site.
- It does not authenticate calls to `/api/home`, `/api/search`, or other API routes.
- It does not upload generated JSON or media to Blob storage.
- It does not replace `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, or
  `AZURE_SUBSCRIPTION_ID`.

Where to get it:

```text
Azure Portal
Static Web App resource
Overview
Manage deployment token
Copy token
```

Or with Azure CLI:

```powershell
az staticwebapp secrets list `
  --name <static-web-app-name> `
  --resource-group <resource-group-name> `
  --query "properties.apiKey" `
  -o tsv
```

Store the value in GitHub:

```text
GitHub repository
Settings
Secrets and variables
Actions
New repository secret
Name: AZURE_STATIC_WEB_APPS_API_TOKEN
Value: <copied deployment token>
```

If Azure created the Static Web App from GitHub, it may auto-create a secret
with a longer name such as `AZURE_STATIC_WEB_APPS_API_TOKEN_<APP_NAME>`. We use
the shorter stable name above. Either copy that generated token into
`AZURE_STATIC_WEB_APPS_API_TOKEN`, or change the workflow to reference the
generated secret name.

Rotation rule:

- If the token is exposed, reset it in Azure from `Manage deployment token`.
- Immediately update the GitHub secret with the new token.
- Re-run the failed publish workflow if deployment was interrupted.

Recommended hardening:

- Store the token as a GitHub `production` environment secret instead of a
  plain repository secret if you want environment approvals or branch/tag
  restrictions before deployment.
- Never commit the token to the repo, docs, `.env` files, or workflow YAML.

### Azure OIDC Secrets

The `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, and `AZURE_SUBSCRIPTION_ID` secrets
are for `azure/login@v2`, not for Static Web Apps deployment.

`azure/login` uses GitHub OpenID Connect to exchange the GitHub workflow identity
for a short-lived Azure access token. That lets the publish scripts write
generated content and media to Azure Blob Storage without storing a long-lived
Azure client secret in GitHub.

The Entra app/service principal behind `AZURE_CLIENT_ID` needs:

- A federated credential that trusts this GitHub repository and the allowed
  branch/tag/environment.
- `Storage Blob Data Contributor` on the target storage account or container.

The publish workflow needs:

```yaml
permissions:
  contents: write
  id-token: write
```

`id-token: write` is what allows `azure/login` to request the GitHub OIDC token.
`contents: write` allows the workflow to push source-normalization commits back
to `main` when `publish:prepare` rewrites media references.

### Content Storage Variables

These values are not secrets, so they should be GitHub Actions variables:

```text
CONTENT_STORAGE_ACCOUNT=prdwebappstorage
CONTENT_STORAGE_CONTAINER=kansaspattons
CONTENT_SITE_KEY=kansaspattons
CONTENT_STORAGE_PREFIX=content
AZURE_STATIC_WEB_APP_URL=https://happy-sky-045677310.7.azurestaticapps.net
CONTENT_SITE_URL=https://happy-sky-045677310.7.azurestaticapps.net
```

`CONTENT_STORAGE_PREFIX` is optional. If it is set to `content`, the generated
JSON root is expected to look like:

```text
https://prdwebappstorage.blob.core.windows.net/kansaspattons/content/kansaspattons/current/
```

If it is blank, the generated JSON root is expected to look like:

```text
https://prdwebappstorage.blob.core.windows.net/kansaspattons/kansaspattons/current/
```

The exact URL must match the `CONTENT_BASE_URL` runtime setting on the Static
Web App API.

### Site URL Variables

The current Azure Static Web Apps host is:

```text
https://happy-sky-045677310.7.azurestaticapps.net
```

Use it in two places until a custom domain is mapped:

- `AZURE_STATIC_WEB_APP_URL`: used by GitHub Actions as the production
  environment URL. This makes the workflow deployment link open the live SWA
  site.
- `CONTENT_SITE_URL`: used by `npm run build` through the content compiler. It
  overrides `content/site.config.json` and is emitted into generated `site.json`
  as the current public site URL.

`content/site.config.json` can keep the intended canonical domain, such as
`https://kansaspattons.org`. Once that custom domain is connected to the Static
Web App, update both GitHub variables to the custom domain or remove
`CONTENT_SITE_URL` so the config file becomes the source of truth again.

## Azure Static Web Apps Settings

The managed API reads content from Azure Blob storage at runtime. Configure
these application settings on the Azure Static Web App production environment.
These are Azure Static Web Apps environment variables, not GitHub secrets:

```text
CONTENT_BASE_URL=https://{account}.blob.core.windows.net/{container}/{prefix}/{site}/current/
CONTENT_SITE_KEY=kansaspattons
CONTENT_CACHE_SECONDS=60
```

`CONTENT_BASE_URL` is the important one. It should point at the generated JSON
content root that contains `home.json`, `site.json`, `posts/index.json`,
`stories/index.json`, `galleries/index.json`, `images/index.json`,
`taxonomy.json`, and `search/index.json`.

Portal setup:

```text
Azure Portal
Static Web App resource
Settings
Environment variables
Production
+ Add
```

CLI setup:

```powershell
az staticwebapp appsettings set `
  --name <static-web-app-name> `
  --resource-group <resource-group-name> `
  --setting-names `
    "CONTENT_BASE_URL=https://prdwebappstorage.blob.core.windows.net/kansaspattons/content/kansaspattons/current/" `
    "CONTENT_SITE_KEY=kansaspattons" `
    "CONTENT_CACHE_SECONDS=60"
```

Review current settings:

```powershell
az staticwebapp appsettings list `
  --name <static-web-app-name> `
  --resource-group <resource-group-name>
```

Local API development still uses `api/local.settings.json`. Azure Static Web
Apps production settings are configured in Azure, not committed to the repo.

## Setup Checklist

1. Create the Azure Static Web App resource.
2. Copy its deployment token and save it as
   `AZURE_STATIC_WEB_APPS_API_TOKEN` in GitHub Actions secrets.
3. Create or reuse the Entra app/service principal used by GitHub OIDC.
4. Add a federated credential for this repository and deployment path.
5. Give that identity `Storage Blob Data Contributor` on the content storage
   account or site container.
6. Save `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, and `AZURE_SUBSCRIPTION_ID` in
   GitHub Actions secrets.
7. Save `CONTENT_STORAGE_ACCOUNT`, `CONTENT_STORAGE_CONTAINER`,
   `CONTENT_SITE_KEY`, and optional `CONTENT_STORAGE_PREFIX` as GitHub Actions
   variables.
8. Save `AZURE_STATIC_WEB_APP_URL` and `CONTENT_SITE_URL` as GitHub Actions
   variables while the Azure-generated hostname is the public URL.
9. Configure Static Web Apps production environment variables:
   `CONTENT_BASE_URL`, `CONTENT_SITE_KEY`, and `CONTENT_CACHE_SECONDS`.
10. Run the `Publish` workflow manually once after settings are in place.

## Hosting Notes

The site is no longer deployed through GitHub Pages. `CNAME` can stay in the
repo for now as old hosting context, but Azure Static Web Apps custom domains
are configured on the Static Web App resource in Azure.

Current Static Web Apps URL:

```text
https://happy-sky-045677310.7.azurestaticapps.net
```

The workflow deploy step uses:

```yaml
uses: Azure/static-web-apps-deploy@v1
with:
  app_location: dist
  api_location: api
  output_location: ''
  skip_app_build: true
  api_build_command: 'npm run build'
```

`skip_app_build: true` means the site build is controlled by the explicit
`npm run build` step earlier in the workflow. The API remains source-deployed
from `api/` and is built by the Static Web Apps action. The API package and
`staticwebapp.config.json` both target Node 22.

## Planner Modes

`npm run publish:plan` now supports two change-detection modes:

- local working tree, used by default.
- commit range, used by GitHub Actions.

Commit-range planning can be run manually with:

```powershell
npm run publish:plan -- --base <base-sha> --head <head-sha>
```

or with environment variables:

```powershell
$env:PUBLISH_PLAN_BASE = "<base-sha>"
$env:PUBLISH_PLAN_HEAD = "<head-sha>"
npm run publish:plan
```
