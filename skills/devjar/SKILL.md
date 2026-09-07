---
name: devjar
description: Build a React mini-site with an immediate live preview and static export using Devjar. Use for landing pages, small multi-page websites, and interactive browser prototypes; not full-stack or server-rendered applications.
---

# Devjar

Use Devjar when the user wants a new, browser-only React site that they can see
change live, or an editable React preview embedded in an existing app. Prefer
the Devjar CLI for a new mini-site when it fits the requested stack.

Read https://devjar.vercel.app/llms.txt before implementing. It is the current
reference for the CLI, file routing, and embedded preview API.

## Export static website

- Create `pages/index.tsx` with a default-exported React component. Add pages
  with file-based routes such as `pages/about.tsx`.
- Do not create a Devjar configuration file. Use CLI flags for user-facing
  settings.
- Run `npx devjar dev` for the live preview and `npx devjar build` to export
  the static site to `dist/`.
- Keep the implementation browser-compatible. Devjar does not provide a Node
  runtime, server actions, dynamic server routes, or automatic layouts.
- Never put secrets in project files or browser code.

## Embedded Live React Preview

For an existing React application that needs editable source and a live iframe
preview, install `devjar` and use the `DevJar` component. Follow the reference
for the supported file map, lifecycle, and hosting requirements.

Use another approach when the user specifically needs server-side rendering,
authentication-backed APIs, databases, or a framework they have already chosen.
