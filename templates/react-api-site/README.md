# React/API Site Template

This template seeds or repairs a site repository so it stays inside the
PattonTech React site plus shared `ptech-sites-api` framework.

Use it when creating a new migrated site repo or when auditing an existing repo
that has drifted.

## Apply

From this reference repo:

```powershell
.\templates\react-api-site\apply-template.ps1 `
  -TargetRepo C:\code\sites\example-site `
  -VariablesPath .\templates\react-api-site\variables.example.json
```

Copy `variables.example.json` first and edit the values for the target site.

```powershell
Copy-Item .\templates\react-api-site\variables.example.json .\.tmp\example-site.vars.json
notepad .\.tmp\example-site.vars.json
.\templates\react-api-site\apply-template.ps1 -TargetRepo C:\code\sites\example-site -VariablesPath .\.tmp\example-site.vars.json
```

The script copies files from `scaffold/`, replaces `__TOKENS__`, and refuses to
overwrite existing files unless `-Force` is passed.

## Check Drift

Run this against an existing repo to catch framework drift:

```powershell
.\templates\react-api-site\check-framework.ps1 -TargetRepo C:\code\sites\example-site
```

It checks required paths, forbidden Jekyll/API runtime paths, required package
scripts, key workflow settings, and ignore rules.

## What This Template Owns

The template owns framework contract files:

- GitHub Actions workflow skeletons.
- Site configuration starter files.
- Media manifest starter file.
- Git ignore rules.
- A repo-local framework checklist.

The template does not copy the full React implementation. Copy the shared app
source from the reference site repo when migrating:

```text
src/
scripts/
tests/
webapp/
components.json
index.html
package.json
package-lock.json
playwright.config.ts
tsconfig*.json
vite.config.ts
```

## Required Target Values

The target site must have a real site id. Do not use `kansaspattons` as a
fallback for other sites.

Required fields in the variables JSON:

- `siteId`
- `siteTitle`
- `canonicalUrl`
- `azureWebAppName`
- `azureWebAppResourceGroup`
- `sharedApiBaseUrl`
- `storageAccount`
- `storageContainer`
- `storagePrefix`

## After Applying

Run these in the target repo:

```powershell
npm ci
npm run content:validate
npm run build
npm run test
git diff --check
git status --short
```

Then configure the target GitHub `Production` environment and Azure OIDC/RBAC
as described in `docs/framework-conformance-checklist.md`.
