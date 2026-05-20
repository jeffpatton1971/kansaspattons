# Testing

## Test layout and framework

- Browser smoke tests are in `tests/site/`.
- Framework: Playwright (`@playwright/test`).
- Main test file currently: `tests/site/site-smoke.spec.ts`.

## Commands

- Install deps: `npm ci`
- Install browser (new machine/runner): `npx playwright install chromium`
- Validate content: `npm run content:validate`
- Run default suite: `npm run test`
- Site-only suite: `npm run test:site`
- E2E only: `npm run test:site:e2e`

## Current smoke expectations

- Home route renders shell + recent sections.
- Posts archive renders paged cards.
- Search returns clickable cross-type results.
- Tests mock `/api/**` from local generated `public/content` fixtures.

## Conventions

- Keep tests focused on user-visible route behavior.
- Add/adjust smoke assertions when route output or navigation behavior changes.
- Preserve API mocking style used in `site-smoke.spec.ts`.
- For content-contract or compiler changes, run `npm run content:validate` before and after updates.

## Verify before changing

- If adding deeper test layers (unit/integration), **Verify before changing** test strategy in `docs/testing.md`.
