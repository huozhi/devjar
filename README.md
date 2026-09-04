<p align="center">
  <img src="./site/public/icon.svg" alt="devjar logo" width="112" height="112">
</p>

# devjar
> turn a folder of React pages into a prototype

Devjar turns a folder of React pages into a self-contained static site. It also
includes an optional in-browser code playground.

```sh
npx devjar dev
npx devjar build
npx devjar start
```

## Demo

<video src="https://github.com/user-attachments/assets/e4d11123-2e78-4e0d-a78d-4b5d2fff9c1e" controls width="100%">
  <a href="https://github.com/user-attachments/assets/e4d11123-2e78-4e0d-a78d-4b5d2fff9c1e">Watch the devjar demo</a>
</video>

## Introduction

Use the CLI to build and host React prototypes without configuring a bundler.
Devjar also exports a React component and hook for embedding editable code
examples that run inside an isolated iframe.

**Notice:** devjar requires React 19. The iframe runtime and development server
render in the browser; CLI production builds statically render each page.
Projects use the same `pages/` convention in the iframe runtime and CLI.

## Install

```sh
pnpm add devjar
```

## React Code Runtime

### `<DevJar>`

`DevJar` is a react component that allows you to develop and test your code directly in the browser, using a CDN to load your dependencies.

**Props**

* `files`: Project files using the same `pages/` convention as the CLI.
* `dependencies`: Optional package name/version map. Packages load from esm.sh.
* `resolveModule`: Optional override that maps module specifiers to browser-loadable module URLs.
* `onError`: Callback function of error event from the iframe sandbox. By default `console.log`.
* `transformWorkerUrl`: Optional custom URL for the packaged transform worker.

`pages/index.*` maps to `/`, nested page files map to nested routes, and
relative page links navigate without leaving the iframe. Unmatched links render
a built-in 404 page unless the project provides `pages/404.*`.

**Example**

```jsx
import { DevJar } from 'devjar'

const CDN_HOST = 'https://esm.sh'

const files = {
  'pages/index.jsx': `export default function Page() { return 'hello world' }`
}

function App() {
  return (
    <DevJar
      files={files}
      resolveModule={(specifier) => {
        return `${CDN_HOST}/${specifier}`
      }}
    />
  )
}
```

### `useLiveCode(options)`

A hook that provides lower-level control over the live code execution environment.

**Parameters**

* `options`
  * `resolveModule(specifier)`: A function that receives a module specifier and returns the browser-loadable URL. For example, import React from 'react' will load React from skypack.dev/react.
  * `transformWorkerUrl`: Optional custom URL for the packaged transform worker.

**Returns**

* `state`
  * `ref`: A reference to the iframe element where the live coding will be executed.
  * `error`: An error message in case the live coding encounters an issue.
  * `load(codeFiles)`: void: Loads code files and executes them as live code.

**Example**

```jsx
import { useLiveCode } from 'devjar'

function Playground() {
  const { ref, error, load } = useLiveCode({
    // The CDN url of each imported module path in your code
    // e.g. `import React from 'react'` will load react from skypack.dev/react
    resolveModule(specifier) {
      return `https://cdn.skypack.dev/${specifier}`
    }
  })

  // logging failures
  if (error) {
    console.error(error)
  }

  // load code files and execute them as live code
  function run() {
    load({
      'pages/index.jsx': `import Message from '../components/message'
export default function Page() { return <Message /> }`,
      'components/message.jsx': `export default function Message() {
  return 'hello world'
}`,
    })
  }

  // Attach the ref to an iframe element for runtime of code execution
  return (
    <div>
      <button onClick={run}>run</button>
      <iframe ref={ref} />
    </div>
  )
}
```

## CLI

Devjar includes a zero-config CLI for turning a folder of React pages into a
prototype. All settings are passed as command-line flags; the CLI does not load
a configuration file or a `devjar` field from `package.json`. It reads only
`dependencies` and `devDependencies` to resolve CDN versions or local packages.
The CLI requires Node.js 22 or newer.

The project does not need a bundler configuration or a local `node_modules`
directory:

```text
my-prototype/
├── package.json
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

Running `devjar` without a command is an alias for `devjar dev`. The development
server watches the project and updates the browser as files change.

The pages directory maps directly to URLs:

| File | URL |
| --- | --- |
| `pages/index.jsx` | `/` |
| `pages/about.jsx` | `/about` |
| `pages/docs/index.jsx` | `/docs` |
| `pages/docs/start.jsx` | `/docs/start` |
| `pages/404.jsx` | unmatched routes |

Pages can import local JavaScript, TypeScript, JSX, TSX, and CSS files. Image,
font, audio, video, and PDF imports export their public URL, and relative
`url(...)` references in CSS use the same asset pipeline:

```jsx
import logo from '../assets/logo.svg'
import '../styles.css'

export default function Page() {
  return <img src={logo} alt="Logo" />
}
```

Production builds copy imported assets to `_jar/assets/` with content-hashed
filenames so they can be cached as immutable files. Production builds also
vendor bare imports and their transitive assets under `_jar/vendor/`; deployed
sites do not depend on the module CDN. Dependency versions come from
`dependencies` or `devDependencies`:

```json
{
  "dependencies": {
    "react": "19.2.0",
    "react-dom": "19.2.0",
    "lucide-react": "0.542.0"
  }
}
```

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

Files below `public/` are served from `/`. JSON and text files below `api/`
are available at their corresponding `/api/` URLs. Executable API routes are
not supported.

For CLI projects, add `tailwindcss` or `@tailwindcss/browser` to the dependency
list to enable Tailwind. Development uses Tailwind's browser compiler for live
updates. Production builds use the matching Tailwind compiler to collect static
class candidates from project source and prerendered pages, then emit a hashed
stylesheet under `_jar/assets/`. The deployed site does not load or compile
Tailwind at runtime.

Use complete class names for conditional styles instead of constructing them
dynamically so the production build can detect every candidate.

Non-local bare imports use esm.sh in development and as the source for vendored
production modules. Select a different ESM-compatible CDN with the `--cdn`
flag:

```sh
devjar dev --cdn https://modules.example.com
devjar build --cdn https://modules.example.com
```

The CLI applies dependency versions to CDN URLs using the
`package@version/subpath` convention. During `devjar build`, the selected CDN must
be available while dependencies are collected, but it is not contacted by the
deployed site. Modules and their referenced assets are stored below a
content-hashed directory and can be cached as immutable files.

Use `--base <path>` when the site will be hosted below the domain root. The
same base is embedded in the build, so `devjar start` reads it automatically:

```sh
devjar dev --base /preview/
devjar build --base /preview/
```

Pages, public files, API files, and Devjar runtime assets are then served below
`/preview/`. Base paths are normalized with one leading and trailing slash.

### Build and host

Create a static build, then serve it without source-file watching or on-request
transforms:

```sh
devjar build
devjar start
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

The repository includes three runnable examples:

```sh
devjar dev examples/basic
devjar dev examples/dashboard
devjar dev examples/swr
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
devjar dev [root] --host localhost --port 3000
```

## Notice: iframe cross-origin isolation

The iframe transforms code in the browser using Oxc and shared WebAssembly
memory, so its host page must be cross-origin isolated. Devjar packages the
browser transformer, WASM binary, and helper worker as lazy runtime assets;
compatible bundlers emit these files without requiring a manual copy step.
The `devjar dev` server sends the required headers so an editor can be added while
it is running. `devjar start` sends them only for builds that use the editor.
Static deployments that use `devjar` must configure equivalent headers on
their hosting platform; sites without the editor do not need them.

<details>
<summary>Next.js headers example</summary>

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

## License

MIT
