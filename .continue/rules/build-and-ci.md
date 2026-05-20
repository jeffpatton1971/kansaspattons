# Build and CI

## Local prerequisites

- Node.js 22.x (matches workflows and `webapp/package.json` engines).
- npm lockfile workflow (`npm ci`).
- Playwright Chromium installed for E2E.

## Core commands

- Dev: `npm run dev`
- Build content only: `npm run build:content`
- Full build: `npm run build` (content build + TypeScript build + Vite build)
- Validate content: `npm run content:validate`
- Test: `npm run test`

## CI behavior

- PR workflow: `.github/workflows/pr-ci.yml`
  - Runs `npm ci`, installs Playwright Chromium, runs `npm run content:validate`, runs `npm run test`.
- Publish workflow: `.github/workflows/publish.yml`
  - Push to `main`: incremental publish path (`publish:plan`, `publish:media`, `publish:prepare`, cleanup, incremental content publish, build, Azure deploy).
  - Tag/manual dispatch: full rebuild publish path.

## Packaging/deploy shape

- Deployment package is built into `.tmp/webapp-package` containing:
  - `webapp/package.json`
  - `webapp/server.cjs`
  - built frontend under `public/` (copied from `dist/`)
- Azure deploy uses `Azure/webapps-deploy@v3`.

## Release/versioning conventions

- Tags trigger full rebuild publish runs.
- Main branch pushes use incremental publish.
- Publish workflow may commit normalized media reference updates with `[skip ci]`.

## Guardrails

- API is external/shared; frontend build must target explicit `VITE_API_BASE_URL` + `VITE_API_SITE_ID`.
- Do not change publish trigger semantics without reviewing `docs/github-actions.md` and `docs/authoring-publish-workflow.md`.
