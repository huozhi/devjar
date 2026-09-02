import { afterAll, describe, expect, test } from 'bun:test'
import { resolve } from 'node:path'
import { init, parse } from 'es-module-lexer'
import { loadProject, startDevServer } from '../src/cli'
import { createEsmShResolver } from '../src/_cdn'
import { replaceImports } from '../src/core'

const root = resolve(import.meta.dir, '../examples/basic')

describe('project loading', () => {
  test('keeps parent-directory imports in the local module graph', async () => {
    await init
    const transformed = replaceImports(
      `import { Card } from '../components/card'; import '../styles.css'`,
      './pages/index.tsx',
      '@pages/index',
      specifier => `https://esm.sh/${specifier}`,
      new Set(['@components/card', '@styles.css'])
    )
    expect(transformed.dependencies).toEqual(['@components/card', '@styles.css'])
    expect(transformed.code).not.toContain('https://esm.sh/../')
  })

  test('shares the runtime CDN resolver', () => {
    const resolveModule = createEsmShResolver({ react: '19.1.0', '@scope/pkg': '^2.0.0' })
    expect(resolveModule('react/jsx-runtime')).toBe('https://esm.sh/react@19.1.0/jsx-runtime?dev')
    expect(resolveModule('@scope/pkg/subpath')).toBe('https://esm.sh/@scope/pkg@%5E2.0.0/subpath')
  })

  test('loads a page and its local dependency graph', async () => {
    const project = await loadProject(root, '/')
    expect(project.page).toBe('pages/index.tsx')
    expect(Object.keys(project.files).sort()).toEqual([
      './components/card.tsx',
      './components/shell.tsx',
      './pages/index.tsx',
      './styles.css',
      'index.tsx',
    ])
    expect(project.files['index.tsx']).toContain('./pages/index.tsx')
    expect(project.files['./components/card.tsx']).not.toContain('ReactNode')
  })

  test('loads a second page route', async () => {
    const project = await loadProject(root, '/about')
    expect(project.page).toBe('pages/about.tsx')
  })
})

describe('dev server', () => {
  let server: Awaited<ReturnType<typeof startDevServer>> | undefined
  afterAll(async () => server?.close())

  test('serves pages, static APIs, public files, and runtime assets', async () => {
    server = await startDevServer({ root, port: 0 })
    const base = `http://${server.host}:${server.port}`

    const shell = await fetch(`${base}/about`)
    expect(shell.status).toBe(200)
    expect(shell.headers.get('cross-origin-embedder-policy')).toBeNull()
    const shellSource = await shell.text()
    expect(shellSource).toContain('/__devjar/client.js')
    expect(shellSource).toContain('Devjar could not start')
    expect(shellSource).toContain(`Devjar could not start:\\n\\n`)
    const bootstrap = shellSource.match(/<script>\n([\s\S]+)<\/script><script type="module"/)?.[1]
    expect(() => new Function(bootstrap || '')).not.toThrow()

    const project = await fetch(`${base}/__devjar/project?route=%2Fabout`)
    expect((await project.json()).page).toBe('pages/about.tsx')
    const client = await (await fetch(`${base}/__devjar/client.js`)).text()
    await init
    expect(() => parse(client)).not.toThrow()
    expect(client).not.toContain('function dependencyUrl')
    expect(client).toContain('dependencies: project.dependencies')
    expect(client).toContain('transform: false')
    expect(client).toContain('popstate')
    expect(client).toContain('history.pushState')

    const json = await fetch(`${base}/api/status.json`)
    expect(json.headers.get('content-type')).toContain('application/json')
    expect(await json.json()).toEqual({ ok: true })

    expect(await (await fetch(`${base}/api/message.txt`)).text()).toContain('Hello from Devjar')
    expect(await (await fetch(`${base}/hello.txt`)).text()).toContain('This file is public')
    expect((await fetch(`${base}/api/blocked.js`)).status).toBe(404)
    expect((await fetch(`${base}/api/status.json`, { method: 'POST' })).status).toBe(405)

    const worker = await fetch(`${base}/__devjar/transform-worker.js`)
    expect(worker.headers.get('content-type')).toContain('text/javascript')
    const wasm = await fetch(`${base}/__devjar/transform.wasm32-wasi.wasm`)
    expect(wasm.headers.get('content-type')).toBe('application/wasm')

    await server.close()
    await expect(server.close()).resolves.toBeUndefined()
  })
})
