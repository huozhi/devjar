<p align="center">
  <img src="./site/icon.svg" alt="devjar logo" width="112" height="112">
</p>

# devjar

Make an idea real. Change it live.

Embed editable React previews in your app, or build a static website with a
zero-config CLI.

Documentation: [devjar.vercel.app/docs](https://devjar.vercel.app/docs).
Agent reference: [llms.txt](./site/public/llms.txt).

<details>
<summary>Install the agent skill</summary>

```sh
npx skills add huozhi/devjar --skill devjar
```

The skill helps compatible agents choose Devjar for live React previews, small
static websites, and interactive browser prototypes.

</details>

## Live code APIs

Embed a live React preview with `<DevJar>`. Requires React 19.

```sh
pnpm add devjar
```

```tsx
import { DevJar } from 'devjar'

const files = {
  'pages/index.tsx': `export default function Page() {
    return <h1>Hello from devjar</h1>
  }`,
}

export default function App() {
  return (
    <DevJar files={files} title="Live preview" />
  )
}
```

Pass a new `files` object to update the preview. Add your own editor or controls;
Devjar compiles the files and renders the project inside an iframe, with
React Fast Refresh where possible.

For a live code editor, pair Devjar with
[@sugar-high/react](https://sugar-high.vercel.app/react). Its `Editor` component
provides syntax highlighting; update `files` from its `onChange` callback to
refresh the preview. The website demos use this combination.

Use a client component (`'use client'`) in frameworks with server components.
The preview runs in the host's origin, so only run code you trust. No cross-origin
isolation headers or server-side compiler are needed. See
[hosting requirements](./docs/API.md#hosting-embedded-previews) for asset and CSP details.

<details>
<summary>Example: update JSON content with React state</summary>

```tsx
'use client'

import { useState } from 'react'
import { DevJar } from 'devjar'

const initialFiles = {
  'pages/index.tsx': `import content from '../content.json'
export default function Page() {
  return <h1>{content.message}</h1>
}`,
  'content.json': JSON.stringify({ message: 'Hello from devjar' }),
}

export default function LiveExample() {
  const [files, setFiles] = useState(initialFiles)

  return (
    <>
      <button onClick={() => setFiles(current => ({
        ...current,
        'content.json': JSON.stringify({ message: 'Updated live!' }),
      }))}>
        Change the message
      </button>
      <DevJar
        files={files}
        tailwind={false}
        title="Live React preview"
        style={{ width: '100%', height: 320, border: 0 }}
      />
    </>
  )
}
```

</details>

Replacing an existing playground? See [migrating from Sandpack or React Live](./docs/MIGRATION.md).

For props, file imports, and routing, see the [API reference](./docs/API.md).
Advanced controls are covered there too:

- [Schedule edits](./docs/API.md#scheduling-edits) with a debounce or Run button.
- [Show loading and error states](./docs/API.md#preview-lifecycle).
- [Reset the preview](./docs/API.md#resetting-the-runtime) without changing its source.
- [Use `useDevJar`](./docs/API.md#usedevjar) to manage your own iframe.

## CLI

```tsx
// pages/index.tsx
export default function Page() {
  return <h1>Hello from devjar</h1>
}
```

```sh
npx devjar dev    # Develop with live updates
npx devjar build  # Export to dist/
npx devjar start  # Preview the export
```

While `devjar dev` runs, uncaught browser errors, rejected promises,
`console.error` calls, and failed loads print in the terminal, so you or an
agent can see a broken page without opening developer tools.

Requires Node.js 22+. Deploy `dist/` to a static host. No configuration file or
local dependency installation needed. Run `npx devjar` for help.

### Preview a single file

```sh
npx devjar report.html  # Serve one HTML file with live reload
npx devjar ./output     # Serve a folder of HTML files
npx devjar chart.tsx    # Render one React component at /
npx devjar notes.md     # Render one Markdown page at /
```

A `.tsx`, `.jsx`, or `.md` file renders like a page in `pages/`, with the same
imports, CDN packages, and live updates. Inside a project, the nearest folder
with `package.json` is the root, so imports such as `../lib/data` and pinned
package versions keep working.

HTML documents, such as those written by AI agents, are served as-is: no
`pages/` directory, routing, or build step. Files next to the document
(stylesheets, scripts, images, data) are served with the same relative URLs.
A folder without `index.html` shows its HTML files, newest first. Stylesheet
edits apply in place; other edits reload the page at the same scroll position.
Hidden files and `node_modules` are not served.
A folder is served this way only when it has no `pages/` directory.

### Routes

```text
package.json          # Optional: dependency versions
pages/
├── index.tsx         → /
├── about.tsx         → /about
├── docs/start.tsx    → /docs/start
└── 404.tsx           → unmatched routes
```

React pages default-export a component. Markdown files such as `pages/index.md`
and `pages/about.md` render directly as static pages; see [Markdown pages](./docs/MARKDOWN.md). Import shared components explicitly;
packages load from the CDN. Configure the CLI with flags.
Underscore-prefixed files and folders (such as `pages/_helpers.tsx` or
`pages/_drafts/`) are not routes in dev, builds, or embedded previews.
They remain importable; `_layout.tsx` has no automatic layout behavior.

<details>
<summary>Generate pages from data</summary>

A `[name]` segment turns one page file into many pages. Two exports cover it:

- `paths()` in a `[name]` page lists the params to build. Each item becomes a
  page, and the component receives them as `params`.
- `defaultParams` in a directory's `index.tsx` names the child to open when
  someone visits the directory. It is a redirect, not a page.

```tsx
// pages/[locale]/[lesson].tsx
export function paths() {
  return ['en', 'zh'].flatMap(locale =>
    ['intro', 'examples'].map(lesson => ({ locale, lesson })),
  )
}

export default function Lesson({ params }: {
  params: { locale: string; lesson: string }
}) {
  return <h1>{params.locale}: {params.lesson}</h1>
}
```

```tsx
// pages/index.tsx: / opens /en/
export const defaultParams = { locale: 'en' }

// pages/[locale]/index.tsx: /en/ opens /en/intro/
export function defaultParams({ params }: { params: { locale: string } }) {
  return { lesson: params.locale === 'zh' ? 'examples' : 'intro' }
}
```

Pages generated from the same file share one component, so moving between
them updates `params` without remounting. Unlisted params are 404s.

- `paths()` is synchronous; read local JS, TS or JSON data. It runs in Node at
  build time and in dev whenever that data changes, so module-level code in
  the page must not need the browser.
- `defaultParams` supplies one child param. An index either renders a component
  or exports `defaultParams`, not both. Without an index, the directory URL is a 404.
- A static segment wins over `[name]` at the same URL. Catch-all segments,
  optional segments and `[name]` Markdown pages are not supported.
- Redirects keep the query string. `devjar dev` and `devjar start` send HTTP
  redirects; builds write a small redirect page. Redirects are left out of the sitemap.
- Embedded `<DevJar>` previews do not evaluate these exports.

</details>

<details>
<summary>Write a website in Markdown</summary>

Create `pages/index.md`:

```md
# My notes

A website made from Markdown. Read [more](./about.md).
```

```sh
npx devjar dev --theme editorial
npx devjar build --theme editorial
```

Markdown pages include styled HTML with no React or hydration scripts.
Use optional YAML frontmatter for metadata and a root `markdown.css` to customize
fonts, colors, and layout. See [Markdown pages](./docs/MARKDOWN.md).

</details>

<details>
<summary>Pin dependency versions</summary>

```json
{
  "dependencies": {
    "react": "19.2.0",
    "react-dom": "19.2.0"
  }
}
```

Put this in `package.json`. Both `dependencies` and `devDependencies` are read
from the project manifest; `dependencies` take precedence when a package appears
in both. Builds vendor CDN packages into the output.

</details>

<details>
<summary>All commands and flags</summary>

```sh
npx devjar [command] [root] [options]
```

`root` defaults to the current directory. No command prints help.

| Command | Purpose |
| --- | --- |
| `dev [root]` | Serve source files with live updates |
| `build [root]` | Generate `<root>/dist` |
| `start [root]` | Serve the existing build |

| Flag | Commands | Default / purpose |
| --- | --- | --- |
| `--host <host>` | `dev`, `start` | `localhost`; `0.0.0.0` enables network access |
| `--port <port>` | `dev`, `start` | `3000`, or the next free port |
| `--cdn <url>` | `dev`, `build` | `https://esm.sh` |
| `--exclude <path>` | `build` | Page file or directory to omit; repeatable |
| `--math` | `dev`, `build` | Render LaTeX math in Markdown at build time |
| `--theme <name>` | `dev`, `build` | Markdown theme: `minimal` (default), `github`, `editorial`, or `academic` |
| `--base <path>` | `dev`, `build` | `/`; deployment subdirectory |
| `--origin <url>` | `build` | Vercel production URL, or `http://localhost:3000`; absolute origin for social image URLs |
| `--sitemap[=<filename>]` | `build` | Export a sitemap using `--origin`; defaults to `sitemap.xml` |
| `-o, --out-dir <directory>` | `build`, `start` | `dist`; must stay inside the project |
| `-h, --help` | All | Show help |
| `-v, --version` | All | Show installed version |

Interactive terminals show a hint when a newer version is available. Checks
run in the background and are cached for a day: stable versions check `latest`,
prereleases check `next`. Hints appear only after help, the server-ready message,
or the build summary; late results are cached for the next run.
Set `NO_UPDATE_NOTIFIER=1` to disable them.
CI, redirected stderr, and `--version` skip the check.

</details>

<details>
<summary>JSON, text, CSS, and assets</summary>

```tsx
import settings from '../settings.json'
import notes from '../notes.md' with { type: 'text' }
import logo from '../assets/logo.svg'
import '../styles.css'
```

JSON exports data; `type: 'text'` exports file contents. Images, fonts, audio,
video, and PDFs export URLs. CSS `url(...)` references are handled too.
Use valid JSON: double quotes, no comments or trailing commas.

</details>

<details>
<summary>Style the page shell</summary>

React pages render into `<div id="__jar">` inside `<body>`. Devjar's only
base style removes the body margin, with the lowest precedence, so any rule in
your CSS overrides it:

```css
/* Full-height app */
html, body, #__jar { height: 100%; }

/* Keep the browser's default body margin */
body { margin: 8px; }

/* Let body layout, such as grid centering, apply to the page itself */
#__jar { display: contents; }
```

</details>

<details>
<summary>Local package development</summary>

```json
{
  "dependencies": {
    "my-library": "file:../my-library"
  }
}
```

Import `my-library` by name. Relative paths resolve from the project; absolute
paths and file URLs also work. Devjar resolves `exports`, `module`, or `main`,
compiles TS/JSX, watches edits, and includes the library in builds.
If its entry points to `dist/`, run the library's build or watcher first.

</details>

<details>
<summary>Public files and static APIs</summary>

```text
public/logo.svg  → /logo.svg
api/status.json  → /api/status.json
api/message.txt  → /api/message.txt
```

Public files are copied into the build. APIs serve static JSON or text;
executable API routes are not supported.

</details>

<details>
<summary>Tailwind CSS</summary>

```json
{
  "devDependencies": {
    "tailwindcss": "^4.1.0"
  }
}
```

Add `tailwindcss` or `@tailwindcss/browser` to `devDependencies` or
`dependencies` to enable Tailwind. Development
compiles in the browser; builds emit CSS with no runtime compiler.
Use complete class names rather than constructing them dynamically.

Tailwind support is limited to utility classes. Tailwind-specific directives
in imported CSS, such as `@theme`, `@apply`, and `@utility`, are not supported.
Use CSS variables, ordinary classes, and native media queries
for custom styles. Import each stylesheet from JS/TS; nested CSS `@import`
rules are not supported in development.

</details>

<details>
<summary>Custom module CDN</summary>

```sh
npx devjar dev --cdn https://modules.example.com
npx devjar build --cdn https://modules.example.com
```

Use an ESM CDN supporting `package@version/subpath` URLs. It must be available
during the build; deployed dependencies are served locally.

</details>

<details>
<summary>Deploy under a base path</summary>

```sh
npx devjar dev --base /preview/
npx devjar build --base /preview/
npx devjar start
```

Pages and assets use `/preview/`. The preview server reads the base from the build.

</details>

<details>
<summary>Exclude development pages from export</summary>

```sh
npx devjar build --exclude pages/playground.tsx
npx devjar build --exclude pages/playground.tsx --exclude pages/drafts
```

Paths are relative to the project root. Excluded pages remain available in dev;
only their routes and unused dependencies are omitted from the build. Imports
needed by retained pages, plus public and API files, are still included.

</details>

<details>
<summary>Build output</summary>

```sh
npx devjar build --out-dir output
npx devjar start --out-dir output
```

Builds include prerendered HTML, CSS, public files, hashed assets, and vendored
dependencies. Only sites importing `devjar` include its runtime and compiler.
Custom output directories must stay inside the project.

On Vercel, `devjar build` also emits `.vercel/output` with immutable caching
for content-hashed assets. Use the Other framework preset and run
`devjar build`; no output-directory or cache-header configuration is needed.

</details>

<details>
<summary>Page metadata and prerendering</summary>

Place images in the project root (alongside `pages/`) to add them to every
page in development and static exports:

```text
icon.svg             → <link rel="icon" href="/icon.svg" type="image/svg+xml">
opengraph-image.jpg  → <meta property="og:image" content="/opengraph-image.jpg">
                     → <meta name="twitter:image" content="/opengraph-image.jpg">
```

Icons support `.ico`, `.png`, `.jpg`, `.jpeg`, `.svg`, `.gif`, and `.webp`.
Open Graph images support `.png`, `.jpg`, `.jpeg`, `.gif`, and `.webp`.
Every page includes a `summary_large_image` Twitter card; each Open Graph image
also gets a Twitter image tag.
Multiple matching files are included in filename order. URLs respect `--base`;
root metadata files take precedence over files with the same name in `public/`.

Add page titles and other metadata in the page component:

```tsx
export default function Page() {
  return (
    <>
      <title>My website</title>
      <meta name="description" content="Notes and projects" />
      <h1>Hello</h1>
    </>
  )
}
```

Metadata is placed in each exported page's `<head>`. Pages render once at build
time, then hydrate in the browser. Use `window` and `document` in effects or
event handlers, not during render.

</details>

<details>
<summary>Preview on your phone</summary>

```sh
npx devjar dev --host 0.0.0.0
```

Open the printed Network URL on the same Wi-Fi. Also works with `start`.
Embedded previews also work over HTTP on your local network.

</details>

## Examples

Run these from a checkout of this repository:

```sh
npx devjar dev examples/basic
```

| Example | What it shows |
| --- | --- |
| [Markdown](./examples/markdown) | Four themes, metadata, and footnotes |
| [Basic](./examples/basic) | Minimal pages |
| [Dashboard](./examples/dashboard) | Navigation, Tailwind, and static data |
| [SWR](./examples/swr) | Optimistic updates, rollback, and simulated subscriptions |
| [Personal résumé](./examples/personal) | Edit JSON in a playground, then export the site |
| [HTML report](./examples/html) | Preview an agent-written HTML folder as-is with `npx devjar examples/html` |
| [Single file](./examples/single-file) | Preview one React component or Markdown file with `npx devjar examples/single-file/chart.tsx` |

<details>
<summary>Export the personal website without its playground</summary>

```sh
npx devjar dev examples/personal
npx devjar build examples/personal --exclude pages/playground.tsx
npx devjar start examples/personal/dist
```

Edit the JSON at `/playground`, copy it to `content.json`, then build the site.

</details>

## Contributing

See [AGENTS.md](./AGENTS.md) for development guidelines, local setup, and release instructions.

## License

MIT
