# devjar
> react live preview in browser

![image](https://repository-images.githubusercontent.com/483779830/318964f4-18ae-4dd4-9940-0fe51ccc5abc)

## Introduction

devjar is a library that enables you to live test and share your code snippets and examples with others. devjar will generate a live code editor where you can run your code snippets and view the results in real-time based on the provided code content of your React app.

**Notice:** devjar requires React 19 and only works for browser runtime at the moment. It will always render the default export component in `index.js` as the app entry.

## Install

```sh
pnpm add devjar
```

## React Code Runtime

### `<DevJar>`

`DevJar` is a react component that allows you to develop and test your code directly in the browser, using a CDN to load your dependencies.

**Props**

* `files`: An object that specifies the files you want to include in your development environment.
* `resolveModule`: A function that maps module specifiers to browser-loadable module URLs.
* `onError`: Callback function of error event from the iframe sandbox. By default `console.log`.
* `tailwindSrc`: Optional Tailwind browser script URL. Pass `false` to disable Tailwind injection.

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
  * `tailwindSrc`: Optional Tailwind browser script URL. Pass `false` to disable Tailwind injection.

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

## License

MIT
