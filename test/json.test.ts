import { expect, test } from 'bun:test'
import { mkdtemp, mkdir, writeFile, rm, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createJsonModule } from '../src/json'
import { linkModules } from '../src/core'

import { collectProjectFiles, compileProjectModule } from '../src/cli/modules'

const resolveModule = () => 'data:text/javascript,export default {injectIntoGlobalHook(){},performReactRefresh(){}}'

test('JSON imports link into the live module graph', async () => {
  for (const value of [1, 2]) {
    const files = {
      'pages/index.js': "import data from '../data.json'; export default data.value",
      'data.json': JSON.stringify({ value }),
    }
    const linked = await linkModules(files, resolveModule, files)
    expect(linked.dependencies['@pages/index.js']).toEqual(['@data.json'])
    expect(Function(linked.files['@data.json'].replace('export default', 'return'))()).toEqual({ value })
  }
})

test('JSON modules preserve arrays, null, and __proto__ data', async () => {
  for (const source of ['null', '[1,true,"text"]', '{"__proto__":{"value":1}}']) {
    const code = createJsonModule('data.json', source)
    const result = Function(code.replace('export default', 'return'))()
    expect(result).toEqual(JSON.parse(source))
  }
  expect(() => createJsonModule('broken.json', '{')).toThrow('Invalid JSON in broken.json')
})

test('CLI discovers and compiles JSON imports for development and production', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'devjar-json-')))
  try {
    await mkdir(join(root, 'pages'))
    await writeFile(join(root, 'pages/index.js'), "import data from '../data.json'; export default data")
    await writeFile(join(root, 'data.json'), '{"title":"devjar"}')
    expect(await collectProjectFiles(root, join(root, 'pages/index.js'))).toContain('data.json')
    for (const development of [true, false]) {
      for (const platform of ['browser', 'server'] as const) {
        const compiled = await compileProjectModule({
          root, projectPath: 'data.json', resolveModule,
          moduleUrl: path => '/modules/' + path, assetUrl: () => '/asset',
          runtimeModuleUrl: '/runtime.js', development, refresh: false, platform,
        })
        const result = Function(compiled.code.replace('export default', 'return'))()
        expect(result).toEqual({ title: 'devjar' })
        expect(compiled.refreshBoundary).toBe(false)
      }
    }
    await writeFile(join(root, 'data.json'), '{')
    await expect(collectProjectFiles(root, join(root, 'pages/index.js'))).rejects.toThrow('Invalid JSON in data.json')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
