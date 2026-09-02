import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { init, parse } from 'es-module-lexer'
import { buildProject, loadProject, startBuiltServer, startDevServer } from '../src/cli'
import { CDN_HOST, createEsmShResolver } from '../src/_cdn'
import { replaceImports } from '../src/core'

const root = resolve(import.meta.dir, '../examples/basic')
const dashboardRoot = resolve(import.meta.dir, '../examples/dashboard')
const liveProjectOptions = { cdn: undefined, liveReload: true }

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
    const resolveModule = createEsmShResolver(
      { react: '19.1.0', '@scope/pkg': '^2.0.0' },
      CDN_HOST,
    )
    expect(resolveModule('react/jsx-runtime')).toBe('https://esm.sh/react@19.1.0/jsx-runtime?dev')
    expect(resolveModule('@scope/pkg/subpath')).toBe('https://esm.sh/@scope/pkg@%5E2.0.0/subpath')
  })

  test('loads a page and its local dependency graph', async () => {
    const project = await loadProject(root, '/', liveProjectOptions)
    expect(project.page).toBe('pages/index.tsx')
    expect(Object.keys(project.files).sort()).toEqual([
      './components/shell.tsx',
      './pages/index.tsx',
      './styles.css',
      'index.tsx',
    ])
    expect(project.tailwind).toBe(true)
    expect(project.files['index.tsx']).toContain('./pages/index.tsx')
    expect(project.files['./components/shell.tsx']).not.toContain('ReactNode')
  })

  test('loads a second page route', async () => {
    const project = await loadProject(root, '/about', liveProjectOptions)
    expect(project.page).toBe('pages/about.tsx')
  })

  test('uses a custom module CDN', async () => {
    const project = await loadProject(root, '/', {
      cdn: 'https://modules.example.test/',
      liveReload: true,
    })
    expect(project.cdn).toBe('https://modules.example.test')
    expect(createEsmShResolver(project.dependencies, project.cdn)('react')).toBe(
      'https://modules.example.test/react@19.2.0?dev',
    )
  })

  test('loads the hosted dashboard example and its 404 page', async () => {
    const project = await loadProject(dashboardRoot, '/', liveProjectOptions)
    expect(project.dependencies['lucide-react']).toBe('0.542.0')
    expect(project.files['./components/project-card.tsx']).toBeDefined()
    expect(project.files['./lib/projects.ts']).toBeDefined()

    const notFound = await loadProject(dashboardRoot, '/missing', liveProjectOptions)
    expect(notFound.page).toBe('pages/404.tsx')
  })
})

describe('dev server', () => {
  let server: Awaited<ReturnType<typeof startDevServer>> | undefined
  afterAll(async () => server?.close())

  test('serves pages, static APIs, public files, and runtime assets', async () => {
    server = await startDevServer({
      root,
      host: '127.0.0.1',
      port: 0,
      cdn: undefined,
    })
    const base = `http://${server.host}:${server.port}`

    const shell = await fetch(`${base}/about`)
    expect(shell.status).toBe(200)
    expect(shell.headers.get('cross-origin-embedder-policy')).toBeNull()
    const shellSource = await shell.text()
    expect(shellSource).toContain('/__devjar/client.js')
    expect(shellSource).toContain('Devjar could not start')
    expect(shellSource).toContain(`Devjar could not start:\\n\\n`)
    expect(shellSource).not.toContain('<iframe')
    expect(await (await fetch(`${base}/about`, { method: 'HEAD' })).text()).toBe('')
    const bootstrap = shellSource.match(/<script>\n([\s\S]+)<\/script><script type="module"/)?.[1]
    expect(() => new Function(bootstrap || '')).not.toThrow()

    const project = await fetch(`${base}/__devjar/project?route=%2Fabout`)
    expect((await project.json()).page).toBe('pages/about.tsx')
    const client = await (await fetch(`${base}/__devjar/client.js`)).text()
    await init
    expect(() => parse(client)).not.toThrow()
    expect(client).not.toContain('function dependencyUrl')
    expect(client).toContain('createEsmShResolver(project.dependencies, project.cdn)')
    expect(client).toContain('createRenderer(createModule')
    expect(client).toContain('linkModules(project.files, moduleResolver)')
    expect(client).not.toContain('createElement("iframe")')
    expect(client).toContain('project.liveReload')
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

describe('production build', () => {
  let projectRoot = ''
  let buildRoot = ''
  let server: Awaited<ReturnType<typeof startBuiltServer>> | undefined

  beforeAll(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'devjar-build-'))
    await cp(dashboardRoot, projectRoot, { recursive: true })
    const result = await buildProject({
      root: projectRoot,
      outDir: 'dist',
      cdn: 'https://modules.example.test/',
    })
    buildRoot = result.outDir
  })

  afterAll(async () => {
    await server?.close()
    if (projectRoot) await rm(projectRoot, { recursive: true, force: true })
  })

  test('writes routes, runtime assets, public files, and static APIs', async () => {
    const manifest = JSON.parse(await readFile(join(buildRoot, 'manifest.json'), 'utf8'))
    expect(Object.keys(manifest.routes).sort()).toEqual(['/', '/404', '/projects', '/settings'])
    expect(manifest.routes['/'].liveReload).toBe(false)
    expect(manifest.cdn).toBe('https://modules.example.test')
    expect(await readFile(join(buildRoot, '__devjar/client.js'), 'utf8')).toContain('__devjar/project')
    expect(await readFile(join(buildRoot, '__devjar/_cdn.js'), 'utf8')).toContain('createEsmShResolver')
    expect(await readFile(join(buildRoot, 'api/projects.json'), 'utf8')).toContain('Mobile refresh')
    expect(await readFile(join(buildRoot, 'public/mark.svg'), 'utf8')).toContain('<svg')
  })

  test('refuses to clean an output directory outside the project', async () => {
    await expect(buildProject({
      root: projectRoot,
      outDir: '../outside',
      cdn: undefined,
    })).rejects.toThrow(
      'The build output must be a directory inside the project root',
    )
  })

  test('serves prebuilt projects without development events', async () => {
    server = await startBuiltServer({ root: buildRoot, host: '127.0.0.1', port: 0 })
    const base = `http://${server.host}:${server.port}`

    const shell = await (await fetch(`${base}/projects`)).text()
    expect(shell).toContain('https://modules.example.test/react@19.2.0?dev')
    const project = await (await fetch(`${base}/__devjar/project?route=%2Fprojects`)).json()
    expect(project.page).toBe('pages/projects.tsx')
    expect(project.liveReload).toBe(false)
    const notFound = await (await fetch(`${base}/__devjar/project?route=%2Fmissing`)).json()
    expect(notFound.page).toBe('pages/404.tsx')
    expect((await fetch(`${base}/__devjar/events`)).status).toBe(404)
    expect(await (await fetch(`${base}/api/projects.json`)).json()).toHaveLength(4)
    expect(await (await fetch(`${base}/mark.svg`)).text()).toContain('<svg')

    await server.close()
  })
})
