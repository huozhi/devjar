import { readFile, writeFile } from 'node:fs/promises'
import { register } from 'node:module'

register(new URL('./http-loader.mjs', import.meta.url))

const input = JSON.parse(await readFile(process.argv[2], 'utf8'))
const reactModule = await import(input.react)
const serverModule = await import(input.reactDomServer)
const React = reactModule.default || reactModule
const rendered = {}

for (const [route, entry] of Object.entries(input.routes)) {
  try {
    const pageModule = await import(entry)
    if (typeof pageModule.default !== 'function'
      && (typeof pageModule.default !== 'object' || pageModule.default === null)) {
      throw new Error('page must have a default React component export')
    }
    rendered[route] = serverModule.renderToString(React.createElement(pageModule.default))
  } catch (error) {
    throw new Error(`Unable to prerender ${route}: ${error?.stack || error}`)
  }
}

await writeFile(input.outputPath, JSON.stringify(rendered))
process.exit(0)
