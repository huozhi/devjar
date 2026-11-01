import { expect, test } from 'bun:test'
import { linkModules } from '../src/client/core'
import { createModule, type ModuleRuntime } from '../src/client/module'

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

test('linked static and dynamic imports evaluate', async () => {
  const dataModule = (source: string) => `data:text/javascript;utf-8,${encodeURIComponent(source)}`
  const resolveModule = (specifier: string) => {
    if (specifier === 'react-refresh/runtime') return refreshRuntimeUrl
    if (specifier === 'react') return dataModule(`export default {}`)
    return dataModule(`export default ${JSON.stringify(specifier)}`)
  }
  const files = {
    'index.js': `
import staticBare from "static-package"
import { local as staticLocal } from "./local"
const bare = await import("bare-package")
const local = await import('./local')
const chained = await import("chained-package").then(mod => mod.default)
const spaced = await import( 'spaced-package' , { } )
export default [staticBare, staticLocal, bare.default, local.local, chained, spaced.default]
`,
    'local.js': `export const local = 'local'`,
  }

  const { files: linked, dependencies } = await linkModules(files, resolveModule, files)
  const { module } = await createModule(linked, {
    resolveModule,
    dependencies,
    runtime: {},
    entry: '@index.js',
  })

  expect(module.default).toEqual([
    'static-package', 'local', 'bare-package', 'local', 'chained-package', 'spaced-package',
  ])
})
