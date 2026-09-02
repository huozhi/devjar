# Devjar API

Devjar runs editable React code in a browser iframe. The runtime renders the default export from `index.js`.

Devjar requires React 19.

## Install

```sh
pnpm add devjar
```

## React Runtime

### `<DevJar />`

```tsx
import { DevJar } from 'devjar'

const files = {
  'index.js': `export default function App() {
    return <h1>Hello world</h1>
  }`,
}

export function Preview() {
  return (
    <DevJar
      files={files}
      resolveModule={(specifier) => `https://esm.sh/${specifier}`}
    />
  )
}
```

Props:

- `files: Record<string, string>`: files available to the runtime. `index.js` is the entry file.
- `dependencies?: Record<string, string>`: package versions loaded from esm.sh when no custom resolver is supplied.
- `resolveModule?: (specifier: string) => string`: overrides the default CDN resolver for bare imports.
- `onError?: (...data: any[]) => void`: receives runtime or transform errors.

File keys can include relative modules and CSS:

```ts
const files = {
  'index.js': `import './styles.css'
export default function App() {
  return <button className="button">Save</button>
}`,
  './styles.css': `.button { font: inherit; }`,
}
```

### `useLiveCode(options)`

Lower-level hook used by `<DevJar />`.

```tsx
import { useLiveCode } from 'devjar'
import { useEffect } from 'react'

export function Preview({ files }) {
  const { ref, error, load } = useLiveCode({
    resolveModule: (specifier) => `https://esm.sh/${specifier}`,
  })

  useEffect(() => {
    load(files)
  }, [files, load])

  return <iframe ref={ref} />
}
```

Options:

- `dependencies?: Record<string, string>`: package versions loaded from esm.sh.
- `resolveModule?: (specifier: string) => string`: overrides the default CDN resolver.

Returns:

- `ref`: iframe ref for the runtime.
- `error`: latest runtime error.
- `load(files)`: loads and executes a file map.
