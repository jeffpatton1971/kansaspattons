# Architecture

- Purpose: React + TypeScript reference site for the Patton multi-site content framework (`kansaspattons`), with generated JSON content and separate shared API runtime.
- Do not add API runtime code here; shared API lives in sibling repo `ptech-sites-api`.
- Preserve site-scoped API routes only: `/api/{siteid}/...` (for example `/api/kansaspattons/home`).

## Key folders

- `src/`: React app (routes, UI, data fetching, types).
  - `src/pages/`: route pages (`/posts`, `/stories`, `/galleries`, `/images`, `/search`, taxonomy pages).
  - `src/components/`: reusable view components.
  - `src/components/ui/`: shadcn/ui primitives.
- `scripts/`: content compiler/validator/publish tooling.
  - `build-content.ts`, `validate-content.ts`, `plan-publish.ts`, `publish-*.ts`.
- `content/`: editable content sources.
  - `site.config.json` and `media/index.json` are source-of-truth inputs.
- `_posts/`: Markdown authored content source.
- `public/content/`: generated JSON artifacts (do not hand-edit).
- `tests/site/`: Playwright smoke tests.
- `.github/workflows/`: CI (`pr-ci.yml`) and publish/deploy (`publish.yml`).
- `webapp/`: minimal Node host package for Azure App Service deployment.

## Ownership boundaries

- Edit source config/content in `content/` and `_posts/`.
- Generate artifacts via scripts; do not manually maintain `public/content/*.json`.
- React rendering behavior belongs in `src/`.
- Publish mechanics belong in `scripts/` + `.github/workflows/`.
- Azure API behavior belongs in `ptech-sites-api` (outside this repo).

## Common change locations

- New UI route/view: `src/pages/*`, then route registration in `src/App.tsx`.
- API fetch contract updates: `src/types.ts` + `src/content.ts`.
- Content schema/validation changes: `scripts/validate-content.ts` and docs under `docs/`.
- Site identity/nav/theme updates: `content/site.config.json` (not generated `public/content/site.json`).

## Guardrails

- Keep optional sections opt-in (banner/author/footer/theme should not render by default if omitted).
- Keep sibling-site compatibility in mind; avoid one-off hacks for only this site.
- If changing framework behavior across site repos, **Verify before changing** against docs in `docs/framework-evolution-roadmap.md`.
