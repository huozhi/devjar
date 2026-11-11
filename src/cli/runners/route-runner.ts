import { readFile, writeFile } from 'node:fs/promises'
import { register } from 'node:module'
import type { RunnerInput } from '../node-runner'

/** One export call: paths() of a [name] page, or defaultParams of an index. */
export type RouteCall = {
  page: string
  url: string
  name: 'paths' | 'defaultParams'
  params: Record<string, string>
}

export type RouteInput = { imports: Record<string, string>; calls: RouteCall[] }

const input: RouteInput & RunnerInput = JSON.parse(await readFile(process.argv[2], 'utf8'))
register(input.loader, { data: { imports: input.imports } })

const results: unknown[] = []
for (const call of input.calls) {
  try {
    const exported = (await import(call.url))[call.name]
    if (call.name === 'paths' && typeof exported !== 'function') throw new Error('a [name] page must export paths()')
    const value = typeof exported !== 'function' ? exported
      : call.name === 'paths' ? exported() : exported(Object.freeze({ params: Object.freeze(call.params) }))
    if (typeof value?.then === 'function') throw new Error('must be synchronous; read local data instead')
    if (value === undefined) throw new Error('returned undefined')
    results.push(value)
  } catch (error) {
    throw new Error(`${call.page}: ${call.name}: ${(error as Error)?.stack || error}`)
  }
}

await writeFile(input.outputPath, JSON.stringify(results))
process.exit(0)
