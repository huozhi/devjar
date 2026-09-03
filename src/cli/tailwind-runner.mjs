import { readFile, writeFile } from 'node:fs/promises'
import { register } from 'node:module'

const input = JSON.parse(await readFile(process.argv[2], 'utf8'))
register(new URL('./http-loader.mjs', import.meta.url), { data: { imports: {} } })

async function loadStylesheet(url) {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Unable to load ${url}: ${response.status} ${response.statusText}`)
  }
  return {
    path: response.url || url,
    base: new URL('.', response.url || url).href,
    content: await response.text(),
  }
}

const tailwind = await import(input.compilerUrl)
if (typeof tailwind.compile !== 'function') {
  throw new Error(`Tailwind compiler is missing from ${input.compilerUrl}`)
}
const stylesheet = await loadStylesheet(input.stylesheetUrl)
const compiler = await tailwind.compile(stylesheet.content, {
  base: stylesheet.base,
  loadStylesheet: (id, base) => loadStylesheet(new URL(id, base).href),
})
await writeFile(input.outputPath, compiler.build(input.candidates))
