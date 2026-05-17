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

## Required Repository Settings

The publish workflow uses GitHub OIDC for Azure. Configure these repository
secrets:

```text
AZURE_CLIENT_ID
AZURE_TENANT_ID
AZURE_SUBSCRIPTION_ID
```

The Static Web Apps deployment uses the app deployment token. Configure this
repository secret:

```text
AZURE_STATIC_WEB_APPS_API_TOKEN
```

Configure these repository variables:

```text
CONTENT_STORAGE_ACCOUNT
CONTENT_STORAGE_CONTAINER
CONTENT_SITE_KEY
```

Optional:

```text
CONTENT_STORAGE_PREFIX
```

The Azure federated identity needs Storage Blob Data Contributor permission for
the target storage account or container. The workflow also needs permission to
push source-normalization commits back to `main`; if branch protection blocks
that, allow GitHub Actions/bot commits or move `publish:prepare` earlier into
the PR process.

## Azure Static Web Apps Settings

The managed API reads content from Azure Blob storage at runtime. Configure
these application settings on the Azure Static Web App production environment:

```text
CONTENT_BASE_URL=https://{account}.blob.core.windows.net/{container}/{prefix}/{site}/current/
CONTENT_SITE_KEY=kansaspattons
CONTENT_CACHE_SECONDS=60
```

`CONTENT_BASE_URL` is the important one. It should point at the generated JSON
content root that contains `home.json`, `site.json`, `posts/index.json`,
`stories/index.json`, `galleries/index.json`, `images/index.json`,
`taxonomy.json`, and `search/index.json`.

Local API development still uses `api/local.settings.json`. Azure Static Web
Apps production settings are configured in Azure, not committed to the repo.

## Hosting Notes

The site is no longer deployed through GitHub Pages. `CNAME` can stay in the
repo for now as old hosting context, but Azure Static Web Apps custom domains
are configured on the Static Web App resource in Azure.

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
