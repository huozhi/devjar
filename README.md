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
| `onStatusChange` | `(status: PreviewStatus) => void` | Reports lifecycle state changes |
| `onError` | `(error: unknown) => void` | Called when error state changes; defaults to `console.error` in the browser |
| `compiler` | `CompilerAssets` | Complete worker, binding, and WASM URL override; bypasses default asset discovery |
| `transformWorkerUrl` | `string` or `URL` | Legacy worker-only override; uses default binding and WASM assets |
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

### Preview lifecycle

Use `onStatusChange` on `<DevJar>` or `status` from `useLiveCode` for a loading
indicator. `idle` means no load has started, `compiling` covers source compilation
and linking, and `loading` covers iframe initialization and module loading.
`ready` means React committed the preview; it does not wait for application data,
images, or every asynchronous effect. `failed` accompanies an error. React can
batch rapid transitions, so callbacks are state notifications, not a phase log.

`onError` also receives React render errors, uncaught iframe errors, and unhandled
promise rejections. A new load clears the previous error (`undefined`); syntax
errors leave the previous preview visible. Handle both status and error to explain
a loading or failed preview. The iframe's native `onLoad` is not preview readiness.

### useLiveCode hook

Use `useLiveCode` when you want to own the iframe and decide when a project runs.

<details>
<summary>Hook example and return values</summary>

Use `useLiveCode` when you want to own the iframe and decide when to load files.
It accepts the same `dependencies`, `resolveModule`, `transform`, `tailwind`,
`compiler`, and `transformWorkerUrl` options as the component.

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
| `error` | Current compilation, loading, or runtime error, if any |
| `status` | `idle`, `compiling`, `loading`, `ready`, or `failed` |
| `load(files)` | Load or update the virtual project; returns `Promise<void>` |

</details>

### Hosting embedded previews

DevJar compiles JSX and TypeScript in a browser worker. No cross-origin
isolation headers or server-side compiler are needed.

<details>
<summary>Compiler assets and deployment</summary>

Devjar packages the browser worker, JavaScript binding, and WASM binary as
lazy runtime assets with static URL references for host bundlers. Next.js
and Devjar's CLI emit these files automatically; no copy script is needed.
The compiler uses ordinary, non-shared WebAssembly memory, so embedding a
preview does not require COOP or COEP headers.

Content Security Policy is separate: the preview inherits the host's policy.
Policies that block JavaScript eval are not supported yet because the current
`es-module-lexer` dependency uses eval to decode import names.

</details>

<details>
<summary>Next.js and custom compiler hosting</summary>

Import `DevJar` from a Client Component (`'use client'`). No `next/dynamic`,
package patches, resolver override, or isolation headers are needed.

For custom asset hosting, supply all three URLs:

```tsx
const compiler = {
  workerUrl: '/compiler/worker.js',
  bindingUrl: '/compiler/binding.js',
  wasmUrl: '/compiler/compiler.wasm',
}

<DevJar files={files} compiler={compiler} tailwind={false} />
```

Use matching worker, binding, and WASM files from the same Devjar build.
This override bypasses default discovery entirely. It takes precedence over
`transformWorkerUrl`, which remains available for worker-only overrides.
Keep the worker on the host's origin; remotely hosted binding/WASM assets
must permit cross-origin requests. `useLiveCode` accepts the same option.

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
Embedded previews also work over HTTP on your local network.

</details>

<details>
<summary>Repository development</summary>

```sh
pnpm install
pnpm run setup:compiler
pnpm run build
pnpm run dev
pnpm run typecheck
bun test
```

Source builds require Rust and wasm-bindgen; `setup:compiler` installs the pinned
toolchain and binding generator. Published npm packages include the compiled
WASM and do not require Rust.

Run the full build after runtime changes to regenerate client and worker assets.
CLI tests open local HTTP servers.

To release, open **Actions → Release → Run workflow** on `main`. Choose
**patch / minor / major** and **next / stable**. From `0.11.0`, major + next
produces `1.0.0-next.1`. During a prerelease cycle, next increments its suffix
and stable promotes the existing target to `1.0.0`; the bump choice is ignored. Actions commits the version as
`github-actions[bot]`, pushes its tag, and starts the **Publish** workflow.
Publish runs the checks, publishes prereleases to `next` (stable versions to
`latest`), and groups core Conventional Commits into Features and Fixes.
Website/example polish and maintenance commits are omitted. Stable notes
compare against the previous published stable release; prereleases compare
against the nearest published ancestor. Follow the Publish run for the
final result. The version commit and tag remain available if publishing fails.

To retry, run **Release** on `main` with **force** enabled. It ignores bump and
channel and uses the current `package.json` version. Publish reuses its tag
without moving it, or creates the tag if missing. It skips unit/browser tests
but still builds, typechecks, and checks the package. An existing npm version
is left untouched; GitHub release notes are created only if the release is missing.

</details>

## License

MIT
