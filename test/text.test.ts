import { expect, test } from 'bun:test'
import { mkdtemp, mkdir, writeFile, rm, realpath, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { init, parse } from 'es-module-lexer'
import { linkModules } from '../src/core'
import { collectProjectFiles, compileProjectModule, DevModuleGraph } from '../src/cli/modules'
import { textModuleSuffix, isTextImport } from '../src/text'

const resolveModule = () => 'data:text/javascript,export default {}'
const text = 'uniform float time;\n// ` ${literal} "quoted"\nnot JavaScript < & > 🫙'
const textPath = (path: string) => path + textModuleSuffix
const readExport = (code: string) => Function(code.replace('export default', 'return'))()

function compile(root: string, projectPath: string, development: boolean, platform: 'browser' | 'server') {
  return compileProjectModule({
    root, projectPath, resolveModule,
    moduleUrl: path => '/modules/' + path, assetUrl: () => '/asset',
    runtimeModuleUrl: '/runtime.js', development, refresh: false, platform,
  })
}

test('text import attributes support static and dynamic imports', async () => {
  await init
  for (const source of [
    `import text from './file' with { type: 'text' };`,
    `export { default as text } from './file' with { "type": "text", };`,
    `import text from './file' with { /* contents */ type: 'text' };`,
    `const text = import('./file', { with: { type: 'text' } });`,
  ]) {
    expect(isTextImport(source, parse(source)[0][0])).toBe(true)
  }
  for (const source of [
    `import text from './file';`,
    `import text from './file' with { type: 'json' };`,
    `const text = 'with { type: "text" }'; import data from './file';`,
  ]) expect(isTextImport(source, parse(source)[0][0])).toBe(false)
})

test('text imports preserve arbitrary contents and live edits for any extension', async () => {
  for (const filename of ['paper.frag', 'notes.md', 'file.txt', 'LICENSE', 'source.js', 'data.json', 'style.css']) {
    for (const value of [text, text + '\nchanged']) {
      const files = { 'pages/index.js': `import data from '../${filename}' with { type: 'text' }; export default data` }
      const linked = await linkModules(files, resolveModule, { ...files, [filename]: value })
      const key = textPath('@' + filename)
      expect(linked.dependencies['@pages/index.js']).toEqual([key])
      expect(readExport(linked.files[key])).toBe(value)
      expect(linked.files['@pages/index.js']).not.toContain('with {')
    }
  }
})

test('text and normal imports of the same JSON file remain separate', async () => {
  const files = {
    'pages/index.js': `import raw from '../data.json' with { type: 'text' }; import data from '../data.json'; export default [raw, data]`,
    'data.json': '{ "hello": "world" }',
  }
  const linked = await linkModules(files, resolveModule, files)
  expect(readExport(linked.files['@data.json'])).toEqual({ hello: 'world' })
  expect(readExport(linked.files[textPath('@data.json')])).toBe(files['data.json'])
})

test('dynamic text imports consume their attributes and keep valid JavaScript', async () => {
  const files = { 'pages/index.js': `export const read = () => import('../notes.md', { with: { type: 'text' } })` }
  const linked = await linkModules(files, resolveModule, { ...files, 'notes.md': text })
  expect(linked.files['@pages/index.js']).not.toContain('with:')
  expect(parse(linked.files['@pages/index.js'])[0].some(item => item.d >= 0)).toBe(true)
})

test('CLI text imports work in dev, production, and server compilation', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'devjar-text-')))
  try {
    await mkdir(join(root, 'pages'))
    for (const filename of ['paper.frag', 'notes.md', 'LICENSE', 'source.js', 'data.json', 'style.css']) {
      await writeFile(join(root, filename), text)
      await writeFile(join(root, 'pages/index.js'), `import data from '../${filename}' with { type: 'text' }; export default data`)
      expect(await collectProjectFiles(root, join(root, 'pages/index.js'))).toEqual(new Set(['pages/index.js', textPath(filename)]))
      for (const development of [true, false]) {
        for (const platform of ['browser', 'server'] as const) {
          const compiled = await compile(root, textPath(filename), development, platform)
          expect(readExport(compiled.code)).toBe(text)
          expect(compiled.dependencies).toEqual([filename])
          const page = await compile(root, 'pages/index.js', development, platform)
          expect(page.dependencies).toEqual([textPath(filename)])
          expect(page.code).not.toContain('with {')
        }
      }
    }
    await writeFile(join(root, 'pages/index.js'), `export const read = () => import('../notes.md', { with: { type: 'text' } })`)
    const dynamic = await compile(root, 'pages/index.js', true, 'browser')
    expect(dynamic.code).not.toContain('with:')
    expect(dynamic.dependencies).toEqual([textPath('notes.md')])
    await writeFile(join(root, 'pages/index.js'), `import data from '../paper.frag'; export default data`)
    await expect(collectProjectFiles(root, join(root, 'pages/index.js'))).rejects.toThrow('Cannot resolve')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('text imports retain project-root boundaries', async () => {
  const parent = await realpath(await mkdtemp(join(tmpdir(), 'devjar-text-boundary-')))
  const root = join(parent, 'project')
  try {
    await mkdir(join(root, 'pages'), { recursive: true })
    await writeFile(join(parent, 'outside.txt'), text)
    await symlink(join(parent, 'outside.txt'), join(root, 'linked.txt'))
    for (const path of ['../../outside.txt', '../linked.txt']) {
      await writeFile(join(root, 'pages/index.js'), `import data from '${path}' with { type: 'text' }; export default data`)
      await expect(collectProjectFiles(root, join(root, 'pages/index.js'))).rejects.toThrow('escapes the project root')
      await expect(compile(root, 'pages/index.js', true, 'browser')).rejects.toThrow('escapes the project root')
    }
  } finally {
    await rm(parent, { recursive: true, force: true })
  }
})


test('changing a text file invalidates its importer, including raw CSS', () => {
  for (const path of ['notes.md', 'style.css', 'data.json']) {
    const graph = new DevModuleGraph('/')
    graph.update(textPath(path), { code: '', dependencies: [path], refreshBoundary: false, style: undefined })
    graph.update('pages/index.tsx', { code: '', dependencies: [textPath(path)], refreshBoundary: true, style: undefined })
    const update = graph.invalidate([path])
    expect(update.invalidated).toBe(true)
    expect(update.reload).toBe(false)
    expect(update.updates.map(item => [item.path, item.type])).toEqual([['pages/index.tsx', 'refresh']])
    expect(graph.moduleUrl(textPath(path))).toContain('v=1')
  }
})
