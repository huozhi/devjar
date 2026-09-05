# Migrate to Devjar

Use Devjar for browser React examples with editable source and an iframe preview.
The host app requires React 19. Keep your editor and layout, or use
[@sugar-high/react](https://sugar-high.vercel.app/react) for the editor.

Start with one representative example. Check its imports, styles, providers, and
interactions before migrating the remaining examples.

## From Sandpack

For a React template, keep the application modules and add a page entry. For
example, replace this preview setup:

```tsx
<Sandpack template="react" files={{ '/App.js': appSource }} />
```

with:

```tsx
import { DevJar } from 'devjar'

const files = {
  'App.js': appSource,
  'pages/index.tsx': `export { default } from '../App.js'`,
}

<DevJar files={files} tailwind={false} title="Live preview" />
```

Here `appSource` is your existing module with a default-exported React component.
Keep the file map stable between edits. This replaces the preview; add an editor
using the example below to replace Sandpack's complete playground.

| Sandpack setup | Devjar migration |
| --- | --- |
| String files or `{ code, hidden, readOnly, active }` | Pass source strings in `files`; keep editor metadata in your UI |
| Template-provided files | Include every module and stylesheet your example imports |
| `/index.js` mounting with `createRoot` | Devjar mounts `pages/index.tsx`; move providers and CSS imports from the old entry into that page |
| `customSetup.dependencies` | Pass package versions through `dependencies`; browser packages resolve through esm.sh by default |
| Active file, tabs, theme | Configure your editor separately |

Use consistent paths without a leading slash, preserving relative imports.
An embedded `package.json` does not configure Devjar: explicitly move needed
dependency versions to the prop. Keep React and React DOM versions compatible.
Review custom HTML, external scripts, static assets, and bundler plugins separately;
copying their configuration files does not reproduce their behavior.

Devjar executes browser modules. A migration requiring Node.js, a development
server, or another framework needs a different runtime. Check package compatibility
before removing Sandpack. See the [Sandpack configuration reference](https://sandpack.codesandbox.io/docs/getting-started/usage)
to inventory your existing setup.

## From React Live

Convert snippets into default-exported component modules:

```diff
- <button>Hello</button>
+ export default function Example() {
+   return <button>Hello</button>
+ }
```

For a component expression, give the component a name and export it. For
`noInline` examples using `render(<Example />)`, export a page that returns that
element and remove the `render` call. Preserve wrappers and any asynchronous
behavior explicitly; these snippet forms need different edits.

| React Live API | Devjar migration |
| --- | --- |
| `LiveProvider code` | Own source state and pass it as `files['pages/index.tsx']` |
| `LiveEditor` | Your editor or `Editor` from `@sugar-high/react` |
| `LivePreview` | `DevJar` |
| `LiveError` | Render the value received by `onError`; clear it when the callback receives `undefined` |
| `scope={{ Button }}` | Import `Button` from a virtual source file or a browser-loadable package |
| `transformCode` | Apply your transformation before updating the file map; Devjar's `transform` prop is a boolean compiler switch |

React Live's [provider API](https://github.com/FormidableLabs/react-live/blob/master/packages/react-live/src/components/Live/LiveProvider.tsx)
accepts actual values through `scope`. Devjar has no equivalent prop. Host component
functions and closures are not virtual files; supply their source or a module URL.
If your integration depends on sharing host callbacks or context, resolve that
dependency before replacing React Live.

The preview has its own React root and document. Import CSS and mount theme,
router, or other providers inside the preview. Host styles and React context do
not carry over. Set an iframe height appropriate for your example.

## Add a live editor

Install `devjar` and `@sugar-high/react` in your React 19 app. While using a Devjar
prerelease, install `devjar@next`.

```tsx
'use client'

import { useState } from 'react'
import { Editor } from '@sugar-high/react'
import { DevJar } from 'devjar'

const initialFiles = {
  'pages/index.tsx': `export default function Example() {
  return <button>Hello</button>
}`,
}

export default function Playground() {
  const [files, setFiles] = useState(initialFiles)
  const [error, setError] = useState<unknown>(undefined)

  return <>
    <Editor
      lang="typescript"
      value={files['pages/index.tsx']}
      onChange={(code) => setFiles(current => ({
        ...current,
        'pages/index.tsx': code,
      }))}
    />
    <DevJar
      files={files}
      tailwind={false}
      onError={(error) => setError(error)}
      title="Live preview"
      style={{ width: '100%', height: 240, border: 0 }}
    />
    {error != null && <pre role="alert">{String(error)}</pre>}
  </>
}
```

Use `onStatusChange` for loading UI and `apiRef.current.reset()` to restart the
runtime. Restoring the original editor source is a separate state update. See
the [API reference](./API.md) for scheduling, reset behavior, and deployment.

## Instructions for coding agents

1. Inventory the existing playground's files, dependencies, editor controls,
   providers, styles, and any `scope` or template assumptions.
2. Migrate one example using `DevJar` and explicit imports. Preserve its behavior
   and controls. Report unsupported dependencies rather than silently dropping them.
3. Verify initial rendering, editing, syntax-error recovery, and the example's
   interactions in a real browser. Verify reset if the integration exposes it.
4. Check a production build with deployed compiler assets. The iframe runs in
   the host origin; it is not a security boundary for untrusted code. See
   [hosting requirements](./API.md#hosting-embedded-previews).
5. Migrate the remaining examples, then remove old dependencies only when no
   imports or features still need them. Do not add compatibility props to Devjar.
