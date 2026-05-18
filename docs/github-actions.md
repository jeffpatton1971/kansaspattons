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
npx playwright install --with-deps chromium
npm run content:validate
npm run test
```

This is the Dependabot gate. It validates content, builds the React site, runs
Playwright smoke tests, and leaves shared API validation to the
`ptech-sites-api` repository.

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

The workflow builds the React app, wraps the `dist/` artifact in the small
Node host under `webapp/`, and deploys that package to Azure App Service with
`Azure/webapps-deploy@v3`.

The API is deployed from the shared API repository. Set `VITE_API_BASE_URL` or
`AZURE_API_BASE_URL` plus `VITE_API_SITE_ID` as GitHub Actions variables so the
React build calls explicit shared API routes such as `/api/kansaspattons/home`.

The deployed Web App package contains:

```text
package.json
server.cjs
public/
```

`server.cjs` serves React static assets and falls back to `index.html` for
direct route refreshes. API runtime code is not packaged with this site.

## Tag Full Rebuild

Trigger:

- any new Git tag
- manual `workflow_dispatch`

Tag publishes are full rebuilds. This is the release/version path for larger
site-structure changes.

The tag path runs validation, tests, a full generated-content publish, a fresh
site build, and an Azure Web App deploy.

Incremental publishes self-heal during the initial production bootstrap. If the
remote `_publish.json` manifest is missing or reports fewer generated JSON
files than the local content root, `publish:content:incremental` switches to a
one-time full generated-content upload. This prevents archive indexes from
deploying without the detail JSON documents they link to.

## Required GitHub Settings

The publish workflow uses three different kinds of GitHub configuration. They
look similar in YAML, but they serve different jobs.

| Name | Kind | Used by | Purpose |
| --- | --- | --- | --- |
| `AZURE_CLIENT_ID` | Secret | `azure/login@v2` | Identifies the Entra app/service principal used for Azure OIDC login. |
| `AZURE_TENANT_ID` | Secret | `azure/login@v2` | Identifies the Entra tenant for Azure OIDC login. |
| `AZURE_SUBSCRIPTION_ID` | Secret | `azure/login@v2` | Identifies the Azure subscription for Azure OIDC login. |
| `AZURE_WEBAPP_NAME` | Variable | `Azure/webapps-deploy@v3` | Name of the Azure App Service Web App that receives the React site package. |
| `AZURE_WEBAPP_RESOURCE_GROUP` | Variable | `Azure/webapps-deploy@v3` and preflight check | Resource group containing the Azure App Service Web App. |
| `AZURE_WEBAPP_URL` | Variable, optional | workflow environment and verification | Public Web App URL. Prefer including `https://`; the workflow normalizes hostname-only values. Defaults to `https://{AZURE_WEBAPP_NAME}.azurewebsites.net` when omitted. |
| `AZURE_WEBAPP_SLOT_NAME` | Variable, optional | `Azure/webapps-deploy@v3` | Deployment slot. Defaults to `production` when omitted. |
| `AZURE_API_BASE_URL` | Variable | site build and API verification | Public API host, such as `https://<api-app>.azurewebsites.net`. |
| `VITE_API_BASE_URL` | Variable, optional | React build | Explicit public API host compiled into the React app. Falls back to `AZURE_API_BASE_URL` when omitted. |
| `VITE_API_SITE_ID` | Variable | React build | Explicit site id compiled into external API paths, such as `/api/kansaspattons/home`. Can match `CONTENT_SITE_KEY`. |
| `REQUIRE_API_VERIFICATION` | Variable, optional | publish workflow | Set to `true` only after the shared API repo is live and API health should block frontend deploys. |
| `CONTENT_SITE_URL` | Variable, optional | content build | Canonical public site URL emitted into generated `site.json`. |
| `CONTENT_STORAGE_ACCOUNT` | Variable | publish scripts | Azure Storage account that receives generated JSON and media. |
| `CONTENT_STORAGE_CONTAINER` | Variable | publish scripts | Azure Blob container for this site. |
| `CONTENT_SITE_KEY` | Variable | publish scripts | Site key, currently `kansaspattons`. |
| `CONTENT_STORAGE_PREFIX` | Variable, optional | publish scripts | Full Blob prefix that receives generated JSON. Defaults to `content/{CONTENT_SITE_KEY}/current` when blank. |

### Azure Web App Deployment

```yaml
- name: Deploy Azure Web App
  uses: Azure/webapps-deploy@v3
  with:
    app-name: ${{ vars.AZURE_WEBAPP_NAME }}
    resource-group-name: ${{ vars.AZURE_WEBAPP_RESOURCE_GROUP }}
    slot-name: ${{ vars.AZURE_WEBAPP_SLOT_NAME || 'production' }}
    package: .tmp/webapp-package
```

What it can do:

- Deploy the packaged React site and Node static host to an Azure App Service
  Web App.
- Use the existing `azure/login@v2` OIDC identity.

What it does not do:

- It does not grant users access to the site.
- It does not authenticate calls to `/api/{siteid}/home`, `/api/{siteid}/search`, or other API routes.
- It does not deploy the shared API.
- It does not upload generated JSON or media to Blob storage.

The GitHub OIDC identity must have permission to deploy to the Web App, such as
`Website Contributor` scoped to the App Service resource or resource group. It
still needs `Storage Blob Data Contributor` for the generated content/media
publish steps.

### Azure OIDC Secrets

The `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, and `AZURE_SUBSCRIPTION_ID` secrets
are for `azure/login@v2`, not visitor-facing site or API authentication.

`azure/login` uses GitHub OpenID Connect to exchange the GitHub workflow identity
for a short-lived Azure access token. That lets the publish scripts write
generated content and media to Azure Blob Storage without storing a long-lived
Azure client secret in GitHub.

The Entra app/service principal behind `AZURE_CLIENT_ID` needs:

- A federated credential that trusts this GitHub repository and the allowed
  branch/tag/environment.
- `Storage Blob Data Contributor` on the target storage account or container.

Because both publish jobs use:

```yaml
environment:
  name: Production
```

the GitHub OIDC subject should be environment-scoped:

```text
repo:jeffpatton1971/kansaspattons:environment:Production
```

That single subject covers the push-to-main incremental publish job and the
tag/manual full publish job because both jobs run in the same GitHub
environment.

The publish workflow needs:

```yaml
permissions:
  contents: write
  id-token: write
```

`id-token: write` is what allows `azure/login` to request the GitHub OIDC token.
`contents: write` allows the workflow to push source-normalization commits back
to `main` when `publish:prepare` rewrites media references.

### Federated Identity Setup

The federated identity is the trust relationship between GitHub Actions and an
Azure Entra app registration. It lets GitHub authenticate to Azure without a
stored Azure client secret.

The setup has four pieces:

1. An Entra app registration and service principal.
2. A federated credential on that app registration.
3. An Azure RBAC role assignment for Blob Storage writes.
4. GitHub secrets that tell `azure/login` which identity to use.

#### Option A: Azure Portal

Create or reuse an app registration:

```text
Azure Portal
Microsoft Entra ID
App registrations
New registration
Name: kansaspattons-github-actions
Supported account types: Single tenant
Register
```

After the app is created, capture:

```text
Application (client) ID -> GitHub secret AZURE_CLIENT_ID
Directory (tenant) ID   -> GitHub secret AZURE_TENANT_ID
Azure subscription ID   -> GitHub secret AZURE_SUBSCRIPTION_ID
```

Add the federated credential:

```text
App registration
Certificates & secrets
Federated credentials
Add credential
Federated credential scenario: GitHub Actions deploying Azure resources
Organization: jeffpatton1971
Repository: kansaspattons
Entity type: Environment
Environment name: Production
Name: github-production
Audience: api://AzureADTokenExchange
Add
```

Field values to double-check before selecting `Add`:

| Portal field | Value |
| --- | --- |
| Name | `github-production` |
| Issuer | `https://token.actions.githubusercontent.com` |
| Subject | `repo:jeffpatton1971/kansaspattons:environment:Production` |
| Audience | `api://AzureADTokenExchange` |

Do not put `api://AzureADTokenExchange` in the `Name` field. Azure credential
names must be simple URI path segments, so use a short name such as
`github-production`. `api://AzureADTokenExchange` belongs only in `Audience`.

The resulting subject should be:

```text
repo:jeffpatton1971/kansaspattons:environment:Production
```

Assign the storage role:

```text
Azure Portal
Storage account
prdwebappstorage
Access control (IAM)
Add role assignment
Role: Storage Blob Data Contributor
Assign access to: User, group, or service principal
Members: kansaspattons-github-actions
Review + assign
```

Prefer assigning at the Blob container scope if the portal flow allows it:

```text
prdwebappstorage / Blob service / Containers / kansaspattons
Access control (IAM)
```

Storage account scope also works, but it is broader than the publish workflow
needs.

#### Option B: Azure CLI

Run this from PowerShell after `az login`.

Set local variables:

```powershell
$appName = "kansaspattons-github-actions"
$owner = "jeffpatton1971"
$repo = "kansaspattons"
$environment = "Production"
$storageAccountName = "prdwebappstorage"
$containerName = "kansaspattons"
$resourceGroupName = "<resource-group-name>"

$tenantId = az account show --query tenantId -o tsv
$subscriptionId = az account show --query id -o tsv
$subject = "repo:{0}/{1}:environment:{2}" -f $owner, $repo, $environment
```

Create or reuse the Entra app registration:

```powershell
$app = az ad app list --display-name $appName --query "[0]" | ConvertFrom-Json

if (-not $app) {
  $app = az ad app create --display-name $appName | ConvertFrom-Json
}

$clientId = $app.appId
$appObjectId = $app.id
```

Create or reuse the service principal:

```powershell
$sp = az ad sp list --filter "appId eq '$clientId'" --query "[0]" | ConvertFrom-Json

if (-not $sp) {
  $sp = az ad sp create --id $clientId | ConvertFrom-Json
}

$spObjectId = $sp.id
```

Create the federated credential:

```powershell
$credentialPath = ".tmp\github-production-federated-credential.json"

@{
  name = "github-production"
  issuer = "https://token.actions.githubusercontent.com"
  subject = $subject
  description = "KansasPattons production publish workflow"
  audiences = @("api://AzureADTokenExchange")
} | ConvertTo-Json -Depth 5 | Set-Content $credentialPath

az ad app federated-credential create `
  --id $clientId `
  --parameters $credentialPath
```

In that JSON, `name` must stay `github-production`; only `audiences` should
contain `api://AzureADTokenExchange`.

Assign the least-privilege storage role at container scope:

```powershell
$scope = "/subscriptions/$subscriptionId/resourceGroups/$resourceGroupName/providers/Microsoft.Storage/storageAccounts/$storageAccountName/blobServices/default/containers/$containerName"

az role assignment create `
  --assignee-object-id $spObjectId `
  --assignee-principal-type ServicePrincipal `
  --role "Storage Blob Data Contributor" `
  --scope $scope
```

If container-scoped assignment is blocked by your current Azure permissions,
use storage-account scope as a fallback:

```powershell
$scope = "/subscriptions/$subscriptionId/resourceGroups/$resourceGroupName/providers/Microsoft.Storage/storageAccounts/$storageAccountName"

az role assignment create `
  --assignee-object-id $spObjectId `
  --assignee-principal-type ServicePrincipal `
  --role "Storage Blob Data Contributor" `
  --scope $scope
```

Save the GitHub secrets:

```text
AZURE_CLIENT_ID=<clientId from $clientId>
AZURE_TENANT_ID=<tenantId from $tenantId>
AZURE_SUBSCRIPTION_ID=<subscriptionId from $subscriptionId>
```

With GitHub CLI, that can be:

```powershell
gh secret set AZURE_CLIENT_ID --body $clientId
gh secret set AZURE_TENANT_ID --body $tenantId
gh secret set AZURE_SUBSCRIPTION_ID --body $subscriptionId
```

Verify the federated credential:

```powershell
az ad app federated-credential list --id $clientId --output table
```

Expected values:

```text
Issuer:   https://token.actions.githubusercontent.com
Subject:  repo:jeffpatton1971/kansaspattons:environment:Production
Audience: api://AzureADTokenExchange
```

#### GitHub Environment

Create the matching environment in GitHub:

```text
GitHub repository
Settings
Environments
New environment
Name: Production
```

The environment name is case-sensitive for the OIDC subject. Our workflow uses
`Production`, so the GitHub environment and federated credential should also use
`Production`.

You can optionally add deployment protection rules, required reviewers, or
environment-scoped secrets here. If you move secrets from repository scope to
environment scope, make sure the `Production` environment contains:

```text
AZURE_CLIENT_ID
AZURE_TENANT_ID
AZURE_SUBSCRIPTION_ID
```

#### Troubleshooting OIDC Login

If `azure/login` fails, check these first:

- The workflow has `permissions: id-token: write`.
- The job has `environment: Production`.
- The federated credential name is a simple value such as `github-production`,
  not `api://AzureADTokenExchange`.
- The federated credential subject is exactly
  `repo:jeffpatton1971/kansaspattons:environment:Production`.
- The federated credential audience is `api://AzureADTokenExchange`.
- The GitHub secrets point at the same Entra app registration and tenant.
- The service principal has `Storage Blob Data Contributor` on the target
  storage account or container.
- The service principal has `Website Contributor` on the target Web App or
  resource group.

The most common failure is a subject mismatch. If the workflow environment is
removed later, the subject would change to a branch or tag shape, and this
environment-scoped credential would stop matching.

### Content Storage Variables

These values are not secrets, so they should be GitHub Actions variables:

```text
CONTENT_STORAGE_ACCOUNT=prdwebappstorage
CONTENT_STORAGE_CONTAINER=kansaspattons
CONTENT_SITE_KEY=kansaspattons
# Optional. If omitted, the publish script uses content/kansaspattons/current.
CONTENT_STORAGE_PREFIX=current
AZURE_WEBAPP_NAME=<site-web-app-name>
AZURE_WEBAPP_RESOURCE_GROUP=<site-web-app-resource-group>
AZURE_WEBAPP_URL=https://<site-web-app-name>.azurewebsites.net
AZURE_API_BASE_URL=https://<api-function-app-name>.azurewebsites.net
CONTENT_SITE_URL=https://<site-web-app-name>.azurewebsites.net
```

`CONTENT_STORAGE_PREFIX` is optional. It is the complete Blob prefix that will
contain `home.json`, `site.json`, and the other generated content artifacts.

If it is blank, the generated JSON root is expected to look like:

```text
https://prdwebappstorage.blob.core.windows.net/kansaspattons/content/kansaspattons/current/
```

If it is set to `current`, as the current KansasPattons production workflow is,
the generated JSON root is expected to look like:

```text
https://prdwebappstorage.blob.core.windows.net/kansaspattons/current/
```

The exact URL must match the `CONTENT_BASE_URL` runtime setting on the Function
App API.

### Site URL Variables

The production Azure Web App URL is normally:

```text
https://{AZURE_WEBAPP_NAME}.azurewebsites.net
```

Use it in two places until a custom domain is mapped:

- `AZURE_WEBAPP_URL`: used by GitHub Actions as the production environment
  URL. This makes the workflow deployment link open the live App Service
  site.
- `CONTENT_SITE_URL`: used by `npm run build` through the content compiler. It
  overrides `content/site.config.json` and is emitted into generated `site.json`
  as the current public site URL.

`content/site.config.json` can keep the intended canonical domain, such as
`https://kansaspattons.org`. Once that custom domain is connected to the Web
App, update both GitHub variables to the custom domain or remove
`CONTENT_SITE_URL` so the config file becomes the source of truth again.

## Azure Web App Settings

The Azure Web App hosts the React site package. Configure the Web App runtime
stack as Node 22. The deployed package includes `package.json` with
`npm start`, so an explicit startup command is usually not required. If App
Service does not pick up the start script, set the startup command to:

```text
npm start
```

The Web App can optionally proxy same-origin `/api/*` to a standalone Function
App when this app setting is present:

```text
API_BASE_URL=https://<api-function-app>.azurewebsites.net
```

The preferred production path is still to set `VITE_API_BASE_URL` or
`AZURE_API_BASE_URL` as a GitHub Actions variable so the React bundle calls the
Function App directly.

The frontend publish workflow checks the external API after deployment, but the
check is non-blocking by default because the shared API deploys from a separate
repo. Set `REQUIRE_API_VERIFICATION=true` only when the API repo is live and
you want KansasPattons frontend deploys to fail when the shared API is down.

## Split API Function App Settings

The API reads content from Azure Blob storage at runtime. Configure these
application settings on the standalone Function App production environment:

```text
CONTENT_BASE_URL=https://{account}.blob.core.windows.net/{container}/{CONTENT_STORAGE_PREFIX}/
CONTENT_SITE_KEY=kansaspattons
CONTENT_CACHE_SECONDS=60
```

`CONTENT_BASE_URL` is the important one. It should point at the generated JSON
content root that contains `home.json`, `site.json`, `posts/index.json`,
`stories/index.json`, `galleries/index.json`, `images/index.json`,
`taxonomy.json`, and `search/index.json`.

The API also exposes `GET /api/{siteid}/health` as a non-secret runtime diagnostic. It
reports whether the deployed Function sees `CONTENT_BASE_URL`, derives the
content root from `CONTENT_STORAGE_*`, or is using the bundled KansasPattons
fallback while the API still lives in this repo.

The publish workflow verifies both `/api/{siteid}/home` and one known story detail route
after deployment so missing detail artifacts fail the deployment instead of
showing up only when a user clicks into content.

Portal setup:

```text
Azure Portal
Function App resource
Settings
Environment variables / Configuration
+ Add
```

CLI setup:

```powershell
az functionapp config appsettings set `
  --name <function-app-name> `
  --resource-group <resource-group-name> `
  --settings `
    "CONTENT_BASE_URL=https://prdwebappstorage.blob.core.windows.net/kansaspattons/current/" `
    "CONTENT_SITE_KEY=kansaspattons" `
    "CONTENT_CACHE_SECONDS=60"
```

If `CONTENT_STORAGE_PREFIX` is later changed back to the default
`content/kansaspattons/current`, update the Function App `CONTENT_BASE_URL`
to match after the next content publish:

```text
CONTENT_BASE_URL=https://prdwebappstorage.blob.core.windows.net/kansaspattons/content/kansaspattons/current/
```

Review current settings:

```powershell
az functionapp config appsettings list `
  --name <function-app-name> `
  --resource-group <resource-group-name>
```

Local API development now belongs to the shared `ptech-sites-api` repository.
Function App production settings are configured in Azure, not committed to this
site repo.

GitHub variables for the split API:

```text
AZURE_API_BASE_URL=https://<function-app-resource-name>.azurewebsites.net
VITE_API_BASE_URL=https://<function-app-resource-name>.azurewebsites.net
VITE_API_SITE_ID=kansaspattons
```

`VITE_API_BASE_URL` is compiled into the React app. If it is omitted, the
publish workflow falls back to `AZURE_API_BASE_URL`. If both are omitted, the
publish workflow fails because the site repo no longer contains API runtime
code.

When `VITE_API_BASE_URL` is set, `VITE_API_SITE_ID` is also required and is
compiled into API paths so the shared API receives explicit site-aware requests
like `/api/kansaspattons/home`.

Because the content API is read-only and intended to be reused across sites,
API responses include permissive CORS headers. If we later add write endpoints
or private data, tighten this to an explicit allowed-origin list.

## Setup Checklist

1. Create the Azure App Service Web App resource for the React site.
2. Configure the Web App runtime stack as Node 22.
3. Create or reuse the Entra app/service principal used by GitHub OIDC.
4. Add a federated credential for this repository and deployment path.
5. Give that identity `Website Contributor` on the Web App or resource group.
6. Give that identity `Storage Blob Data Contributor` on the content storage
   account or site container.
7. Save `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, and `AZURE_SUBSCRIPTION_ID` in
   GitHub Actions secrets.
8. Save `AZURE_WEBAPP_NAME`, `AZURE_WEBAPP_RESOURCE_GROUP`, optional
   `AZURE_WEBAPP_URL`, and optional `AZURE_WEBAPP_SLOT_NAME` as GitHub Actions
   variables.
9. Save `CONTENT_STORAGE_ACCOUNT`, `CONTENT_STORAGE_CONTAINER`,
   `CONTENT_SITE_KEY`, and optional `CONTENT_STORAGE_PREFIX` as GitHub Actions
   variables.
10. Save `CONTENT_SITE_URL` while the Azure-generated hostname is the public
    URL, or let `content/site.config.json` provide the canonical domain.
11. Configure the standalone Function App settings from the `ptech-sites-api`
    repository.
12. Save `AZURE_API_BASE_URL`, or `VITE_API_BASE_URL`, plus
    `VITE_API_SITE_ID` as GitHub variables.
13. Deploy the shared API from its own repository to the Function App.
14. Run the `Publish` workflow manually once after settings are in place.
15. Set `REQUIRE_API_VERIFICATION=true` only after `/api/{siteid}/health` and
    `/api/{siteid}/home` work on the shared API host.

## Hosting Notes

The site is no longer deployed through GitHub Pages or Azure Static Web Apps.
`CNAME` can stay in the repo for now as old hosting context, but the active
custom domain should be configured on the Azure Web App resource in Azure.

Default Azure Web App URL:

```text
https://{AZURE_WEBAPP_NAME}.azurewebsites.net
```

The workflow deploy step uses:

```yaml
uses: Azure/webapps-deploy@v3
with:
  app-name: ${{ vars.AZURE_WEBAPP_NAME }}
  resource-group-name: ${{ vars.AZURE_WEBAPP_RESOURCE_GROUP }}
  slot-name: ${{ vars.AZURE_WEBAPP_SLOT_NAME || 'production' }}
  package: .tmp/webapp-package
```

The workflow builds `dist/`, copies it to `.tmp/webapp-package/public`, copies
`webapp/package.json` and `webapp/server.cjs`, and deploys that package. The
API is not deployed by this workflow. Deploy the shared API from its own repo.

After deployment, the workflow verifies:

```text
https://{AZURE_WEBAPP_NAME}.azurewebsites.net/
https://{AZURE_WEBAPP_NAME}.azurewebsites.net/posts
https://<api-function-app>.azurewebsites.net/api/kansaspattons/home
```

Those checks catch App Service startup/routing failures and API content
availability failures.

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
