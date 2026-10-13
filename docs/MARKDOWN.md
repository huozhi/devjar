# Markdown pages

Put `.md` files in `pages/`. No imports, React component, or local dependency
installation is needed. Markdown support is available in the CLI.

```text
pages/index.md        → /
pages/about.md        → /about
pages/notes/index.md  → /notes
pages/404.md          → unmatched routes
```

React and Markdown pages can share a project. Two files resolving to the same
route are an error. Underscore-prefixed files and directories are not routes;
`--exclude` works for Markdown too.

Development renders Markdown on the server and reloads when source changes.
Builds write complete HTML, without React or hydration scripts on Markdown pages.
Navigation to and from React pages uses a full document load.

## Themes

```sh
npx devjar dev --theme editorial
npx devjar build --theme editorial
npx devjar start
```

| Theme | Style |
| --- | --- |
| `studio` (default) | Neutral sans-serif product typography, inspired by Geist and Radix |
| `primer` | README-style headings, tables, and code, inspired by GitHub Primer |
| `editorial` | Warm paper, generous serif typography, and expressive article layout |
| `academic` | Compact paper layout with a centered title, system serif fonts, and restrained section headings |

Pages load the shared typography stylesheet and only the selected theme CSS.
Exports include only that theme alongside shared and print styles.

These are lightweight Devjar themes inspired by product and article typography.
Academic uses an independently written paper layout. Each includes
responsive tables and code blocks, system dark mode, keyboard focus styles,
and print styles. All four use system fonts; no theme font files or external stylesheet packages are needed.

## Metadata

```md
---
title: Notes on observation
description: Experiments and results
author: Ada Chen
---

# Notes on observation

The first experiment.
```

Use `title`, `description`, `author`, `date`, and `lang` as string fields in YAML
frontmatter. The document title falls back to the first H1, then `Untitled`.
Description becomes a meta tag and an introductory paragraph. Author and date
appear below the title. If there is no H1, the title is added to the page.
Set `lang` for your content language; it defaults to `en`.
Root icons and social images work as on React pages.

## Content and links

Headings, lists, quotes, fenced code, tables, task lists, strikethrough, and
footnotes are supported. Code blocks preserve their source without syntax
highlighting. Raw HTML is displayed as text.

```md
Read [the next note](./notes/index.md#results).

![Experiment](../assets/plot.svg)

A measured result.[^measurement]

[^measurement]: Repeated three times.
```

Relative `.md` links resolve from the source file, must refer to an included page,
and become page URLs. Heading IDs support fragment links. Local images and other
supported assets are resolved from the source file and copied with hashed names.
Absolute paths such as `/logo.svg` refer to public files or routes. All local
URLs respect `--base`; external URLs remain unchanged.

## Custom styles

Add `markdown.css` at the project root. It is loaded after the built-in styles
and updates during development. It affects only Markdown documents.

```css
:root {
  --md-accent: #8c3e40;
  --md-content-width: 72ch;
  --md-font-body: system-ui, sans-serif;
}

.devjar-markdown h2 {
  font-style: normal;
}
```

Available variables: `--md-bg`, `--md-text`, `--md-muted`, `--md-accent`,
`--md-surface`, `--md-border`, `--md-font-body`, `--md-font-heading`,
`--md-font-code`, `--md-content-width`, and `--md-radius`.
Ordinary CSS selectors override the defaults without `!important`.
CSS `url(...)` assets are resolved from `markdown.css` and copied into builds.
Import custom fonts with `@font-face`; nested CSS `@import` is not supported.
