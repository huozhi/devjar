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

```tsx
import { DevJar } from 'devjar'

const files = {
  'pages/index.tsx': `export default function Page() {
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

```ts
const files = {
  'pages/index.tsx': `import '../styles.css'
import { Button } from '../components/button'
export default function Page() {
  return <Button>Save</Button>
}`,
  'components/button.tsx': `export function Button({ children }) {
  return <button className="button">{children}</button>
}`,
  'styles.css': `.button { font: inherit; }`,
}
```

`pages/index.*` maps to `/`, nested page files map to nested routes, and
`pages/404.*` handles unmatched links inside the iframe. Relative page links
navigate without leaving the iframe.

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
