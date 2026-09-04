import { afterEach, beforeEach, expect, test } from 'bun:test'
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { init, parse } from 'es-module-lexer'
import { LocalPackages } from '../src/cli/local-packages'
import { buildProject, startDevServer } from '../src/cli/index'
import { testCdnModule } from '../scripts/test-cdn'

let temporaryRoot: string
let root: string
let library: string
beforeEach(async () => {
  temporaryRoot = await realpath(await mkdtemp(join(tmpdir(), 'devjar-local-')))
  root = join(temporaryRoot, 'playground')
  library = join(temporaryRoot, 'local library')
  await mkdir(join(root, 'pages'), { recursive: true })
  await mkdir(join(library, 'src'), { recursive: true })
  await writeFile(join(library, 'package.json'), JSON.stringify({
    exports: { '.': { types: './index.d.ts', import: './src/index.tsx' }, './*': './src/*.ts' },
    dependencies: { react: '18.0.0', helper: '1.2.3' },
  }))
  await writeFile(join(library, 'src/index.tsx'), "import { label } from './label'; export default function Spinner() { return <span>{label}</span> }")
  await writeFile(join(library, 'src/label.ts'), "export const label: string = 'Local spinner'")
  await writeFile(join(root, 'pages/index.tsx'), "import Spinner from '@test/spinner'; export default function Page() { return <Spinner /> }")
  await setDependency('file:../local library')
})
afterEach(async () => { await rm(temporaryRoot, { recursive: true, force: true }) })

async function setDependency(version: string) {
  await writeFile(join(root, 'package.json'), JSON.stringify({ dependencies: { '@test/spinner': version } }))
}

function packages() {
  return new LocalPackages({ root, prefix: 'http://localhost/_jar/local', serverPrefix: 'http://localhost/_jar/local', cdn: 'https://esm.sh', development: true, onChange: undefined })
}

test('resolves file URLs, relative references, absolute paths and scoped subpaths', async () => {
  for (const version of ['file:../local library', `file:${library}`, pathToFileURL(library).href, library, '../local library', 'link:../local library']) {
    await setDependency(version)
    const local = packages()
    const url = local.resolve('@test/spinner', 'browser', root)
    const module = await local.load(new URL(url))
    expect(module.contents).toContain('jsxDEV')
    expect(module.contents).toContain('react@19.2.0')
    expect(module.contents).not.toContain('react@18')
    const label = await local.load(new URL(local.resolve('@test/spinner/label', 'browser', root)))
    expect(label.contents).toContain('Local spinner')
    expect(label.contents).not.toContain(': string')
    expect(local.resolve('helper', 'browser', library)).toBe('https://esm.sh/helper@1.2.3?external=react')
  }
})

test('supports legacy entry points, export conditions and unexported subpaths', async () => {
  const local = packages()
  await writeFile(join(library, 'package.json'), JSON.stringify({ main: './src/index.tsx' }))
  expect((await local.load(new URL(local.resolve('@test/spinner', 'browser', root)))).contents).toContain('jsxDEV')
  await writeFile(join(library, 'package.json'), JSON.stringify({ exports: { '.': { browser: './src/index.tsx', node: './src/label.ts' }, './private': null } }))
  expect(local.resolve('@test/spinner', 'server', root)).toContain('label.ts')
  expect(() => local.resolve('@test/spinner/private', 'browser', root)).toThrow('does not export')
})

test('rejects traversal, symlink escapes and unknown package IDs', async () => {
  const local = packages()
  const url = new URL(local.resolve('@test/spinner', 'browser', root))
  url.searchParams.set('path', '../playground/pages/index.tsx')
  await expect(local.load(url)).rejects.toThrow('escapes')
  await symlink(join(root, 'pages/index.tsx'), join(library, 'src/escape.tsx'))
  url.searchParams.set('path', 'src/escape.tsx')
  await expect(local.load(url)).rejects.toThrow('escapes')
  await expect(local.load(new URL('http://localhost/_jar/local/unknown?path=package.json'))).rejects.toThrow('Unknown')
})

test('serves local modules under the dev base path and reloads on library edits', async () => {
  const server = await startDevServer({ root, host: '127.0.0.1', port: 0, cdn: undefined, base: '/preview/' })
  const origin = `http://127.0.0.1:${server.port}`
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  try {
    const page = await (await fetch(`${origin}/preview/_jar/module?path=pages/index.tsx`)).text()
    await init
    const [imports] = parse(page)
    const localUrl = imports.find(item => item.n?.includes('/_jar/local/'))!.n!
    const local = await fetch(origin + localUrl)
    expect(local.status).toBe(200)
    expect(await local.text()).toContain('jsxDEV')
    reader = (await fetch(`${origin}/preview/_jar/events`)).body!.getReader()
    await reader.read()
    await writeFile(join(library, 'src/label.ts'), "export const label = 'Updated spinner'")
    const event = new TextDecoder().decode((await reader.read()).value)
    expect(event).toContain('"reload":true')
  } finally {
    await reader?.cancel()
    await server.close()
  }
})

test('vendors local packages and prerenders them without leaking local paths', async () => {
  const cdn = createServer((request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/javascript' })
    response.end(testCdnModule(new URL(request.url!, 'http://localhost').pathname))
  })
  await new Promise<void>(resolve => cdn.listen(0, '127.0.0.1', resolve))
  try {
    const port = (cdn.address() as import('node:net').AddressInfo).port
    await writeFile(join(library, 'src/icon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>')
    await writeFile(join(library, 'src/style.css'), 'span { background: url(./icon.svg); }')
    await writeFile(join(library, 'src/index.tsx'), "import './style.css'; import { label } from './label'; export const lazy = () => import('./label'); export default function Spinner() { return <span>{label}</span> }")
    const buildOptions = { root, outDir: 'dist', cdn: `http://127.0.0.1:${port}`, prerender: true, base: '/preview/' }
    const build = await buildProject(buildOptions)
    expect(await readFile(join(build.outDir, 'index.html'), 'utf8')).toContain('<span>Local spinner</span>')
    const vendorRoot = join(build.outDir, '_jar/vendor')
    const files = await readdir(vendorRoot, { recursive: true })
    const sources = await Promise.all(files.filter(file => file.endsWith('.js')).map(file => readFile(join(vendorRoot, file), 'utf8')))
    expect(sources.join('\n')).toContain('Local spinner')
    expect(sources.join('\n')).not.toContain('http://127.0.0.1')
    expect(sources.join('\n')).not.toContain(library)
    expect(sources.join('\n')).not.toContain('local.devjar.invalid')
    expect(sources.join('\n')).toContain('data:image/svg+xml;base64,')
    await buildProject({ ...buildOptions, prerender: false })
    expect(await readdir(vendorRoot, { recursive: true })).toEqual(files)
  } finally {
    await new Promise<void>(resolve => cdn.close(() => resolve()))
  }
})
