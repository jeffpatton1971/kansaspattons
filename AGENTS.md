# Agent Entry Point

If you are an AI coding agent working in this repository, read this first:

```text
docs/agent-briefing.md
```

That briefing explains what this project is, what the nearby sibling
repositories are for, how content flows from Markdown to React, what not to
change accidentally, and where the platform is going.

Short version:

- This repository is the current React site framework reference.
- Site repos own authoring, generated content, media manifests, and frontend
  deployment.
- The shared API lives in `ptech-sites-api`; do not add API runtime code here.
- `content/site.config.json` is editable source; `public/content/*.json` is
  generated output.
- Preserve Jekyll-like authoring ergonomics while evolving toward an extensible
  React/API content framework with base `Item` types, collections, layout
  presets, theme tokens, and shared rendering components.

