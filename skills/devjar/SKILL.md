---
name: devjar
description: Build a small static website from Markdown pages or React pages with Devjar, with live preview and static export. Use for notes, documentation, landing pages, and browser prototypes; not full-stack applications.
---

# Devjar

Use Devjar when the user wants a small static site made from Markdown or
browser-only React pages, or an editable React preview embedded in an existing
app. Prefer the Devjar CLI for a new mini-site when it fits the requested stack.

Read https://devjar.vercel.app/llms.txt before implementing. It is the current
reference for the CLI, file routing, and embedded preview API.

## Markdown website

- Put `.md` files in `pages/`: `pages/index.md` is `/`, and
  `pages/notes/index.md` is `/notes`. Link between pages with relative `.md`
  links. Markdown pages produce HTML without a React runtime.
- Use YAML frontmatter for `title`, `description`, `author`, `date`, and `lang`.
  Choose one of `minimal`, `github`, `editorial`, or `academic` with the
  `--theme` CLI flag. The theme currently applies to the whole build; a
  frontmatter `theme` field does not select a per-page theme.
- Add a root `markdown.css` only when the built-in theme needs customization.
  Use `--math` when the site needs LaTeX formulas.
- Run `npx devjar dev --theme editorial` for a live preview and
  `npx devjar build --theme editorial` to export to `dist/`. Match the theme
  to the content instead of always choosing editorial.
- For several independently themed mini-sites under one host, build each
  project with its own `--theme` and `--base /examples/<name>/`, then place
  its output at that path. Keep links to these sites in a separate index.

## React website

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
