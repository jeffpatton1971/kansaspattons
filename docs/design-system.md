# Design System

This React migration uses Tailwind CSS and shadcn/ui as the shared styling foundation for KansasPattons and future sibling sites.

## Goals

- Keep layout and content behavior site-specific while sharing UI primitives across sites.
- Prefer shadcn/ui primitives for common interface pieces such as buttons, cards, badges, tooltips, separators, skeletons, forms, dialogs, tabs, and menus.
- Use Tailwind utility classes for local composition and spacing.
- Keep long-lived visual choices in CSS variables so each site can theme the same components without forking them.

## Current Stack

- Tailwind CSS v4 is loaded through the Vite plugin.
- shadcn/ui is configured by `components.json`.
- The component alias is `@/*`, mapped to `src/*`.
- Shared shadcn primitives live in `src/components/ui`.
- The `cn` class helper lives in `src/lib/utils.ts`.
- Theme tokens live near the top of `src/styles.css`.

## Installed Primitives

- `Button`
- `Card`
- `Badge`
- `Separator`
- `Skeleton`
- `Tooltip`

The archive right rail is the first converted surface. It uses shadcn cards, badges, separators, and skeleton loading states.

## Adding Components

Use the shadcn CLI from the repo root:

```powershell
npx shadcn@latest add button
```

For several components:

```powershell
npx shadcn@latest add button card badge separator skeleton tooltip -y
```

## Styling Guidance

- Use shadcn primitives for new reusable UI.
- Use Tailwind classes in component markup for one-off layout.
- Keep source/content colors in theme variables or small mapping functions.
- Avoid rewriting the full legacy stylesheet in one pass. Migrate surfaces as they are touched.
- For other sites, start with the same `components.json`, `src/components/ui`, `src/lib/utils.ts`, Vite Tailwind plugin, and token block in `src/styles.css`, then adjust only the theme variables.
