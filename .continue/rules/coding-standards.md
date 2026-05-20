# Coding Standards

## Language and framework

- TypeScript + React 19 + React Router 7 + Vite.
- Use strict typing (`tsconfig.app.json` has `strict: true`).
- Prefer existing type models in `src/types.ts`; extend instead of ad-hoc inline shapes.

## Imports and structure

- Use alias `@/*` for app-local imports when appropriate (configured in Vite + TS).
- Keep shadcn primitives in `src/components/ui`; app-level compositions in `src/components`.
- Keep data access in `src/content.ts`; avoid duplicating fetch logic across pages.

## Styling

- Tailwind CSS v4 + shadcn/ui conventions.
- Reuse `cn()` from `src/lib/utils.ts` for class merging.
- Prefer theme tokens/CSS variables in `src/styles.css` for long-lived visual values.

## Content and API rules

- Do not hardcode default-site API paths like `/api/home`; always include site id.
- Do not hand-edit generated files in `public/content/`.
- Do not reintroduce legacy `article` terminology in new authored content; use target `post/story/gallery` contract.

## Dependencies

- Reuse existing libraries first.
- Add new dependencies only when necessary and consistent with project direction.
- For UI primitives, use shadcn CLI patterns already documented (`components.json`, `src/components/ui`).

## Error handling and logging

- Follow existing pattern: throw explicit errors in data fetch utilities (see `fetchJson` in `src/content.ts`).
- Keep user-facing behavior stable; avoid noisy console logging unless already established in that area.

## Agent do-not-do list

- Do not move API runtime concerns into this repo.
- Do not invent scripts, config keys, or JSON shapes.
- Do not rewrite broad styling or architecture when a local change is sufficient.
- If behavior is ambiguous, **Verify before changing** with docs under `docs/`.
