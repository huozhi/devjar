<p align="center">
  <img src="./site/public/icon.svg" alt="devjar logo" width="112" height="112">
</p>

# devjar

Make an idea real. Change it live.

Devjar has two main features: live code APIs for embedding editable React
projects in an iframe, and a zero-config CLI for building static websites.

## Live code APIs

Embed a live React preview with `<DevJar>`. Requires React 19.

```sh
pnpm add devjar
```

### DevJar component

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
Devjar handles compilation and renders the project inside an iframe. All four
homepage gallery demos use this API through
[`Codesandbox`](./site/components/codesandbox.tsx).

The host needs the [iframe hosting headers](#iframe-hosting-requirements).
Use a client component in frameworks with server components.

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

<details>
<summary>Component props and defaults</summary>

| Prop | Type | Behavior |
| --- | --- | --- |
| `files` | `Record<string, string>` | Required. Virtual paths mapped to source text |
| `dependencies` | `Record<string, string>` | Optional package versions for the default esm.sh resolver |
| `resolveModule` | `(specifier: string) => string` | Optional resolver override returning browser-loadable ESM URLs |
| `transform` | `boolean` | Default `true`; compile JSX and TypeScript in a worker |
| `tailwind` | `boolean` | Default `true`; enable the iframe's Tailwind browser runtime |
| `onError` | `(error: unknown) => void` | Called when error state changes; defaults to `console.error` in the browser |
| `transformWorkerUrl` | `string` or `URL` | Optional custom transform worker location |
| `ref` | `React.Ref<HTMLIFrameElement>` | Access the rendered iframe |
| Other iframe props | `React.IframeHTMLAttributes` | Forwarded to the iframe, including `title`, `style`, and `className` |

Keep `files` and custom resolver functions stable between unrelated parent
renders. To edit a file, replace its string in a new `files` object.

</details>

<details>
<summary>Virtual files, JSON imports, and iframe navigation</summary>

The runtime supports JavaScript, TypeScript, JSX, TSX, CSS, and default JSON
imports. JSON must use double quotes and cannot contain comments or trailing
commas. Import any local file as a string with an explicit text attribute:

```js
import text from './notes.md' with { type: 'text' }
```

This also works in the CLI. Use relative imports between virtual files. Bare package imports resolve
to CDN modules; React dependencies must use compatible versions.

The iframe uses the same `pages/` route convention as the CLI. Links such as
`<a href="/about">About</a>` navigate inside the iframe. Provide `pages/404.tsx`
for a custom missing-page view. Changes propagate through local imports and use
React Fast Refresh where possible.

The virtual file map contains source strings. The CLI's disk asset pipeline,
`public/`, and static `api/` serving are separate CLI features. For iframe image
or media content, use browser-accessible URLs.

The iframe separates the preview's DOM and styles from the host page. It runs
in the host's origin; it is not a security boundary for untrusted code.

</details>

### useLiveCode hook

Use `useLiveCode` when you want to own the iframe and decide when a project runs.

<details>
<summary>Hook example and return values</summary>

Use `useLiveCode` when you want to own the iframe and decide when to load files.
It accepts the same `dependencies`, `resolveModule`, `transform`, `tailwind`, and
`transformWorkerUrl` options as the component.

```tsx
'use client'

import { useLiveCode } from 'devjar'

const files = {
  'pages/index.tsx': `export default function Page() {
  return <h1>Hello from an iframe</h1>
}`,
}

export default function ManualPreview() {
  const { ref, error, load } = useLiveCode({ tailwind: false })

  return (
    <>
      <button onClick={() => void load(files)}>Run</button>
      {error != null && <pre>{String(error)}</pre>}
      <iframe ref={ref} title="Live React preview" style={{ width: '100%', height: 320 }} />
    </>
  )
}
```

| Return value | Meaning |
| --- | --- |
| `ref` | Attach to the iframe that will run the project |
| `error` | Current runtime error, if any |
| `load(files)` | Load or update the virtual project; returns `Promise<void>` |

</details>

### Iframe hosting requirements

Embedded previews require a secure context and cross-origin isolation. Devjar's
CLI sets the headers for you; other hosts need:

```http
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: credentialless
```

<details>
<summary>Hosting details and Next.js configuration</summary>

The iframe transforms code in the browser using Oxc and shared WebAssembly
memory, so its host page must be cross-origin isolated. Devjar packages the
browser transformer, WASM binary, and helper worker as lazy runtime assets;
compatible bundlers emit these files without requiring a manual copy step.
The `devjar dev` server sends the required headers so an editor can be added while
it is running. `devjar start` sends them only for builds that use the editor.
Static deployments that use `devjar` must configure equivalent headers on
their hosting platform; sites without the editor do not need them.

#### Next.js headers example

```js
const nextConfig = {
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
        { key: 'Cross-Origin-Embedder-Policy', value: 'credentialless' },
      ],
    }]
  },
}
```

</details>

## CLI

Turn a folder of React pages into a static website. Requires Node.js 22+.

Create `pages/index.tsx`:

```tsx
export default function Page() {
  return <h1>Hello from devjar</h1>
}
```

Then run:

```sh
npx devjar dev    # Develop with live updates
npx devjar build  # Generate dist/
npx devjar start  # Preview the build
```

Deploy `dist/` to a static host. Builds include prerendered HTML, CSS, assets,
and vendored dependencies. Run `npx devjar` for help.

### Routes and dependencies

```text
package.json          # Optional: dependency versions
pages/
├── index.tsx         → /
├── about.tsx         → /about
└── docs/start.tsx    → /docs/start
```

Packages load from the CDN; no local installation is needed. An optional
`package.json` pins versions through `dependencies` or `devDependencies`.
All CLI settings use flags, with no configuration file.

<details>
<summary>Example: pin dependency versions</summary>

```json
{
  "dependencies": {
    "react": "19.2.0",
    "react-dom": "19.2.0"
  }
}
```

Import packages by name in your pages. The CLI reads only `dependencies` and
`devDependencies` from the project manifest. Production builds vendor CDN
modules so deployed sites do not need the CDN.

</details>

<details>
<summary>All commands and flags</summary>

```sh
npx devjar [command] [root] [options]
```

`root` defaults to the current directory. Running `npx devjar` with no command
prints help.

| Command | Purpose |
| --- | --- |
| `dev [root]` | Serve source files with live updates |
| `build [root]` | Generate static output in `<root>/dist` |
| `start [root]` | Serve the existing build |

| Flag | Commands | Default / purpose |
| --- | --- | --- |
| `--host <host>` | `dev`, `start` | `localhost`; use `0.0.0.0` for network access |
| `--port <port>` | `dev`, `start` | `3000` |
| `--cdn <url>` | `dev`, `build` | `https://esm.sh` |
| `--base <path>` | `dev`, `build` | `/`; deployment subdirectory |
| `-o, --out-dir <directory>` | `build`, `start` | `dist`; must be inside the project |
| `-h, --help` | All | Show help |
| `-v, --version` | All | Show installed version |

</details>

<details>
<summary>Project structure, nested routes, and custom 404 pages</summary>

The project does not need a bundler configuration or a local `node_modules`
directory:

```text
my-prototype/
├── package.json       # optional
├── pages/
│   ├── index.jsx
│   └── about.jsx
├── components/
│   └── card.jsx
├── api/
│   ├── status.json
│   └── message.txt
└── public/
    └── logo.svg
```

```sh
npx devjar dev
```

Running `devjar` without arguments shows help. Use `devjar dev` to start the
development server, which watches the project and updates the browser as files change.

The pages directory maps directly to URLs:

| File | URL |
| --- | --- |
| `pages/index.jsx` | `/` |
| `pages/about.jsx` | `/about` |
| `pages/docs/index.jsx` | `/docs` |
| `pages/docs/start.jsx` | `/docs/start` |
| `pages/404.jsx` | unmatched routes |

</details>

<details>
<summary>JSON, CSS, and asset imports</summary>

JSON files provide a default export and update live when edited:

```tsx
import settings from '../settings.json'
```

Use valid JSON (double-quoted keys, without comments or trailing commas).

Pages can import local JavaScript, TypeScript, JSX, TSX, JSON, and CSS files. Image,
font, audio, video, and PDF imports export their public URL, and relative
`url(...)` references in CSS use the same asset pipeline:

```jsx
import logo from '../assets/logo.svg'
import '../styles.css'

export default function Page() {
  return <img src={logo} alt="Logo" />
}
```

</details>

<details>
<summary>Local package development</summary>

To develop a playground alongside a local library, point the dependency at its
directory:

```json
{
  "dependencies": {
    "respinner": "file:../respinner"
  }
}
```

Absolute paths such as `/Users/huozhi/code/respinner` and file URLs such as
`file:///Users/huozhi/code/respinner` also work. Relative paths resolve from the
project directory. Import the library by its package name as usual.

The CLI reads the local library's `exports`, `module`, or `main` entry point,
including exported subpaths. Local entries must be ES modules; TypeScript and
JSX are compiled automatically. If the entry points into `dist/`, run the
library's build or watch command first. Library edits reload the playground in
`devjar dev`. Builds include the local modules, and prerendering can use them too.
Other dependencies still use the CDN, with React shared with the playground.

</details>

<details>
<summary>Public files and static APIs</summary>

Files below `public/` are served from `/`. JSON and text files below `api/`
are available at their corresponding `/api/` URLs. Executable API routes are
not supported.

</details>

<details>
<summary>Tailwind CSS</summary>

For CLI projects, add `tailwindcss` or `@tailwindcss/browser` to the dependency
list to enable Tailwind. Development uses Tailwind's browser compiler for live
updates. Production builds use the matching Tailwind compiler to collect static
class candidates from project source and prerendered pages, then emit a hashed
stylesheet under `_jar/assets/`. The deployed site does not load or compile
Tailwind at runtime.

Use complete class names for conditional styles instead of constructing them
dynamically so the production build can detect every candidate.

</details>

<details>
<summary>Custom module CDN</summary>

Non-local bare imports use esm.sh in development and as the source for vendored
production modules. Select a different ESM-compatible CDN with the `--cdn`
flag:

```sh
npx devjar dev --cdn https://modules.example.com
npx devjar build --cdn https://modules.example.com
```

The CLI applies dependency versions to CDN URLs using the
`package@version/subpath` convention. During `devjar build`, the selected CDN must
be available while dependencies are collected, but it is not contacted by the
deployed site. Modules and their referenced assets are stored below a
content-hashed directory and can be cached as immutable files.

</details>

<details>
<summary>Deploy under a base path</summary>

Use `--base <path>` when the site will be hosted below the domain root. The
same base is embedded in the build, so `devjar start` reads it automatically:

```sh
npx devjar dev --base /preview/
npx devjar build --base /preview/
```

Pages, public files, API files, and Devjar runtime assets are then served below
`/preview/`. Base paths are normalized with one leading and trailing slash.

</details>

<details>
<summary>Build output, metadata, and prerendering</summary>

Create a static build, then serve it without source-file watching or on-request
transforms:

```sh
npx devjar build
npx devjar start
```

The build writes the initial React content and imported CSS into an HTML file for
each route, then hydrates that content in the browser. Opening or hosting the
HTML therefore shows page content before client JavaScript runs. Package imports
are loaded from the selected CDN during the build and emitted as local files, so
the project does not need a local `node_modules` directory and the deployed site
does not need the CDN.

`devjar start [root]` treats `root` as the project directory and serves its `dist`
build by default. Pass the same `--out-dir <directory>` used for the build when
using a custom output directory. A build directory passed directly remains
supported for compatibility.

Files from `public/` are copied to the root of the output directory. For example,
`public/logo.svg` becomes `dist/logo.svg` and remains available at `/logo.svg`.
Imports from `devjar` use the runtime and worker assets included in the build
instead of loading another copy of Devjar from the package CDN. Builds without
a `devjar` import omit the Devjar runtime, transformer workers, and WASM.

Pages can render React 19 document metadata directly. Devjar preserves these
elements in each route's `<head>` during static export:

```jsx
export default function Page() {
  return (
    <>
      <title>My prototype</title>
      <meta name="description" content="A small React prototype" />
      <link rel="icon" href="/icon.svg" />
      <main>...</main>
    </>
  )
}
```

Static rendering executes every page once during the build. Browser APIs can be
used in effects and event handlers, but using `window` or `document` directly
during render will fail the build with the affected route.

Use `--out-dir <directory>` to change the build location. The output directory
must remain inside the project root.

Imported assets are emitted under `_jar/assets/` with content-hashed filenames.
Vendored dependencies and their transitive assets are stored under `_jar/vendor/`.

</details>

<details>
<summary>Runnable examples</summary>

The repository includes these runnable examples:

```sh
npx devjar dev examples/basic
npx devjar dev examples/dashboard
npx devjar dev examples/swr
```

The dashboard demonstrates page navigation, shared components, a CDN-loaded
icon package, Tailwind, static API data, and a public SVG asset.
The SWR example demonstrates optimistic task updates, rollback, and a shared
`useSWRSubscription` activity stream using a local simulated transport. Its source
also powers the homepage demo; after editing it, run
`bun scripts/sync-swr-example.ts` to update the embedded copy.

The site in `site/` runs Devjar's own editor and live preview as a pages-based
Devjar project (`devjar dev site`).

```sh
npx devjar dev [root] --host localhost --port 3000
```

</details>

<details>
<summary>Preview on your phone</summary>

```sh
npx devjar dev --host 0.0.0.0
```

Open the printed Network URL on a phone connected to the same Wi-Fi. Network
URLs include your selected port and base path. This also works with `devjar start`.
The default host remains localhost; pass `--host 0.0.0.0` to expose the server
on your network. Embedded editors require a secure, cross-origin-isolated context,
so use ordinary CLI pages for HTTP phone previews.

</details>

<details>
<summary>Repository development</summary>

```sh
pnpm install
pnpm run build      # Build library, CLI, client, and worker assets
pnpm run dev        # Watch the library and serve the website
pnpm run typecheck
bun test
```

Run the full build after changing runtime code; the package needs its client and
worker assets as well as the library bundle. CLI tests open local HTTP servers.

</details>

## License

MIT
