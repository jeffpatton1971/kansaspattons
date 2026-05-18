# Testing

This repository now owns the React site, content compiler, publish tooling, and
browser smoke tests. The shared API test suite lives in the separate
`ptech-sites-api` repository.

## Site Suite

The site suite proves that dependency updates can still build the React app and
that the browser experience works at a smoke-test level.

```powershell
npm run test:site
```

This runs:

```powershell
npm run test:site:build
npm run test:site:e2e
```

`test:site:build` runs the normal production build:

```powershell
npm run build
```

`test:site:e2e` runs Playwright against the built app served by Vite preview.
The Playwright tests mock `/api/*` requests from generated `public/content`
JSON, so the site tests do not require Azure Functions to be running.

Current browser smoke coverage:

- Home page renders the configured shell and recent content.
- Posts archive renders paged post cards.
- Search page returns clickable cross-type results.

Install Playwright browsers on a new machine or CI runner with:

```powershell
npx playwright install chromium
```

Linux GitHub Actions runners can use:

```bash
npx playwright install --with-deps chromium
```

## Default Suite

Run the site suite from the repo root:

```powershell
npm run test
```

This is the command Dependabot and pull-request CI should run after install.

The pull-request workflow is:

```text
.github/workflows/pr-ci.yml
```

Publishing workflows are documented in [`github-actions.md`](github-actions.md).
