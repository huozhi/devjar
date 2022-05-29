# devjar
> bundless runtime for your ESM JavaScript project in browser


![image](https://repository-images.githubusercontent.com/483779830/28347c03-774a-4766-b113-54041fad1e72)

### Install

```sh
yarn add devjar
```

### Usage

```js
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

### License

The MIT License (MIT).

