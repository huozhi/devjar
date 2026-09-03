import { expect, test } from 'bun:test'
import { createModule, type ModuleRuntime } from '../src/module'

const refreshRuntimeUrl = `data:text/javascript;utf-8,${encodeURIComponent(`
export default {
  injectIntoGlobalHook() {},
  performReactRefresh() {},
}
`)}`

test('keeps the latest files when module updates finish out of order', async () => {
  const runtime: ModuleRuntime = {}
  const options = {
    resolveModule: () => refreshRuntimeUrl,
    dependencies: { '@index.js': [] },
    runtime,
    entry: '@index.js',
  }
  const oldSource = `
await new Promise(resolve => setTimeout(resolve, 30))
export default 'old'
`
  const newSource = `export default 'new'`

  const oldUpdate = createModule({ '@index.js': oldSource }, options)
  await new Promise(resolve => setTimeout(resolve, 5))
  const newUpdate = createModule({ '@index.js': newSource }, options)
  await Promise.all([oldUpdate, newUpdate])

  expect(runtime.files?.['@index.js']).toBe(newSource)
})

test('evaluates a module again when its source returns to an earlier value', async () => {
  const runtime: ModuleRuntime = {}
  const options = {
    resolveModule: () => refreshRuntimeUrl,
    dependencies: { '@index.js': [] },
    runtime,
    entry: '@index.js',
  }
  const testGlobal = globalThis as typeof globalThis & {
    __devjarTestExecutions?: number
  }
  const source = (value: string) => `
globalThis.__devjarTestExecutions = (globalThis.__devjarTestExecutions || 0) + 1
export default '${value}'
`

  delete testGlobal.__devjarTestExecutions
  try {
    await createModule({ '@index.js': source('a') }, options)
    const firstUrl = runtime.urls?.['@index.js']
    await createModule({ '@index.js': source('b') }, options)
    await createModule({ '@index.js': source('a') }, options)

    expect(testGlobal.__devjarTestExecutions).toBe(3)
    expect(runtime.urls?.['@index.js']).not.toBe(firstUrl)
  } finally {
    delete testGlobal.__devjarTestExecutions
  }
})
