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

The workflow lets the Azure Static Web Apps deploy action build from the repo
root, emit the React app to `dist/`, and deploy the `api/` folder as the
managed Functions API. The React app and the API are therefore served from the
same origin, so production can keep using `/api/...` routes.

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
| `CONTENT_STORAGE_PREFIX` | Variable, optional | publish scripts | Full Blob prefix that receives generated JSON. Defaults to `content/{CONTENT_SITE_KEY}/current` when blank. |

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
    app_location: .
    api_location: api
    output_location: dist
    app_build_command: 'npm run build'
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
AZURE_STATIC_WEB_APPS_API_TOKEN
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
AZURE_STATIC_WEB_APP_URL=https://happy-sky-045677310.7.azurestaticapps.net
CONTENT_SITE_URL=https://happy-sky-045677310.7.azurestaticapps.net
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
CONTENT_BASE_URL=https://{account}.blob.core.windows.net/{container}/{CONTENT_STORAGE_PREFIX}/
CONTENT_SITE_KEY=kansaspattons
CONTENT_CACHE_SECONDS=60
```

`CONTENT_BASE_URL` is the important one. It should point at the generated JSON
content root that contains `home.json`, `site.json`, `posts/index.json`,
`stories/index.json`, `galleries/index.json`, `images/index.json`,
`taxonomy.json`, and `search/index.json`.

The API also exposes `GET /api/health` as a non-secret runtime diagnostic. It
reports whether the deployed Function sees `CONTENT_BASE_URL`, derives the
content root from `CONTENT_STORAGE_*`, or is using the bundled KansasPattons
fallback while the API still lives in this repo.

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
    "CONTENT_BASE_URL=https://prdwebappstorage.blob.core.windows.net/kansaspattons/current/" `
    "CONTENT_SITE_KEY=kansaspattons" `
    "CONTENT_CACHE_SECONDS=60"
```

If `CONTENT_STORAGE_PREFIX` is later changed back to the default
`content/kansaspattons/current`, update the Static Web Apps `CONTENT_BASE_URL`
to match after the next content publish:

```text
CONTENT_BASE_URL=https://prdwebappstorage.blob.core.windows.net/kansaspattons/content/kansaspattons/current/
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
  app_location: .
  api_location: api
  output_location: dist
  app_build_command: 'npm run build'
  api_build_command: 'npm run build'
```

`app_location: .` keeps the React app and `api/` folder in the same deployment
context. `output_location: dist` tells the deploy action where `npm run build`
writes the React artifact. The API remains source-deployed from `api/` and is
built by the Static Web Apps action. The API package and
`staticwebapp.config.json` both target Node 22.

After deployment, the workflow verifies:

```text
https://happy-sky-045677310.7.azurestaticapps.net/api/home
```

That check catches the specific failure where the static React app deploys but
the managed Functions API is missing or not discoverable.

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
