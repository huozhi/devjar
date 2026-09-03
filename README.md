<p align="center">
  <img src="./site/app/icon.svg" alt="devjar logo" width="112" height="112">
</p>

# devjar
> turn a folder of React pages into a prototype

## Demo

<video src="https://github.com/user-attachments/assets/e4d11123-2e78-4e0d-a78d-4b5d2fff9c1e" controls width="100%">
  <a href="https://github.com/user-attachments/assets/e4d11123-2e78-4e0d-a78d-4b5d2fff9c1e">Watch the devjar demo</a>
</video>

## Introduction

devjar is a library that enables you to live test and share your code snippets and examples with others. devjar will generate a live code editor where you can run your code snippets and view the results in real-time based on the provided code content of your React app.

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
`dependencies` and `devDependencies` to resolve package versions from a CDN.

The project does not need a bundler configuration or a local `node_modules`
directory:

```text
my-prototype/
├── package.json
├── pages/
│   ├── index.tsx
│   └── about.tsx
├── components/
│   └── card.tsx
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
| `pages/index.tsx` | `/` |
| `pages/about.tsx` | `/about` |
| `pages/docs/index.tsx` | `/docs` |
| `pages/docs/start.tsx` | `/docs/start` |
| `pages/404.tsx` | unmatched routes |

Pages can import local JavaScript, TypeScript, JSX, TSX, and CSS files. Bare
imports are loaded from esm.sh using versions in `dependencies` or
`devDependencies`:

```json
{
  "dependencies": {
    "react": "19.2.0",
    "react-dom": "19.2.0",
    "lucide-react": "0.542.0"
  }
}
```

Files below `public/` are served from `/`. JSON and text files below `api/`
are available at their corresponding `/api/` URLs. Executable API routes are
not supported.

For CLI projects, add `tailwindcss` or `@tailwindcss/browser` to the dependency
list to enable Tailwind. Bare imports use esm.sh by default. Select a different
ESM-compatible CDN with the `--cdn` flag:

```sh
devjar dev --cdn https://modules.example.com
devjar build --cdn https://modules.example.com
```

The CLI applies dependency versions to CDN URLs using the
`package@version/subpath` convention.

### Build and host

Create a static build, then serve it without source-file watching or on-request
transforms:

```sh
devjar build
devjar start dist
```

The build writes the initial React content and imported CSS into an HTML file for
each route, then hydrates that content in the browser. Opening or hosting the
HTML therefore shows page content before client JavaScript runs. Package imports
are loaded from the selected CDN during static rendering and in the browser, so
the project does not need a local `node_modules` directory.

Files from `public/` are copied to the root of the output directory. For example,
`public/logo.svg` becomes `dist/logo.svg` and remains available at `/logo.svg`.
Imports from `devjar` use the runtime and worker assets included in the build
instead of loading another copy of Devjar from the package CDN.

Static rendering executes every page once during the build. Browser APIs can be
used in effects and event handlers, but using `window` or `document` directly
during render will fail the build with the affected route.

Use `--out-dir <directory>` to change the build location. The output directory
must remain inside the project root.

The repository includes two runnable examples:

```sh
devjar dev examples/basic
devjar dev examples/dashboard
```

The dashboard demonstrates page navigation, shared components, a CDN-loaded
icon package, Tailwind, static API data, and a public SVG asset.

```sh
devjar dev [root] --host localhost --port 3000
```

## Notice: iframe cross-origin isolation

This notice applies to the `<DevJar>` iframe runtime, not the Devjar CLI.

The iframe transforms code in the browser using Oxc and shared WebAssembly
memory, so its host page must be cross-origin isolated. Devjar packages the
browser transformer, WASM binary, and helper worker as lazy runtime assets;
compatible bundlers emit these files without requiring a manual copy step.

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
