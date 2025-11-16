# devjar
> live code runtime for your react project in browser

![image](https://repository-images.githubusercontent.com/483779830/55bf67ee-fcc6-4a12-ad0c-5221a5f78c26)

## Introduction

devjar is a library that enables you to live test and share your code snippets and examples with others. devjar will generate a live code editor where you can run your code snippets and view the results in real-time based on the provided code content of your React app.

**Notice:** devjar only works for browser runtime at the moment. It will always render the default export component in `index.js` as the app entry.

## Install

```sh
pnpm add devjar
```

## React Code Runtime

### `<DevJar>`

`DevJar` is a react component that allows you to develop and test your code directly in the browser, using a CDN to load your dependencies.

**Props**

* `files`: An object that specifies the files you want to include in your development environment.
* `getModuleUrl`: A function that maps module names to CDN URLs.
* `onError`: Callback function of error event from the iframe sandbox. By default `console.log`.

**Example**

```jsx
import { DevJar } from 'devjar'

const CDN_HOST = 'https://esm.sh'

const files = {
  'index.js': `export default function App() { return 'hello world' }`
}

function App() {
  return (
    <DevJar
      files={files}
      getModuleUrl={(m) => {
        return `${CDN_HOST}/${m}`
      }}
    />
  )
}
```

### `useLiveCode(options)`

A hook that provides lower-level control over the live code execution environment.

**Parameters**

* `options`
  * `getModulePath(module)`: A function that receives the module name and returns the CDN url of each imported module path. For example, import React from 'react' will load React from skypack.dev/react.

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
    getModulePath(modPath) {
      return `https://cdn.skypack.dev/${modPath}`
    }
  })

  // logging failures
  if (error) {
    console.error(error)
  }

  // load code files and execute them as live code
  function run() {
    load({
      // `index.js` is the entry of every project
      'index.js': `export default function App() { return 'hello world' }`,

      // other relative modules can be used in the live coding
      './mod': `export default function Mod() { return 'mod' }`,
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

## GLSL Shader Runtime

### `useGlslRenderer(options)`

A hook that renders GLSL fragment shaders using WebGL. Perfect for creating interactive shader playgrounds and visualizations.

**Parameters**

* `options`
  * `fragmentShader`: The GLSL fragment shader source code as a string.
  * `canvasRef`: A React ref to an HTML canvas element where the shader will be rendered.
  * `onError`: Optional callback function that receives error messages (prefixed with `devjar:gl`).

**Available Uniforms**

The hook automatically provides these uniforms to your fragment shader:

* `u_time`: `float` - Elapsed time in seconds since the renderer started
* `u_resolution`: `vec2` - Canvas dimensions (width, height)
* `u_mouse`: `vec2` - Normalized mouse position (0.0 to 1.0)

**Example**

```jsx
import { useGlslRenderer } from 'devjar'
import { useRef, useState } from 'react'

function ShaderPlayground() {
  const canvasRef = useRef(null)
  const [shaderCode, setShaderCode] = useState(`
    precision mediump float;
    
    uniform vec2 u_resolution;
    uniform float u_time;
    uniform vec2 u_mouse;
    
    void main() {
      vec2 st = gl_FragCoord.xy / u_resolution.xy;
      vec3 color = vec3(st.x, st.y, abs(sin(u_time)));
      gl_FragColor = vec4(color, 1.0);
    }
  `)
  const [error, setError] = useState(null)

  useGlslRenderer({
    fragmentShader: shaderCode,
    canvasRef,
    onError: setError
  })

  return (
    <div>
      <textarea
        value={shaderCode}
        onChange={(e) => setShaderCode(e.target.value)}
        style={{ width: '100%', height: '200px' }}
      />
      <canvas ref={canvasRef} style={{ width: '100%', height: '300px' }} />
      {error && <pre style={{ color: 'red' }}>{error}</pre>}
    </div>
  )
}
```

**Error Handling**

All errors are prefixed with `devjar:gl` for easy identification:
- `devjar:gl Shader compilation error: ...`
- `devjar:gl Program linking error: ...`
- `devjar:gl WebGL is not supported in your browser`

## License

The MIT License (MIT).
