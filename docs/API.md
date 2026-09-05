# Devjar API

Embed a live React preview with `<DevJar>`. Requires React 19.

```sh
pnpm add devjar
```

## DevJar component

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
Devjar compiles the files and renders the project inside an iframe.

Use a client component in frameworks with server components. See
[hosting embedded previews](#hosting-embedded-previews) for deployment requirements.

### Example: update JSON content with React state

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


### Component props and defaults

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
| `apiRef` | `React.Ref<DevJarHandle>` | Access `reset()` to restart the current project |
| `ref` | `React.Ref<HTMLIFrameElement>` | Access the rendered iframe |
| Other iframe props | Iframe attributes | Forwarded to the iframe, including `title`, `style`, and `className` |

DevJar owns the iframe document, so `src`, `srcDoc`, `children`, and
`dangerouslySetInnerHTML` are not component props. `onError` reports preview
errors; it is not the native iframe error event.

Keep `files` and custom resolver functions stable between unrelated parent
renders. To edit a file, replace its string in a new `files` object.

The component reloads the current files when compilation options change. Changing
`transform` or compiler asset URLs invalidates compiled-source caches. Changing
`dependencies`, `resolveModule`, or `tailwind` starts a fresh iframe runtime;
React state and iframe globals are reset. Equal dependency versions and compiler
URLs do not trigger a reload just because their options objects are recreated.

With `useDevJar`, call `load` again to apply changed options. For automatic
updates, include both `files` and `load` in your effect dependencies.


### Virtual files, JSON imports, and iframe navigation

The runtime supports JavaScript, TypeScript, JSX, TSX, CSS, and default JSON
imports. JSON must use double quotes and cannot contain comments or trailing
commas. Import any local file as a string with an explicit text attribute:

```js
import text from './notes.md' with { type: 'text' }
```

Use relative imports between virtual files. Bare package imports resolve to CDN
modules; React dependencies must use compatible versions. Text imports also work
in the [CLI](../README.md#cli).

The iframe uses the same `pages/` route convention as the CLI. Links such as
`<a href="/about">About</a>` navigate inside the iframe. Provide `pages/404.tsx`
for a custom missing-page view. Changes propagate through local imports and use
React Fast Refresh where possible.

The virtual file map contains source strings. The CLI's disk asset pipeline,
`public/`, and static `api/` serving are separate CLI features. For iframe image
or media content, use browser-accessible URLs.

The iframe separates the preview's DOM and styles from the host page. It runs
in the host's origin; it is not a security boundary for untrusted code.


## Resetting the runtime

Use `apiRef.current.reset()` on the component, or `reset()` from `useDevJar`,
to restart the current project without restoring the editor's initial source:

```tsx
import { useRef } from 'react'
import { DevJar, type DevJarHandle } from 'devjar'

function Playground({ files }: { files: Record<string, string> }) {
  const api = useRef<DevJarHandle>(null)
  return <>
    <button onClick={() => void api.current?.reset()}>Restart preview</button>
    <DevJar files={files} apiRef={api} title="Live preview" />
  </>
}
```

Reset unmounts React (running effect cleanups), replaces the iframe document with
an empty `srcdoc` document, and reruns the latest files in a fresh JavaScript realm.
React state, module instances, iframe globals, timers, and subscriptions belonging
to that document start over; navigation returns to `/`. The iframe element and its
`ref` stay the same. Browser HTTP caches, origin storage, and side effects outside
the iframe are not cleared. Code must still clean up resources it creates outside
the frame.

Pending edits are discarded and old work cannot publish its result into the new
preview. Edits submitted during reset become the current source. Concurrent reset
calls share one promise. Awaiting reset waits for the reload, with failures exposed
through `error`/`onError` and `status`. To restore initial source as well, update the
editor's `files` separately. `apiRef` leaves the existing iframe `ref` API intact.

## Scheduling edits

Pass a new `files` object for each edit, keeping the object stable for unrelated
renders. Devjar starts updates immediately; it does not impose a typing debounce.
Use a host-side debounce if you want fewer updates, or call the hook's `load(files)`
from a Run button for explicit scheduling.

Each preview runs one load at a time and retains only the newest pending edit.
Superseded pending loads are skipped, and their `load()` promises resolve without
rendering. Work already executing (including synchronous WASM compilation and
browser module imports) is allowed to finish; stale results and compilation errors
are discarded at the load's asynchronous checkpoints. This does not roll back
module side effects or a React commit that already happened.

Incomplete source reports an error while leaving the last successful preview
visible. The next valid edit clears the error and uses Fast Refresh where possible.
`load()` resolves after completion or supersession; load failures are reported via
`error`/`onError` and `status`, rather than rejecting that promise. Supersession is
not an error. Unmounting discards pending edits and releases the compiler client.

## Preview lifecycle

Use `onStatusChange` on `<DevJar>` or `status` from `useDevJar` for a loading
indicator. `idle` means no load has started, `compiling` covers source compilation
and linking, and `loading` covers iframe initialization and module loading.
`ready` means React committed the preview; it does not wait for application data,
images, or every asynchronous effect. `failed` accompanies an error. React can
batch rapid transitions, so callbacks are state notifications, not a phase log.

`onError` also receives React render errors, uncaught iframe errors, and unhandled
promise rejections. A new load clears the previous error (`undefined`); syntax
errors leave the previous preview visible. Handle both status and error to explain
a loading or failed preview. The iframe's native `onLoad` is not preview readiness.

## useDevJar

Prefer `<DevJar>` for managed previews. Use `useDevJar` when you need to own the
iframe markup and control when files load.

### Hook example and return values

The returned `ref` is a callback, not an object with `.current`. Attaching or
replacing the iframe initializes a fresh runtime; removing it disposes the runtime.
For automatic loading, use an effect with `[files, load]` dependencies so it also
runs when the iframe appears or is replaced. Calls to `load` while no iframe is
attached do nothing.

The hook accepts the same `dependencies`, `resolveModule`, `transform`, `tailwind`,
`compiler`, and `transformWorkerUrl` options as the component.

```tsx
'use client'

import { useDevJar } from 'devjar'

const files = {
  'pages/index.tsx': `export default function Page() {
  return <h1>Hello from an iframe</h1>
}`,
}

export default function ManualPreview() {
  const { ref, error, load } = useDevJar({ tailwind: false })

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
| `ref` | Callback ref; attach to the iframe that will run the project |
| `error` | Current compilation, loading, or runtime error, if any |
| `status` | `idle`, `compiling`, `loading`, `ready`, or `failed` |
| `reset()` | Recreate the iframe runtime and rerun the current files; returns `Promise<void>` |
| `load(files)` | Load or update the virtual project; returns `Promise<void>` |


## Hosting embedded previews

DevJar compiles JSX and TypeScript in a browser worker. No cross-origin
isolation headers or server-side compiler are needed.

### Compiler assets and deployment

Devjar packages the browser worker, JavaScript binding, and WASM binary as
lazy runtime assets with static URL references for host bundlers. Next.js
and Devjar's CLI emit these files automatically; no copy script is needed.
The compiler uses ordinary, non-shared WebAssembly memory, so embedding a
preview does not require COOP or COEP headers.

Content Security Policy is separate: the preview inherits the host's policy.
Policies that block JavaScript eval are not supported yet because the current
`es-module-lexer` dependency uses eval to decode import names.


### Next.js and custom compiler hosting

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
must permit cross-origin requests. `useDevJar` accepts the same option.
