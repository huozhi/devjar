# devjar
> bundless runtime for your ESM JavaScript project in browser


### Install

```sh
yarn add devjar
```

### Usage

```js
import { useLiveCode } from 'devjar'

function Playground() {
  const { ref, error, load } = useLiveCode({
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
      'index.js': `export default function Main() { return 'hello world' }`,
      './mod': `...` // other relative modules
    })
  }

  // Attach the ref to an iframe element for runtime of code execution
  return (
    <div>
      <button onClick={run}>run</h3>
      <iframe ref={ref} />
    </div>
  )
}
```

### License

The MIT License (MIT).

