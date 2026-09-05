<p align="center">
  <img src="./site/public/icon.svg" alt="devjar logo" width="112" height="112">
</p>

# devjar

Make an idea real. Change it live.

Devjar has two main features: live code APIs for embedding editable React
projects in an iframe, and a zero-config CLI for building static websites.

Agent reference: [llms.txt](./site/public/llms.txt).

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

Requires Node.js 22+. Deploy `dist/` to a static host. No configuration file or
local dependency installation needed. Run `npx devjar` for help.

### Routes and dependencies

```text
package.json          # Optional: dependency versions
pages/
├── index.tsx         → /
├── about.tsx         → /about
├── docs/start.tsx    → /docs/start
└── 404.tsx           → unmatched routes
```

Each page default-exports a React component. Import shared components explicitly;
packages load from the CDN. Configure the CLI with flags.
Underscore-prefixed files and folders (such as `pages/_helpers.tsx` or
`pages/_drafts/`) are not routes in dev, builds, or embedded previews.
They remain importable; `_layout.tsx` has no automatic layout behavior.

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

Put this in `package.json`. Only `dependencies` and `devDependencies` are read
from the project manifest. Builds vendor CDN packages into the output.

</details>

### Personal website: playground to static export

```sh
# From this repository
npx devjar dev examples/personal
npx devjar build examples/personal --exclude pages/playground.tsx
npx devjar start examples/personal/dist
```

The [personal résumé](./examples/personal) includes a simple website and
`/playground`. Edit its JSON live, copy it to `content.json`, then export the
same site.

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
| `--port <port>` | `dev`, `start` | `3000` |
| `--cdn <url>` | `dev`, `build` | `https://esm.sh` |
| `--exclude <path>` | `build` | Page file or directory to omit; repeatable |
| `--base <path>` | `dev`, `build` | `/`; deployment subdirectory |
| `-o, --out-dir <directory>` | `build`, `start` | `dist`; must stay inside the project |
| `-h, --help` | All | Show help |
| `-v, --version` | All | Show installed version |

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
  "dependencies": {
    "tailwindcss": "^4.1.0"
  }
}
```

Add `tailwindcss` or `@tailwindcss/browser` to enable Tailwind. Development
compiles in the browser; builds emit CSS with no runtime compiler.
Use complete class names rather than constructing them dynamically.

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

</details>

<details>
<summary>Page metadata and prerendering</summary>

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
<summary>More examples</summary>

```sh
npx devjar dev examples/basic
npx devjar dev examples/dashboard
npx devjar dev examples/swr
```

[Basic](./examples/basic): minimal pages.
[Dashboard](./examples/dashboard): navigation, Tailwind, and static data.
[SWR](./examples/swr): optimistic updates, rollback, and simulated subscriptions.

</details>

<details>
<summary>Preview on your phone</summary>

```sh
npx devjar dev --host 0.0.0.0
```

Open the printed Network URL on the same Wi-Fi. Also works with `start`.
Embedded editors need a secure, cross-origin-isolated context; use ordinary
CLI pages for HTTP phone previews.

</details>

<details>
<summary>Repository development</summary>

```sh
pnpm install
pnpm run build
pnpm run dev
pnpm run typecheck
bun test
```

Run the full build after runtime changes to regenerate client and worker assets.
CLI tests open local HTTP servers.

</details>

## License

MIT
