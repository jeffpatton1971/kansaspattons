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

The workflow also deploys `dist/` to GitHub Pages. Before upload it copies:

```text
CNAME -> dist/CNAME
dist/index.html -> dist/404.html
```

The `404.html` copy keeps React routes working as a GitHub Pages single-page
app fallback.

## Tag Full Rebuild

Trigger:

- any new Git tag
- manual `workflow_dispatch`

Tag publishes are full rebuilds. This is the release/version path for larger
site-structure changes.

The tag path runs validation, tests, a full generated-content publish, a fresh
site build, and a GitHub Pages deploy.

## Required Repository Settings

GitHub Pages should be configured to deploy from GitHub Actions.

The publish workflow uses GitHub OIDC for Azure. Configure these repository
secrets:

```text
AZURE_CLIENT_ID
AZURE_TENANT_ID
AZURE_SUBSCRIPTION_ID
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
