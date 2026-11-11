import { readFile, writeFile } from 'node:fs/promises'
import { register } from 'node:module'
import type { RunnerInput } from '../node-runner'

export type TailwindInput = { compilerUrl: string; stylesheetUrl: string; candidates: string[] }

type Stylesheet = { path: string; base: string; content: string }
type Compiler = {
  compile(css: string, options: { base: string; loadStylesheet: (id: string, base: string) => Promise<Stylesheet> }): Promise<{ build(candidates: string[]): string }>
}

const input: TailwindInput & RunnerInput = JSON.parse(await readFile(process.argv[2], 'utf8'))
register(input.loader, { data: { imports: {} } })

async function loadStylesheet(url: string): Promise<Stylesheet> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Unable to load ${url}: ${response.status} ${response.statusText}`)
  return { path: response.url || url, base: new URL('.', response.url || url).href, content: await response.text() }
}

const tailwind = await import(input.compilerUrl) as Partial<Compiler>
if (typeof tailwind.compile !== 'function') throw new Error(`Tailwind compiler is missing from ${input.compilerUrl}`)
const stylesheet = await loadStylesheet(input.stylesheetUrl)
const compiler = await tailwind.compile(stylesheet.content, {
  base: stylesheet.base,
  loadStylesheet: (id, base) => loadStylesheet(new URL(id, base).href),
})
await writeFile(input.outputPath, JSON.stringify(compiler.build(input.candidates)))
