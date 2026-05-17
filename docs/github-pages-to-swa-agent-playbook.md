# GitHub Pages To Azure Static Web Apps Agent Playbook

This document is written for a future GitHub Copilot agent, Codex agent, or
human maintainer migrating a smaller GitHub Pages/Jekyll site to the React,
generated-content, Azure Static Web Apps layout proven here.

Use this as an execution guide, not as a design brainstorm. The architectural
direction is already chosen.

## Target Architecture

The target site has these pieces:

- Markdown remains the durable authoring source in Git.
- Authored content has only three public content types:
  - `post`
  - `story`
  - `gallery`
- Media is tracked in `content/media/index.json`, not as one Markdown document
  per image.
- The content build converts Markdown plus the media manifest into JSON under
  `public/content`.
- Generated JSON is published to Azure Blob Storage under:

```text
https://{storageAccount}.blob.core.windows.net/{container}/{prefix}/{siteKey}/current/
```

- The React app reads content through `/api/*`, not directly from local Jekyll
  pages.
- The first deployment keeps the API in the same repo under `api/` and deploys
  it as the Azure Static Web Apps managed Functions API.
- Azure Static Web Apps hosts the React build and proxies same-origin `/api/*`
  calls to the managed API.
- The API may be extracted to its own repo later, after the first SWA deployment
  is proven.

## Agent Mission

When applying this to another site, the agent should:

1. Preserve the existing site until the new SWA deployment is verified.
2. Build the new React/API pipeline on a branch.
3. Keep source Markdown readable and reviewable.
4. Avoid deleting old GitHub Pages/Jekyll files until the new deployment is
   proven.
5. Document every site-specific setting in the repo docs.
6. Keep the publish pipeline boring and testable.

Do not extract the API to a separate repo during the first migration. That is a
second phase.

## Expected Repository Shape

The migrated repo should contain:

```text
.github/workflows/pr-ci.yml
.github/workflows/publish.yml
api/
content/site.config.json
content/media/index.json
docs/
public/staticwebapp.config.json
scripts/
src/
tests/site/
package.json
playwright.config.ts
vite.config.ts
```

The legacy Jekyll directories may still exist during migration, but the final
React build should not depend on Jekyll to render pages.

## Content Contract

Use the contract docs as the source of truth:

```text
docs/content-contract.md
docs/authoring-publish-workflow.md
docs/media-manifest.md
docs/site-configuration.md
```

New authored Markdown should use:

```yaml
content_type: post
title: Example Post
slug: example-post
post_id: 2026-05-17-example-post
date: 2026-05-17 09:00:00
status: published
authors:
  - Jeff Patton
hashtags: []
categories: []
people: []
locations: []
summary: "Short summary."
```

Stories and galleries use the same envelope, with `content_type: story` or
`content_type: gallery`.

Images referenced by content should use canonical media keys after publish:

```text
yyyy/mm/dd/filename.ext
```

## Azure Resources

Each migrated site needs:

- Azure Static Web App.
- Azure Blob Storage container or site-specific prefix for generated JSON and
  media.
- Azure Entra app registration/service principal for GitHub OIDC.
- Federated credential for the GitHub deployment environment.
- Azure Static Web Apps deployment token.

For this KansasPattons branch, the current SWA URL is:

```text
https://happy-sky-045677310.7.azurestaticapps.net
```

A sibling site should record its own SWA URL in that site's docs and GitHub
variables.

## GitHub Environment And OIDC

Use a GitHub Actions environment named:

```text
Production
```

The federated credential subject must match the exact owner, repo, and
environment name:

```text
repo:{owner}/{repo}:environment:Production
```

For KansasPattons, that is:

```text
repo:jeffpatton1971/kansaspattons:environment:Production
```

If the GitHub environment is named differently, update both:

- `.github/workflows/publish.yml`
- the Azure federated credential subject

Environment names are case-sensitive in the OIDC subject.

## GitHub Secrets And Variables

Required secrets:

```text
AZURE_STATIC_WEB_APPS_API_TOKEN
AZURE_CLIENT_ID
AZURE_TENANT_ID
AZURE_SUBSCRIPTION_ID
```

Required variables:

```text
CONTENT_STORAGE_ACCOUNT
CONTENT_STORAGE_CONTAINER
CONTENT_SITE_KEY
```

Recommended variables:

```text
CONTENT_STORAGE_PREFIX
AZURE_STATIC_WEB_APP_URL
CONTENT_SITE_URL
```

`CONTENT_STORAGE_PREFIX` is the full generated-content Blob prefix. If it is
omitted, the publish script uses `content/{siteKey}/current`. If it is set to a
shorter value such as `current`, the API runtime setting must use that same
shorter path.

`AZURE_STATIC_WEB_APPS_API_TOKEN` is the SWA deployment token. It is not visitor
auth and it is not used by `/api/*` requests.

The Azure OIDC secrets are only for `azure/login@v2`, which lets the workflow
write generated content and media to Blob Storage.

## Azure Static Web Apps App Settings

The managed API needs runtime settings in Azure Static Web Apps:

```text
CONTENT_BASE_URL=https://{account}.blob.core.windows.net/{container}/{CONTENT_STORAGE_PREFIX}/
CONTENT_SITE_KEY={siteKey}
CONTENT_CACHE_SECONDS=60
```

`CONTENT_BASE_URL` must point at the same generated JSON root that the publish
workflow writes.

## Workflow Behavior

Pull requests:

- run validation and tests only.
- do not publish to production.

Push to `main`:

- runs validation and tests.
- plans incremental publish from the Git commit range.
- uploads changed local draft media.
- rewrites source media references when needed.
- publishes affected generated JSON to Blob Storage.
- builds the React app.
- builds from the repo root, deploys `dist/`, and deploys `api/` to Azure
  Static Web Apps.

Tag push:

- runs validation and tests.
- performs a full generated-content publish.
- builds the React app.
- builds from the repo root, deploys `dist/`, and deploys `api/` to Azure
  Static Web Apps.

Manual workflow dispatch:

- runs the full rebuild publish path.

## Static Web Apps Config

The migrated site should include:

```text
public/staticwebapp.config.json
```

Minimum shape:

```json
{
  "navigationFallback": {
    "rewrite": "/index.html",
    "exclude": [
      "/api/*",
      "/assets/*",
      "/content/*",
      "/*.{css,js,map,json,ico,png,jpg,jpeg,gif,svg,webp,avif,woff,woff2,ttf,eot}"
    ]
  },
  "globalHeaders": {
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Content-Type-Options": "nosniff"
  },
  "mimeTypes": {
    ".json": "application/json"
  },
  "platform": {
    "apiRuntime": "node:22"
  }
}
```

Do not exclude `/posts/*`, `/stories/*`, `/galleries/*`, or `/images/*`.
Those are React routes and need the SPA fallback.

## Local Verification

Before merging a migration branch:

```powershell
npm ci
npm --prefix api ci
npm run content:validate
npm run build
npm --prefix api run build
npm run test
```

Optional publish dry runs:

```powershell
npm run publish:plan
npm run publish:media:dry-run
npm run publish:content:incremental:dry-run
npm run publish:content:dry-run
```

If Playwright browsers are missing:

```powershell
npx playwright install chromium
```

## First Merge Expectations

When the migration branch is merged to `main`, the new `Publish` workflow should
run because the merge is a push to `main`.

Expected sequence:

1. PR/main checks run validation and tests.
2. `publish:content:incremental` writes generated JSON to Azure Blob Storage.
3. `npm run build` builds the React app.
4. The Static Web Apps deploy action runs `npm run build` from the repo root.
5. The Static Web Apps deploy action uploads `dist/`.
6. The Static Web Apps deploy action builds and deploys `api/` as the managed
   Functions API.
7. The workflow verifies `/api/home` on the SWA hostname.

The API is not local-only after the workflow succeeds. While the code lives in
this repo, Azure Static Web Apps deploys `api/` as a managed Functions API.
Production verification can therefore use:

```text
https://{static-web-app-host}/api/home
https://{static-web-app-host}/api/search?q=breakfast
https://{static-web-app-host}/api/posts
https://{static-web-app-host}/api/stories
https://{static-web-app-host}/api/galleries
https://{static-web-app-host}/api/images
```

For KansasPattons during the temporary-host phase:

```text
https://happy-sky-045677310.7.azurestaticapps.net/api/home
```

## GitHub Pages Expectations

The new publish workflow no longer deploys GitHub Pages.

That means:

- The old GitHub Pages deployment may remain online at its last published
  version.
- It will not receive new React/SWA deployments from this workflow.
- If the custom domain still points at GitHub Pages, visitors may continue to
  see the old site.
- The new site should be verified on the Azure Static Web Apps URL first.
- After SWA is proven, move the custom domain/DNS to Azure Static Web Apps or
  intentionally disable GitHub Pages for the repo.

Do not assume GitHub Pages disappears automatically when this branch merges. It
is simply no longer updated by the new workflow.

## Post-Deploy Verification

After the first successful deployment, verify:

```text
/
/posts
/stories
/galleries
/images
/search?q=breakfast
/api/home
/api/search?q=breakfast
```

Also verify direct route refreshes:

```text
/posts
/stories
/galleries
/images
```

These should return the React app, not a 404. If direct refresh fails, inspect
`dist/staticwebapp.config.json` in the build artifact and confirm the
navigation fallback is deployed.

Verify generated content in Blob Storage:

```text
{CONTENT_STORAGE_PREFIX}/home.json
{CONTENT_STORAGE_PREFIX}/site.json
{CONTENT_STORAGE_PREFIX}/posts/index.json
{CONTENT_STORAGE_PREFIX}/stories/index.json
{CONTENT_STORAGE_PREFIX}/galleries/index.json
{CONTENT_STORAGE_PREFIX}/images/index.json
{CONTENT_STORAGE_PREFIX}/search/index.json
```

## Smaller-Site Trial Notes

For a smaller site trial:

1. Start from a branch.
2. Copy the React/API/publish structure.
3. Create that site's `content/site.config.json`.
4. Build or migrate that site's `content/media/index.json`.
5. Normalize content to `post`, `story`, and `gallery`.
6. Configure a separate Azure Static Web App.
7. Configure separate GitHub secrets/variables.
8. Run local validation/build/tests.
9. Merge and verify SWA before changing DNS.

If the smaller site has fewer images, prefer proving the content pipeline there
before running destructive cleanup on KansasPattons storage.

## API Extraction Phase

Only extract the API after at least one site is live on SWA with the managed
same-repo API.

Extraction target:

- New API repo owns `api/`, API tests, API docs, and API deployment workflow.
- Site repos keep React frontend, content compiler, content publish workflow,
  and site-specific configuration.
- Azure Static Web Apps uses a linked backend or bring-your-own Functions app
  so `/api/*` still works through the SWA URL.
- Remove `api_location: api` from site repo publish workflows after the linked
  API is proven.

Do not combine API extraction with the first GitHub Pages to SWA migration.
That creates too many failure points at once.

## Agent Completion Criteria

An agent migration is complete when:

- `npm run content:validate` passes.
- `npm run build` passes.
- `npm run test` passes.
- The publish workflow exists and references the correct GitHub environment.
- The SWA URL is documented.
- Secrets and variables are documented.
- The first SWA deployment succeeds.
- `/api/home` works on the SWA hostname.
- Direct React route refreshes work on the SWA hostname.
- The old GitHub Pages path is either intentionally left alone or explicitly
  retired after DNS moves.
