# GitHub Actions Rules

- Workflows to preserve:
  - PR CI: `.github/workflows/pr-ci.yml`
  - Publish: `.github/workflows/publish.yml`

## PR CI expectations

- Triggered on PRs to `main` and manual dispatch.
- Must keep validation gate sequence:
  - `npm ci`
  - Playwright Chromium install
  - `npm run content:validate`
  - `npm run test`

## Publish expectations

- `push` to `main` => incremental publish flow.
- tags / manual dispatch => full publish flow.
- Keep explicit API/site-id wiring (`VITE_API_BASE_URL`, `VITE_API_SITE_ID`).
- Keep deploy package structure (`webapp/server.cjs`, `webapp/package.json`, built `public/`).
- Keep Azure OIDC auth pattern (`azure/login@v2`, `id-token: write`).

## Safety rules

- Do not remove content validation or smoke test steps from CI.
- Do not collapse incremental and full publish triggers without explicit instruction.
- Do not add API deployment logic to this site repo’s workflows.
- For variable/secret contract changes, **Verify before changing** against `docs/github-actions.md`.
