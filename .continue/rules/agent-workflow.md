# Agent Workflow

- Search and read relevant files/docs before editing.
- Summarize intended change scope before making edits.
- Prefer small, focused changes over broad refactors.
- Do not invent file paths, APIs, classes, methods, scripts, or config keys.
- Preserve existing naming, typing, routing, and component patterns.
- Update tests/docs when behavior, contracts, or workflows change.
- Do not edit generated artifacts (`public/content/**`, `dist/**`) by hand.
- Avoid noisy/build output folders unless task explicitly requires them.
- Ask before large refactors, architecture rewrites, or dependency shifts.
- Keep shared API boundary intact (`ptech-sites-api` owns runtime API code).
- For uncertain requirements, mark and confirm: **Verify before changing**.
