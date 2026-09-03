# Devjar API

Devjar runs editable React code in a browser iframe. Projects use the same
file-based `pages/` convention as the Devjar CLI.

Devjar requires React 19.

## Install

```sh
pnpm add devjar
```

## React Runtime

### `<DevJar />`

```jsx
import { DevJar } from 'devjar'

const files = {
  'pages/index.jsx': `export default function Page() {
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

- `files: Record<string, string>`: project files available to the runtime. `pages/index.*` is the root page.
- `dependencies?: Record<string, string>`: package versions loaded from esm.sh when no custom resolver is supplied.
- `resolveModule?: (specifier: string) => string`: overrides the default CDN resolver for bare imports.
- `onError?: (...data: any[]) => void`: receives runtime or transform errors.

Page files, shared modules, and CSS use project-relative paths:

```js
const files = {
  'pages/index.jsx': `import '../styles.css'
import { Button } from '../components/button'
export default function Page() {
  return <Button>Save</Button>
}`,
  'components/button.jsx': `export function Button({ children }) {
  return <button className="button">{children}</button>
}`,
  'styles.css': `.button { font: inherit; }`,
}
```

`pages/index.*` maps to `/`, nested page files map to nested routes, and
relative page links navigate without leaving the iframe. Unmatched links render
a built-in 404 page unless the project provides `pages/404.*`.

### `useLiveCode(options)`

Lower-level hook used by `<DevJar />`.

```jsx
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
