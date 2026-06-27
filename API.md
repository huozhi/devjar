# Devjar API

Devjar runs editable React code in a browser iframe. The runtime renders the default export from `index.js`.

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
      getModuleUrl={(name) => `https://esm.sh/${name}`}
    />
  )
}
```

Props:

- `files: Record<string, string>`: files available to the runtime. `index.js` is the entry file.
- `getModuleUrl?: (name: string) => string`: maps bare imports such as `react` or `lucide-react` to browser-loadable module URLs.
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
    getModuleUrl: (name) => `https://esm.sh/${name}`,
  })

  useEffect(() => {
    load(files)
  }, [files, load])

  return <iframe ref={ref} />
}
```

Options:

- `getModuleUrl?: (name: string) => string`: maps bare imports to browser-loadable module URLs.

Returns:

- `ref`: iframe ref for the runtime.
- `error`: latest runtime error.
- `load(files)`: loads and executes a file map.

## GL Runtime

### `useGL(options)`

```tsx
import { useGL } from 'devjar/gl'
import { useRef } from 'react'

export function Shader() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useGL({
    canvasRef,
    fragment: `
      precision mediump float;
      uniform vec2 u_resolution;
      uniform float u_time;

      void main() {
        vec2 st = gl_FragCoord.xy / u_resolution.xy;
        gl_FragColor = vec4(st.x, st.y, abs(sin(u_time)), 1.0);
      }
    `,
  })

  return <canvas ref={canvasRef} />
}
```

Options:

- `fragment: string`: fragment shader source.
- `canvasRef: React.RefObject<HTMLCanvasElement>`: target canvas.
- `onError?: (error: string | null) => void`: receives shader/runtime errors.

Built-in uniforms:

- `u_time: float`: elapsed time in seconds.
- `u_resolution: vec2`: canvas width and height.
- `u_mouse: vec2`: normalized mouse position.
