import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { cp, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { init, parse } from 'es-module-lexer'
import {
  buildProject,
  loadRouteManifest,
  startBuiltServer,
  startDevServer,
} from '../src/cli/index'
import { CDN_HOST, createEsmShResolver } from '../src/cdn'
import { replaceImports } from '../src/core'
import { compileProjectModule } from '../src/cli/modules'
import { getTailwindBrowserUrl } from '../src/tailwind'

const root = resolve(import.meta.dir, '../examples/basic')
const dashboardRoot = resolve(import.meta.dir, '../examples/dashboard')
function testModuleUrl(projectPath: string) {
  return `/modules/${projectPath}`
}

function loadTestRouteManifest(projectRoot: string) {
  return loadRouteManifest(projectRoot, {
    liveReload: true,
    revision: 7,
    moduleUrl: testModuleUrl,
  })
}

async function readChangeEvent(
  reader: ReadableStreamDefaultReader<Uint8Array>,
) {
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const result = await reader.read()
    if (result.done) throw new Error('Development event stream closed')
    buffer += decoder.decode(result.value, { stream: true })
    for (const block of buffer.split('\n\n')) {
      if (!block.includes('event: change')) continue
      const data = block.split('\n').find(line => line.startsWith('data: '))
      if (data) return JSON.parse(data.slice('data: '.length))
    }
  }
}

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

  test('loads a route manifest with module entries', async () => {
    const manifest = await loadTestRouteManifest(root)
    expect(manifest.version).toBe(2)
    expect(manifest.revision).toBe(7)
    expect(manifest.routes['/']).toEqual({
      module: '/modules/pages/index.tsx',
      page: 'pages/index.tsx',
    })
    expect(manifest.routes['/about']).toEqual({
      module: '/modules/pages/about.tsx',
      page: 'pages/about.tsx',
    })
    expect(manifest.notFound).toBeUndefined()
  })

  test('uses a custom module CDN', async () => {
    const compiled = await compileProjectModule({
      root,
      projectPath: 'pages/about.tsx',
      dependencies: { react: '19.2.0' },
      cdn: 'https://modules.example.test/',
      moduleUrl: testModuleUrl,
      refresh: false,
    })
    expect(compiled.code).toContain('https://modules.example.test/react@19.2.0/jsx-dev-runtime?dev')
  })

  test('ignores package configuration outside dependency versions', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'devjar-zero-config-'))
    try {
      await cp(root, projectRoot, { recursive: true })
      const packageJsonPath = join(projectRoot, 'package.json')
      const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'))
      packageJson.devjar = { cdn: 'https://modules.example.test/' }
      await writeFile(packageJsonPath, JSON.stringify(packageJson))

      const result = await buildProject({
        root: projectRoot,
        outDir: 'dist',
        cdn: undefined,
      })
      const manifest = JSON.parse(await readFile(join(result.outDir, 'manifest.json'), 'utf8'))
      const entry = await readFile(join(result.outDir, manifest.routes['/'].module), 'utf8')
      expect(entry).toContain('https://esm.sh/react@19.2.0/jsx-dev-runtime?dev')
      expect(entry).not.toContain('modules.example.test')
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })

  test('loads the hosted dashboard example and its 404 page', async () => {
    const manifest = await loadTestRouteManifest(dashboardRoot)
    expect(manifest.routes['/projects'].page).toBe('pages/projects.tsx')
    expect(manifest.notFound?.page).toBe('pages/404.tsx')
  })

  test('uses the project Tailwind version for the cached browser runtime', () => {
    expect(getTailwindBrowserUrl(
      { tailwindcss: '^4.1.0' },
      'https://modules.example.test/',
    )).toBe(
      'https://modules.example.test/@tailwindcss/browser@%5E4.1.0',
    )
    expect(getTailwindBrowserUrl({}, CDN_HOST)).toBeUndefined()
  })

  test('rewrites dynamic local imports as module URLs', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'devjar-dynamic-import-'))
    try {
      await mkdir(join(projectRoot, 'pages'))
      await mkdir(join(projectRoot, 'components'))
      await writeFile(
        join(projectRoot, 'pages/index.tsx'),
        `export const loadCard = () => import('../components/card')`,
      )
      await writeFile(join(projectRoot, 'components/card.tsx'), 'export default function Card() {}')
      const compiled = await compileProjectModule({
        root: await realpath(projectRoot),
        projectPath: 'pages/index.tsx',
        dependencies: {},
        cdn: CDN_HOST,
        moduleUrl: testModuleUrl,
        refresh: false,
      })
      expect(compiled.code).toContain(`import("/modules/components/card.tsx")`)
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
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
    expect(shellSource).toContain("import * as RefreshModule from 'react-refresh/runtime'")
    expect(shellSource).toContain('data-devjar-tailwind')
    expect(shellSource).toContain('https://esm.sh/@tailwindcss/browser@%5E4.1.0')
    expect(shellSource).toContain('Devjar could not start')
    expect(shellSource).toContain(`Devjar could not start:\\n\\n`)
    expect(shellSource).not.toContain('<iframe')
    expect(await (await fetch(`${base}/about`, { method: 'HEAD' })).text()).toBe('')
    const bootstrap = shellSource.match(/<script>\n([\s\S]+?)<\/script>/)?.[1]
    expect(() => new Function(bootstrap || '')).not.toThrow()

    const routes = await (await fetch(`${base}/__devjar/routes.json`)).json()
    expect(routes.routes['/about'].page).toBe('pages/about.tsx')
    const pageModule = await (await fetch(`${base}${routes.routes['/about'].module}`)).text()
    expect(pageModule).toContain('/__devjar/module?path=components%2Fshell.tsx')
    expect(pageModule).toContain('/__devjar/module?path=styles.css')
    expect(pageModule).toContain('https://esm.sh/react@19.2.0/jsx-dev-runtime?dev')
    expect(pageModule).toContain('__devjarRegisterModule')
    expect(pageModule).toContain('__devjarRefreshRuntime')
    const sharedModule = await (await fetch(`${base}/__devjar/module?path=components%2Fshell.tsx`)).text()
    expect(sharedModule).not.toContain('ReactNode')
    const client = await (await fetch(`${base}/__devjar/client.js`)).text()
    await init
    expect(() => parse(client)).not.toThrow()
    expect(client).toContain('/__devjar/routes.json')
    expect(client).toContain('modulepreload')
    expect(client).toContain('pointerover')
    expect(client).not.toContain('/__devjar/project')
    expect(client).not.toContain('linkModules')
    expect(client).not.toContain('createElement("iframe")')
    expect(client).not.toContain('@tailwindcss/browser')
    expect(client).toContain('routeManifest.liveReload')
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

  test('sends a precise update for a changed refresh boundary', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'devjar-hmr-'))
    await mkdir(join(projectRoot, 'pages'))
    await mkdir(join(projectRoot, 'components'))
    await writeFile(
      join(projectRoot, 'pages/index.tsx'),
      `import { Card } from '../components/card'
export default function Page() { return <Card /> }`,
    )
    const cardPath = join(projectRoot, 'components/card.tsx')
    await writeFile(cardPath, `export function Card() { return <p>one</p> }`)

    const hmrServer = await startDevServer({
      root: projectRoot,
      host: '127.0.0.1',
      port: 0,
      cdn: undefined,
    })
    const base = `http://${hmrServer.host}:${hmrServer.port}`
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
    try {
      await new Promise(resolvePromise => setTimeout(resolvePromise, 100))
      const routes = await (await fetch(`${base}/__devjar/routes.json`)).json()
      const pageModule = await (await fetch(`${base}${routes.routes['/'].module}`)).text()
      const cardModuleUrl = pageModule.match(/\/__devjar\/module\?path=components%2Fcard\.tsx/)?.[0]
      expect(cardModuleUrl).toBeDefined()
      const cardModule = await (await fetch(`${base}${cardModuleUrl}`)).text()
      expect(cardModule).toContain('__devjarRegisterModule')

      const eventResponse = await fetch(`${base}/__devjar/events`)
      reader = eventResponse.body!.getReader()
      await reader.read()
      await writeFile(cardPath, `export function Card() { return <p>two</p> }`)
      const change = await Promise.race([
        readChangeEvent(reader),
        new Promise<never>((_resolve, reject) => {
          setTimeout(() => reject(new Error('Timed out waiting for HMR update')), 2_000)
        }),
      ])
      const { timestamp, ...changeWithoutTimestamp } = change
      expect(timestamp).toBeNumber()
      expect(changeWithoutTimestamp).toEqual({
        revision: routes.revision + 1,
        reload: false,
        routes: false,
        updates: [{
          path: 'components/card.tsx',
          type: 'refresh',
          url: '/__devjar/module?path=components%2Fcard.tsx&v=1',
        }],
      })
    } finally {
      await reader?.cancel()
      await hmrServer.close()
      await rm(projectRoot, { recursive: true, force: true })
    }
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
    expect(manifest.version).toBe(2)
    expect(manifest.liveReload).toBe(false)
    expect(manifest.routes['/'].module).toMatch(/^\/__devjar\/modules\/.+\.js$/)
    expect(await readFile(join(buildRoot, '__devjar/client.js'), 'utf8')).toContain('__devjar/routes.json')
    expect(await readFile(join(buildRoot, '__devjar/routes.json'), 'utf8')).toBe(JSON.stringify(manifest))
    const entryModule = await readFile(join(buildRoot, manifest.routes['/'].module), 'utf8')
    expect(entryModule).toContain('https://modules.example.test/react@19.2.0/jsx-dev-runtime?dev')
    expect(entryModule).not.toContain('__devjarRegisterModule')
    const builtHtml = await readFile(join(buildRoot, 'index.html'), 'utf8')
    expect(builtHtml).toContain('data-devjar-tailwind')
    expect(builtHtml).not.toContain('react-refresh')
    const runtimeFiles = await readdir(join(buildRoot, '__devjar'))
    expect(runtimeFiles.some(file => /^cdn-.+\.js$/.test(file))).toBe(true)
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
    const routes = await (await fetch(`${base}/__devjar/routes.json`)).json()
    expect(routes.routes['/projects'].page).toBe('pages/projects.tsx')
    expect(routes.liveReload).toBe(false)
    expect(routes.notFound.page).toBe('pages/404.tsx')
    const projectModule = await fetch(`${base}${routes.routes['/projects'].module}`)
    expect(projectModule.status).toBe(200)
    expect(projectModule.headers.get('content-type')).toContain('text/javascript')
    expect((await fetch(`${base}/__devjar/events`)).status).toBe(404)
    expect(await (await fetch(`${base}/api/projects.json`)).json()).toHaveLength(4)
    expect(await (await fetch(`${base}/mark.svg`)).text()).toContain('<svg')

    await server.close()
  })
})
