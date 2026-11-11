import { expect, test } from 'bun:test'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { discover } from '../src/cli/routes'
import { buildProject, startBuiltServer, startDevServer } from '../src/cli/index'
import { createEsmShResolver } from '../src/shared/cdn'
import { testCdnModule } from '../scripts/test-cdn'

async function readChangeEvent(reader: ReadableStreamDefaultReader<Uint8Array>) {
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const result = await reader.read()
    if (result.done) throw new Error('Development event stream closed')
    buffer += decoder.decode(result.value, { stream: true })
    const block = buffer.split('\n\n').find(block => block.includes('event: change'))
    const data = block?.split('\n').find(line => line.startsWith('data: '))
    if (data) return JSON.parse(data.slice('data: '.length))
  }
}

async function fixture(files: Record<string, string>, run: (root: string, cdn: string) => Promise<void>) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'devjar-routes-test-')))
  const server = createServer((request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/javascript' })
    response.end(testCdnModule(new URL(request.url!, 'http://localhost').pathname))
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  try {
    for (const [file, source] of Object.entries(files)) {
      await mkdir(dirname(join(root, file)), { recursive: true })
      await writeFile(join(root, file), source)
    }
    await run(root, `http://127.0.0.1:${(server.address() as { port: number }).port}`)
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()))
    await rm(root, { recursive: true, force: true })
  }
}

const leaf = `export function paths() {
  return [{ locale: 'en', course: 'react', lesson: 'intro' }, { locale: 'zh', course: 'vue', lesson: '开始 100%' }]
}
export default function Lesson({ params }) { return <h1>{params.locale + '/' + params.course + '/' + params.lesson}</h1> }`
const defaults = {
  'pages/index.tsx': `export const defaultParams = { locale: 'en' }`,
  'pages/[locale]/index.tsx': `export function defaultParams({ params }) { return { course: params.locale === 'en' ? 'react' : 'vue' } }`,
  'pages/[locale]/[course]/index.tsx': `export function defaultParams({ params }) { return { lesson: params.course === 'react' ? 'intro' : '开始 100%' } }`,
}

test('exports finite content and per-level defaults with base-aware redirects and sitemap', async () => {
  await fixture({ ...defaults, 'pages/[locale]/[course]/[lesson].tsx': leaf }, async (root, cdn) => {
    const build = await buildProject({ root, cdn, outDir: 'dist', base: '/preview/', prerender: true, exclude: [], origin: 'https://example.com', sitemap: 'sitemap.xml' })
    expect(await readFile(join(build.outDir, 'en/react/intro/index.html'), 'utf8')).toContain('<h1>en/react/intro</h1>')
    const entrance = await readFile(join(build.outDir, 'index.html'), 'utf8')
    expect(entrance).toContain('content="0;url=/preview/en/react/intro/"')
    expect(entrance).toContain('location.replace("/preview/en/react/intro/"+location.search+location.hash)')
    expect(await readFile(join(build.outDir, 'zh/index.html'), 'utf8')).toContain('/preview/zh/vue/%E5%BC%80%E5%A7%8B%20100%25/')
    const manifest = JSON.parse(await readFile(join(build.outDir, 'manifest.json'), 'utf8'))
    expect(manifest.routes['/zh/vue/开始 100%'].params).toEqual({ locale: 'zh', course: 'vue', lesson: '开始 100%' })
    expect(manifest.redirects['/']).toBe('/en/react/intro')
    const sitemap = await readFile(join(build.outDir, 'sitemap.xml'), 'utf8')
    expect(sitemap.match(/<loc>/g)?.length).toBe(2)
    expect(sitemap).toContain('https://example.com/preview/zh/vue/%E5%BC%80%E5%A7%8B%20100%25/')
    const server = await startBuiltServer({ root: build.outDir, host: '127.0.0.1', port: 0 })
    try {
      const origin = `http://127.0.0.1:${server.port}`
      const response = await fetch(origin + '/preview/zh/?ref=mail', { redirect: 'manual' })
      expect(response.status).toBe(302)
      expect(response.headers.get('location')).toBe('/preview/zh/vue/%E5%BC%80%E5%A7%8B%20100%25/?ref=mail')
      expect((await fetch(origin + '/preview/en/react/missing')).status).toBe(404)
      expect((await fetch(origin + '/preview/en%2freact/intro')).status).toBe(404)
    } finally { await server.close() }
    await buildProject({ root, cdn, outDir: 'dist', base: '/', prerender: false, exclude: [] })
    expect(await readFile(join(build.outDir, 'index.html'), 'utf8')).toContain('url=/en/react/intro/')
    await expect(buildProject({ root, cdn, outDir: 'dist', base: '/', prerender: false,
      exclude: ['pages/[locale]/[course]/[lesson].tsx'] })).rejects.toThrow('has no target')
  })
})

test('missing parent entrances allow deep pages; dev keeps hot updates and refreshes generated routes', async () => {
  await fixture({
    'data.json': '["intro"]',
    'components/title.tsx': `export function Title({ text }) { return <h1>{text}</h1> }`,
    'pages/[locale]/[lesson].tsx': `import lessons from '../../data.json'
import { Title } from '../../components/title'
export function paths() { return lessons.map(lesson => ({ locale: 'en', lesson })) }
export default function Lesson({ params }) { return <Title text={params.lesson} /> }`,
  }, async (root, cdn) => {
    const server = await startDevServer({ root, cdn, host: '127.0.0.1', port: 0, base: '/' })
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
    try {
      const origin = `http://127.0.0.1:${server.port}`
      expect((await fetch(origin + '/en/intro')).status).toBe(200)
      for (const path of ['/', '/en', '/en/missing']) expect((await fetch(origin + path)).status).toBe(404)
      const routes = await (await fetch(origin + '/_jar/routes.json')).json()
      const page = await (await fetch(origin + routes.routes['/en/intro'].module)).text()
      await fetch(origin + page.match(/"(\/_jar\/module\?path=components%2Ftitle\.tsx[^"]*)"/)![1])
      reader = (await fetch(origin + '/_jar/events')).body!.getReader()
      await reader.read()
      const nextChange = () => Promise.race([
        readChangeEvent(reader!),
        new Promise<never>((_resolve, reject) => setTimeout(() => reject(new Error('Timed out waiting for a change')), 5000)),
      ])

      // A component edit is a hot update even though the page generates routes.
      await writeFile(join(root, 'components/title.tsx'), `export function Title({ text }) { return <h2>{text}</h2> }`)
      const edit = await nextChange()
      expect({ reload: edit.reload, routes: edit.routes }).toEqual({ reload: false, routes: false })
      expect(edit.updates.map((update: { path: string }) => update.path)).toContain('components/title.tsx')

      // Data read by paths() refreshes the route list.
      await writeFile(join(root, 'data.json'), '["next"]')
      expect((await nextChange()).routes).toBe(true)
      const manifest = await (await fetch(origin + '/_jar/routes.json')).json()
      expect(Object.keys(manifest.routes)).toEqual(['/en/next'])
      expect((await fetch(origin + '/en/intro')).status).toBe(404)
    } finally {
      await reader?.cancel()
      await server.close()
    }
    const build = await buildProject({ root, cdn, outDir: 'dist', base: '/', prerender: true, exclude: [] })
    const built = await startBuiltServer({ root: build.outDir, host: '127.0.0.1', port: 0 })
    try {
      expect((await fetch(`http://127.0.0.1:${built.port}/`)).status).toBe(404)
      expect(await (await fetch(`http://127.0.0.1:${built.port}/en/next`)).text()).toContain('<h2>next</h2>')
    } finally { await built.close() }
  })
})

test('static segments win; equally specific templates and invalid declarations fail', async () => {
  await fixture({
    'pages/[locale]/[lesson].tsx': `export function paths() { return [{ locale: 'en', lesson: 'intro' }] }; export default function Page() { return null }`,
    'pages/[locale]/intro.tsx': `export function paths() { return [{ locale: 'en' }] }; export default function Intro() { return null }`,
  }, async (root, cdn) => {
    const resolve = createEsmShResolver({}, cdn, false)
    const pages = await discover(root, [], resolve)
    expect(pages.routes.get('/en/intro')).toBe(join(root, 'pages/[locale]/intro.tsx'))
    await writeFile(join(root, 'pages/[locale]/[other].tsx'), `export function paths() { return [{ locale: 'en', other: 'intro' }] }; export default function Page() { return null }`)
    // A static winner does not make duplicate dynamic templates a valid schema.
    await expect(discover(root, ['pages/[locale]/intro.tsx'], resolve)).rejects.toThrow('Multiple pages resolve')
  })
  const cases = [
    ['export default function Page() { return null }', 'paths()'],
    ['export function paths() { return {} }', 'must return an array'],
    ['export function paths() { return [{ id: 1 }] }', 'invalid path segment'],
    ['export function paths() { return [{ id: "../escape" }] }', 'invalid path segment'],
    ['export function paths() { return [{ id: "" }] }', 'invalid path segment'],
    ['export function paths() { return [{ id: "one", extra: "two" }] }', 'expected exactly'],
    ['export function paths() { return [{ id: "one" }, { id: "one" }] }', 'duplicate path'],
    ['export async function paths() { return [] }', 'must be synchronous'],
  ]
  for (const [source, message] of cases) {
    await fixture({ 'pages/[id].tsx': source }, async (root, cdn) => {
      await expect(discover(root, [], createEsmShResolver({}, cdn, false))).rejects.toThrow(message)
    })
  }
  for (const [source, message] of [
    ['export const defaultParams = { id: "missing" }', 'has no target'],
    ['export const defaultParams = { wrong: "one" }', 'immediate child'],
    ['export const defaultParams = { id: "one" }; export default function Page() { return null }', 'without a default component'],
  ]) {
    await fixture({ 'pages/index.tsx': source,
      'pages/[id].tsx': 'export function paths() { return [{ id: "one" }] }; export default function Page() { return null }',
    }, async (root, cdn) => {
      await expect(discover(root, [], createEsmShResolver({}, cdn, false))).rejects.toThrow(message)
    })
  }
})

test('default contexts stay in their subtree and reject undeclared intermediate entrances', async () => {
  await fixture({ ...defaults, 'pages/[locale]/[course]/[lesson].tsx': leaf,
    'pages/about/team.tsx': 'export default function Team() { return null }',
    'pages/en/index.tsx': 'export default function EnglishHome() { return null }',
  }, async (root, cdn) => {
    const resolve = createEsmShResolver({}, cdn, false)
    const pages = await discover(root, [], resolve)
    expect(pages.redirects['/']).toBe('/en')
    expect(pages.redirects['/en']).toBeUndefined()
    expect(pages.redirects['/about']).toBeUndefined()
    await rm(join(root, 'pages/en'), { recursive: true })
    await rm(join(root, 'pages/[locale]/index.tsx'))
    await expect(discover(root, [], resolve)).rejects.toThrow('has no target: /en')
  })
})

test('route exports reject output collisions before replacing a previous build', async () => {
  await fixture({
    'pages/[id].tsx': 'export function paths() { return [{ id: "one" }] }; export default function Page() { return null }',
    'public/one/index.html': 'Public page',
    'dist/keep.txt': 'Previous build',
  }, async (root, cdn) => {
    const options = { root, cdn, outDir: 'dist', base: '/', prerender: false, exclude: [] }
    await expect(buildProject(options)).rejects.toThrow('Output collision')
    expect(await readFile(join(root, 'dist/keep.txt'), 'utf8')).toBe('Previous build')
    await rm(join(root, 'public'), { recursive: true })
    await writeFile(join(root, 'pages/[id].tsx'), 'export function paths() { return [{ id: "ONE" }, { id: "one" }] }; export default function Page() { return null }')
    await expect(buildProject(options)).rejects.toThrow('Output collision')
  })
})

test('enumeration can import a local package in dev and with prerender disabled', async () => {
  await fixture({
    'package.json': '{"dependencies":{"lesson-data":"file:./local"}}',
    'local/package.json': '{"type":"module","exports":"./index.ts"}',
    'local/index.ts': 'export const lessons: string[] = ["intro"]',
    'pages/[lesson].tsx': `import { lessons } from 'lesson-data'
export function paths() { return lessons.map(lesson => ({ lesson })) }
export default function Lesson({ params }) { return <h1>{params.lesson}</h1> }`,
  }, async (root, cdn) => {
    const dev = await startDevServer({ root, cdn, host: 'localhost', port: 0, base: '/' })
    try {
      expect((await fetch(`http://localhost:${dev.port}/intro`)).status).toBe(200)
    } finally { await dev.close() }
    const build = await buildProject({ root, cdn, outDir: 'dist', base: '/', prerender: false, exclude: [] })
    expect(build.routes).toEqual(['/intro'])
  })
})
