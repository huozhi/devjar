import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { cp, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import { createServer as createHttpServer } from 'node:http'
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
import { createIframeRouteManifest, linkModules } from '../src/core'
import { collectProjectFiles, compileProjectModule } from '../src/cli/modules'
import { getTailwindBrowserUrl } from '../src/tailwind'
import { testCdnModule } from '../scripts/test-cdn'
import { normalizeBase, withBase, withoutBase } from '../src/project'

const root = resolve(import.meta.dir, '../examples/basic')
const dashboardRoot = resolve(import.meta.dir, '../examples/dashboard')
const websiteRoot = resolve(import.meta.dir, '../site')

function testModuleUrl(projectPath: string) {
  return `/modules/${projectPath}`
}

function loadTestRouteManifest(projectRoot: string) {
  return loadRouteManifest(projectRoot, {
    liveReload: true,
    revision: 7,
    base: '/',
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
    const linked = await linkModules(
      {
        'pages/index.tsx': `import { Card } from '../components/card'; import '../styles.css'`,
        'components/card.tsx': 'export function Card() {}',
        'styles.css': 'body {}',
      },
      specifier => `https://esm.sh/${specifier}`,
    )
    expect(linked.dependencies['@pages/index.tsx']).toEqual([
      '@components/card.tsx',
      '@styles.css',
    ])
    expect(linked.files['@pages/index.tsx']).not.toContain('https://esm.sh/../')
  })

  test('uses CLI page conventions for iframe projects', () => {
    expect(createIframeRouteManifest({
      'pages/index.tsx': '',
      'pages/about.tsx': '',
      'pages/docs/index.jsx': '',
      'pages/404.tsx': '',
      'components/card.tsx': '',
    })).toEqual({
      routes: {
        '/': '@pages/index.tsx',
        '/404': '@pages/404.tsx',
        '/about': '@pages/about.tsx',
        '/docs': '@pages/docs/index.jsx',
      },
      notFound: '@pages/404.tsx',
    })
  })

  test('keeps single-file iframe projects compatible', () => {
    expect(createIframeRouteManifest({ 'index.js': '' })).toEqual({
      routes: { '/': '@index.js' },
      notFound: undefined,
    })
  })

  test('shares the runtime CDN resolver', () => {
    const resolveModule = createEsmShResolver(
      { react: '19.1.0', '@scope/pkg': '^2.0.0' },
      CDN_HOST,
      true,
    )
    expect(resolveModule('react/jsx-runtime')).toBe('https://esm.sh/react@19.1.0/jsx-runtime?dev')
    expect(resolveModule('react-dom/client')).toBe('https://esm.sh/react-dom@19.2.0/client?dev&external=react')
    expect(resolveModule('@scope/pkg/subpath')).toBe('https://esm.sh/@scope/pkg@%5E2.0.0/subpath?external=react')
  })

  test('loads a route manifest with module entries', async () => {
    const manifest = await loadTestRouteManifest(root)
    expect(manifest.version).toBe(3)
    expect(manifest.base).toBe('/')
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
      resolveModule: createEsmShResolver(
        { react: '19.2.0' },
        'https://modules.example.test/',
        true,
      ),
      moduleUrl: testModuleUrl,
      assetUrl: () => '/assets/test',
      runtimeModuleUrl: '/_jar/runtime.js',
      development: true,
      refresh: false,
      platform: 'browser',
    })
    expect(compiled.code).toContain('https://modules.example.test/react@19.2.0/jsx-dev-runtime?dev')
  })

  test('uses project dependencies for the app and Devjar dependencies for its runtime', async () => {
    const requests: string[] = []
    const cdn = createHttpServer((request, response) => {
      const pathname = new URL(request.url || '/', 'http://localhost').pathname
      requests.push(pathname)
      response.writeHead(200, { 'Content-Type': 'text/javascript' })
      response.end(testCdnModule(pathname))
    })
    await new Promise<void>((resolvePromise, reject) => {
      cdn.once('error', reject)
      cdn.listen(0, '127.0.0.1', resolvePromise)
    })
    const address = cdn.address() as import('node:net').AddressInfo
    const projectRoot = await mkdtemp(join(tmpdir(), 'devjar-zero-config-'))
    try {
      await cp(root, projectRoot, { recursive: true })
      const indexPath = join(projectRoot, 'pages/index.tsx')
      await writeFile(indexPath, `import 'devjar'\n${await readFile(indexPath, 'utf8')}`)
      const packageJsonPath = join(projectRoot, 'package.json')
      const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'))
      packageJson.devjar = { cdn: 'https://modules.example.test/' }
      packageJson.dependencies['es-module-lexer'] = '9.9.9'
      await writeFile(packageJsonPath, JSON.stringify(packageJson))

      const result = await buildProject({
        root: projectRoot,
        outDir: 'dist',
        cdn: `http://127.0.0.1:${address.port}`,
        prerender: false,
        base: '/',
      })
      const manifest = JSON.parse(await readFile(join(result.outDir, 'manifest.json'), 'utf8'))
      const entry = await readFile(join(result.outDir, manifest.routes['/'].module), 'utf8')
      const document = await readFile(join(result.outDir, 'index.html'), 'utf8')
      expect(entry).toMatch(/\/_jar\/vendor\/[a-f0-9]{12}\/[a-f0-9]{12}\.js/)
      expect(entry).not.toContain('http://')
      expect(entry).not.toContain('https://')
      expect(entry).not.toContain('jsx-dev-runtime')
      expect(entry).not.toContain('?dev')
      expect(entry).not.toContain('modules.example.test')
      expect(document).not.toContain('http://')
      expect(document).not.toContain('https://')
      expect(requests.some(path => path.includes('/es-module-lexer@1.6.0'))).toBe(true)
      expect(requests.some(path => path.includes('/es-module-lexer@9.9.9'))).toBe(false)
    } finally {
      await new Promise<void>(resolvePromise => cdn.close(() => resolvePromise()))
      await rm(projectRoot, { recursive: true, force: true })
    }
  })

  test('loads the hosted dashboard example and its 404 page', async () => {
    const manifest = await loadTestRouteManifest(dashboardRoot)
    expect(manifest.routes['/projects'].page).toBe('pages/projects.tsx')
    expect(manifest.notFound?.page).toBe('pages/404.tsx')
  })

  test('normalizes and applies public base paths', () => {
    expect(normalizeBase('docs/preview')).toBe('/docs/preview/')
    expect(normalizeBase('/')).toBe('/')
    expect(withBase('/docs/', '/_jar/client.js')).toBe('/docs/_jar/client.js')
    expect(withoutBase('/docs/', '/docs/about')).toBe('/about')
    expect(withoutBase('/docs/', '/docs')).toBe('/')
    expect(withoutBase('/docs/', '/outside')).toBeUndefined()
    expect(() => normalizeBase('../docs')).toThrow('Invalid base path')
  })

  test('loads the website and its editable source files', async () => {
    const manifest = await loadTestRouteManifest(websiteRoot)
    expect(manifest.routes['/'].page).toBe('pages/index.tsx')

    const files = await collectProjectFiles(
      await realpath(websiteRoot),
      join(websiteRoot, 'pages/index.tsx'),
    )
    expect([...files].sort()).toEqual([
      'components/codesandbox.css',
      'components/codesandbox.tsx',
      'components/file-icon.tsx',
      'components/root-actions.tsx',
      'lib/demo-files.ts',
      'pages/index.tsx',
      'styles.css',
    ])
  })

  test('uses the project Tailwind version for the cached browser runtime', () => {
    expect(getTailwindBrowserUrl(
      { tailwindcss: '^4.1.0' },
      'https://modules.example.test/',
      true,
    )).toBe(
      'https://modules.example.test/@tailwindcss/browser@%5E4.1.0',
    )
    expect(getTailwindBrowserUrl({}, CDN_HOST, true)).toBeUndefined()
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
        resolveModule: createEsmShResolver({}, CDN_HOST, true),
        moduleUrl: testModuleUrl,
        assetUrl: () => '/assets/test',
        runtimeModuleUrl: '/_jar/runtime.js',
        development: true,
        refresh: false,
        platform: 'browser',
      })
      expect(compiled.code).toContain(`import("/modules/components/card.tsx")`)
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })

  test('ignores import-like text inside project source strings', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'devjar-source-strings-'))
    try {
      await mkdir(join(projectRoot, 'pages'))
      await mkdir(join(projectRoot, 'lib'))
      await writeFile(
        join(projectRoot, 'pages/index.tsx'),
        `import { example } from '../lib/example'
export default function Page() { return <pre>{example}</pre> }`,
      )
      await writeFile(
        join(projectRoot, 'lib/example.ts'),
        "export const example = `import Missing from '../components/missing'`",
      )

      const files = await collectProjectFiles(
        await realpath(projectRoot),
        join(projectRoot, 'pages/index.tsx'),
      )
      expect([...files].sort()).toEqual([
        'lib/example.ts',
        'pages/index.tsx',
      ])
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
      base: '/',
    })
    const base = `http://${server.host}:${server.port}`

    const shell = await fetch(`${base}/about`)
    expect(shell.status).toBe(200)
    expect(shell.headers.get('cross-origin-opener-policy')).toBe('same-origin')
    expect(shell.headers.get('cross-origin-embedder-policy')).toBe('credentialless')
    const shellSource = await shell.text()
    expect(shellSource).toContain('/_jar/client.js')
    expect(shellSource).toContain("import * as RefreshModule from 'react-refresh/runtime'")
    expect(shellSource).toContain('data-devjar-tailwind')
    expect(shellSource).toContain('https://esm.sh/@tailwindcss/browser@%5E4.1.0')
    expect(shellSource).toContain('Devjar could not start')
    expect(shellSource).toContain(`Devjar could not start:\\n\\n`)
    expect(shellSource).not.toContain('<iframe')
    expect(await (await fetch(`${base}/about`, { method: 'HEAD' })).text()).toBe('')
    const bootstrap = shellSource.match(/<script>\n([\s\S]+?)<\/script>/)?.[1]
    expect(() => new Function(bootstrap || '')).not.toThrow()

    const routes = await (await fetch(`${base}/_jar/routes.json`)).json()
    expect(routes.routes['/about'].page).toBe('pages/about.tsx')
    const pageModule = await (await fetch(`${base}${routes.routes['/about'].module}`)).text()
    expect(pageModule).toContain('/_jar/module?path=components%2Fshell.tsx')
    expect(pageModule).toContain('/_jar/module?path=styles.css')
    expect(pageModule).toContain('https://esm.sh/react@19.2.0/jsx-dev-runtime?dev')
    expect(pageModule).toContain('__jarRegisterModule')
    expect(pageModule).toContain('__jarRefreshRuntime')
    const sharedModule = await (await fetch(`${base}/_jar/module?path=components%2Fshell.tsx`)).text()
    expect(sharedModule).not.toContain('ReactNode')
    const client = await (await fetch(`${base}/_jar/client.js`)).text()
    await init
    expect(() => parse(client)).not.toThrow()
    expect(client).toContain('/_jar/routes.json')
    expect(client).toContain('modulepreload')
    expect(client).toContain('pointerover')
    expect(client).not.toContain('/_jar/project')
    expect(client).not.toContain('linkModules')
    expect(client).not.toContain('createElement("iframe")')
    expect(client).not.toContain('@tailwindcss/browser')
    expect(client).toContain('routeManifest.liveReload')
    expect(client).toContain('popstate')
    expect(client).toContain('history.pushState')
    expect(client).not.toContain('document.title = entry.page')

    const json = await fetch(`${base}/api/status.json`)
    expect(json.headers.get('content-type')).toContain('application/json')
    expect(await json.json()).toEqual({ ok: true })

    expect(await (await fetch(`${base}/api/message.txt`)).text()).toContain('Hello from Devjar')
    expect(await (await fetch(`${base}/hello.txt`)).text()).toContain('This file is public')
    expect((await fetch(`${base}/api/blocked.js`)).status).toBe(404)
    expect((await fetch(`${base}/api/status.json`, { method: 'POST' })).status).toBe(405)

    const transformAssetsResponse = await fetch(`${base}/_jar/transform-assets.json`)
    expect(transformAssetsResponse.headers.get('cache-control')).toBe('no-store')
    const transformAssets = await transformAssetsResponse.json()
    expect(transformAssets.worker).toMatch(/^assets\/transform-worker-[a-z0-9]+\.js$/)
    expect(transformAssets.wasm).toMatch(/^assets\/transform\.wasm32-wasi-[a-z0-9]+\.wasm$/)
    const worker = await fetch(`${base}/_jar/${transformAssets.worker}`)
    expect(worker.headers.get('content-type')).toContain('text/javascript')
    expect(worker.headers.get('cross-origin-embedder-policy')).toBe('credentialless')
    expect(worker.headers.get('cache-control')).toBe('public, max-age=31536000, immutable')
    const wasm = await fetch(`${base}/_jar/${transformAssets.wasm}`)
    expect(wasm.headers.get('content-type')).toBe('application/wasm')

    await server.close()
    await expect(server.close()).resolves.toBeUndefined()
  })

  test('sends a precise update for a changed refresh boundary', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'devjar-hmr-'))
    await mkdir(join(projectRoot, 'pages'))
    await mkdir(join(projectRoot, 'components'))
    await writeFile(join(projectRoot, 'components/icon.svg'), '<svg><title>Icon</title></svg>')
    await writeFile(join(projectRoot, 'styles.css'), `.hero { background: url('./components/icon.svg'); }`)
    await writeFile(
      join(projectRoot, 'pages/index.tsx'),
      `import { Card } from '../components/card'
import icon from '../components/icon.svg'
import '../styles.css'
export default function Page() { return <><img className="hero" src={icon} /><Card /></> }`,
    )
    const cardPath = join(projectRoot, 'components/card.tsx')
    await writeFile(cardPath, `export function Card() { return <p>one</p> }`)

    const hmrServer = await startDevServer({
      root: projectRoot,
      host: '127.0.0.1',
      port: 0,
      cdn: undefined,
      base: '/',
    })
    const base = `http://${hmrServer.host}:${hmrServer.port}`
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
    try {
      await new Promise(resolvePromise => setTimeout(resolvePromise, 100))
      const routes = await (await fetch(`${base}/_jar/routes.json`)).json()
      const pageModule = await (await fetch(`${base}${routes.routes['/'].module}`)).text()
      const cardModuleUrl = pageModule.match(/\/_jar\/module\?path=components%2Fcard\.tsx/)?.[0]
      const assetModuleUrl = pageModule.match(/\/_jar\/module\?path=components%2Ficon\.svg/)?.[0]
      const cssModuleUrl = pageModule.match(/\/_jar\/module\?path=styles\.css/)?.[0]
      expect(cardModuleUrl).toBeDefined()
      expect(assetModuleUrl).toBeDefined()
      expect(cssModuleUrl).toBeDefined()
      const cardModule = await (await fetch(`${base}${cardModuleUrl}`)).text()
      expect(cardModule).toContain('__jarRegisterModule')
      const assetModule = await (await fetch(`${base}${assetModuleUrl}`)).text()
      const assetUrl = assetModule.match(/"(\/_jar\/asset\?path=components%2Ficon\.svg&v=[a-f0-9]{10})"/)?.[1]
      expect(assetUrl).toBeDefined()
      const asset = await fetch(`${base}${assetUrl}`)
      expect(asset.headers.get('content-type')).toContain('image/svg+xml')
      expect(asset.headers.get('cache-control')).toBe('no-store')
      expect(await asset.text()).toContain('<title>Icon</title>')
      const cssModule = await (await fetch(`${base}${cssModuleUrl}`)).text()
      expect(cssModule).toContain('/_jar/asset?path=components%2Ficon.svg')

      const eventResponse = await fetch(`${base}/_jar/events`)
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
          url: '/_jar/module?path=components%2Fcard.tsx&v=1',
        }],
      })

      await writeFile(join(projectRoot, 'components/icon.svg'), '<svg><title>Updated</title></svg>')
      const assetChange = await Promise.race([
        readChangeEvent(reader),
        new Promise<never>((_resolve, reject) => {
          setTimeout(() => reject(new Error('Timed out waiting for asset HMR update')), 2_000)
        }),
      ])
      const { timestamp: assetTimestamp, ...assetChangeWithoutTimestamp } = assetChange
      expect(assetTimestamp).toBeNumber()
      expect(assetChangeWithoutTimestamp).toEqual({
        revision: routes.revision + 2,
        reload: false,
        routes: false,
        updates: [
          {
            path: 'styles.css',
            type: 'css',
            url: '/_jar/module?path=styles.css&v=1',
          },
          {
            path: 'pages/index.tsx',
            type: 'refresh',
            url: '/_jar/module?path=pages%2Findex.tsx&v=1',
          },
        ],
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
  let cdn: ReturnType<typeof createHttpServer> | undefined
  let server: Awaited<ReturnType<typeof startBuiltServer>> | undefined

  beforeAll(async () => {
    cdn = createHttpServer((request, response) => {
      response.writeHead(200, { 'Content-Type': 'text/javascript' })
      response.end(testCdnModule(new URL(request.url || '/', 'http://localhost').pathname))
    })
    await new Promise<void>((resolvePromise, reject) => {
      cdn!.once('error', reject)
      cdn!.listen(0, '127.0.0.1', resolvePromise)
    })
    const address = cdn.address() as import('node:net').AddressInfo
    projectRoot = await mkdtemp(join(tmpdir(), 'devjar-build-'))
    await cp(dashboardRoot, projectRoot, { recursive: true })
    const result = await buildProject({
      root: projectRoot,
      outDir: 'dist',
      cdn: `http://127.0.0.1:${address.port}`,
      prerender: false,
      base: '/preview/',
    })
    buildRoot = result.outDir
  })

  afterAll(async () => {
    await server?.close()
    if (cdn) await new Promise<void>(resolvePromise => cdn!.close(() => resolvePromise()))
    if (projectRoot) await rm(projectRoot, { recursive: true, force: true })
  })

  test('omits the unused Devjar runtime while writing the static site', async () => {
    const manifest = JSON.parse(await readFile(join(buildRoot, 'manifest.json'), 'utf8'))
    expect(Object.keys(manifest.routes).sort()).toEqual(['/', '/404', '/projects', '/settings'])
    expect(manifest.version).toBe(3)
    expect(manifest.base).toBe('/preview/')
    expect(manifest.liveReload).toBe(false)
    expect(manifest.routes['/'].module).toMatch(/^\/preview\/_jar\/modules\/.+\.js$/)
    expect(await readFile(join(buildRoot, '_jar/client.js'), 'utf8')).toContain('_jar/routes.json')
    expect(await readFile(join(buildRoot, '_jar/routes.json'), 'utf8')).toBe(JSON.stringify(manifest))
    const entryModule = await readFile(
      join(buildRoot, withoutBase(manifest.base, manifest.routes['/'].module)!),
      'utf8',
    )
    expect(entryModule).toMatch(/\/preview\/_jar\/vendor\/[a-f0-9]{12}\/[a-f0-9]{12}\.js/)
    expect(entryModule).not.toContain('http://')
    expect(entryModule).not.toContain('https://')
    expect(entryModule).not.toContain('jsx-dev-runtime')
    expect(entryModule).not.toContain('?dev')
    expect(entryModule).not.toContain('__jarRegisterModule')
    const builtHtml = await readFile(join(buildRoot, 'index.html'), 'utf8')
    expect(builtHtml).toContain('<title data-devjar-default>Devjar</title>')
    expect(builtHtml).toContain('<meta name="devjar-base" content="/preview/">')
    expect(builtHtml).toContain('src="/preview/_jar/client.js"')
    expect(builtHtml).toContain('data-devjar-tailwind')
    expect(builtHtml).not.toContain('react-refresh')
    expect(builtHtml).not.toContain('jsx-dev-runtime')
    expect(builtHtml).not.toContain('?dev')
    expect(builtHtml).not.toContain('/_jar/runtime.js')
    expect(builtHtml).not.toContain('es-module-lexer')
    const runtimeFiles = await readdir(join(buildRoot, '_jar'))
    expect(runtimeFiles).toContain('client.js')
    expect(runtimeFiles).toContain('vendor')
    expect(runtimeFiles).not.toContain('runtime.js')
    expect(runtimeFiles).not.toContain('transform-assets.json')
    expect(await readdir(join(buildRoot, '_jar/assets'))).toEqual([])
    expect(await readFile(join(buildRoot, 'api/projects.json'), 'utf8')).toContain('Mobile refresh')
    expect(await readFile(join(buildRoot, 'mark.svg'), 'utf8')).toContain('<svg')
  })

  test('refuses to clean an output directory outside the project', async () => {
    await expect(buildProject({
      root: projectRoot,
      outDir: '../outside',
      cdn: undefined,
      prerender: false,
      base: '/',
    })).rejects.toThrow(
      'The build output must be a directory inside the project root',
    )
  })

  test('serves prebuilt projects without development events', async () => {
    server = await startBuiltServer({ root: buildRoot, host: '127.0.0.1', port: 0 })
    const origin = `http://${server.host}:${server.port}`
    expect(server.base).toBe('/preview/')
    expect(server.devjarRuntime).toBe(false)
    expect((await fetch(origin)).status).toBe(404)
    const document = await fetch(`${origin}/preview/`)
    expect(document.headers.get('cross-origin-opener-policy')).toBeNull()
    expect(document.headers.get('cross-origin-embedder-policy')).toBeNull()

    const shell = await (await fetch(`${origin}/preview/projects`)).text()
    expect(shell).toMatch(/\/preview\/_jar\/vendor\/[a-f0-9]{12}\/[a-f0-9]{12}\.js/)
    expect(shell).not.toContain('http://')
    expect(shell).not.toContain('https://')
    expect(shell).not.toContain('?dev')
    const vendorPath = shell.match(/\/preview\/_jar\/vendor\/[a-f0-9]{12}\/[a-f0-9]{12}\.js/)![0]
    const vendorModule = await fetch(`${origin}${vendorPath}`)
    expect(vendorModule.status).toBe(200)
    expect(vendorModule.headers.get('cache-control')).toBe('public, max-age=31536000, immutable')
    const routes = await (await fetch(`${origin}/preview/_jar/routes.json`)).json()
    expect(routes.routes['/projects'].page).toBe('pages/projects.tsx')
    expect(routes.liveReload).toBe(false)
    expect(routes.notFound.page).toBe('pages/404.tsx')
    const projectModule = await fetch(`${origin}${routes.routes['/projects'].module}`)
    expect(projectModule.status).toBe(200)
    expect(projectModule.headers.get('content-type')).toContain('text/javascript')
    const transformAssetsResponse = await fetch(`${origin}/preview/_jar/transform-assets.json`)
    expect(transformAssetsResponse.status).toBe(404)
    expect((await fetch(`${origin}/preview/_jar/events`)).status).toBe(404)
    expect(await (await fetch(`${origin}/preview/api/projects.json`)).json()).toHaveLength(4)
    expect(await (await fetch(`${origin}/preview/mark.svg`)).text()).toContain('<svg')

    await server.close()
  })
})

describe('static export', () => {
  test('writes rendered page content and styles into route HTML', async () => {
    const cdn = createHttpServer((request, response) => {
      response.writeHead(200, { 'Content-Type': 'text/javascript' })
      response.end(testCdnModule(new URL(request.url || '/', 'http://localhost').pathname))
    })
    await new Promise<void>((resolvePromise, reject) => {
      cdn.once('error', reject)
      cdn.listen(0, '127.0.0.1', resolvePromise)
    })
    const address = cdn.address() as import('node:net').AddressInfo
    const projectRoot = await mkdtemp(join(tmpdir(), 'devjar-static-export-'))
    try {
      await mkdir(join(projectRoot, 'pages'))
      await mkdir(join(projectRoot, 'pages/guides'))
      await mkdir(join(projectRoot, 'assets'))
      await writeFile(join(projectRoot, 'package.json'), JSON.stringify({
        dependencies: { react: '19.2.0', 'react-dom': '19.2.0' },
      }))
      await writeFile(
        join(projectRoot, 'pages/index.tsx'),
        `import '../styles.css'
import logo from '../assets/logo.svg'
import { DevJar } from 'devjar'
export default function Page() {
  return <>
    <title>Static title</title>
    <meta name="description" content="Static description" />
    <main className="page"><h1>Static now</h1><img src={logo} alt="Logo" /><DevJar files={{ 'pages/index.jsx': 'export default function Page() {}' }} /></main>
  </>
}`,
      )
      await writeFile(
        join(projectRoot, 'pages/guides/about.tsx'),
        `export default function About() { return <><title>About title</title><h1>About statically rendered</h1></> }`,
      )
      await writeFile(
        join(projectRoot, 'pages/404.tsx'),
        `export default function NotFound() { return <h1>Static not found</h1> }`,
      )
      await writeFile(
        join(projectRoot, 'styles.css'),
        `.page { color: black; background-image: url('./assets/background.png'); }
@font-face { font-family: Body; src: url("./assets/body.woff2?#iefix") format("woff2"); }`,
      )
      await writeFile(join(projectRoot, 'assets/logo.svg'), '<svg><circle r="4" /></svg>')
      await writeFile(join(projectRoot, 'assets/background.png'), Buffer.from('background'))
      await writeFile(join(projectRoot, 'assets/body.woff2'), Buffer.from('font'))

      const result = await buildProject({
        root: projectRoot,
        outDir: 'dist',
        cdn: `http://127.0.0.1:${address.port}`,
        prerender: true,
        base: '/',
      })
      expect(result.devjarRuntime).toBe(true)
      const document = await readFile(join(result.outDir, 'index.html'), 'utf8')
      expect(document).toContain('<head><meta charset="utf-8"')
      expect(document).toContain('<title>Static title</title><meta name="description" content="Static description">')
      expect(document).not.toContain('<div id="__reactRoot"><title>')
      expect(document).toContain('<main class="page"><h1>Static now</h1>')
      expect(document).toMatch(/<img src="\/_jar\/assets\/logo-[a-f0-9]{10}\.svg" alt="Logo"/)
      expect(document).toContain('<iframe')
      expect(document).toMatch(/background-image: url\('\/_jar\/assets\/background-[a-f0-9]{10}\.png'\)/)
      expect(document).toMatch(/src: url\("\/_jar\/assets\/body-[a-f0-9]{10}\.woff2\?#iefix"\)/)
      expect(document).toContain('<div id="__reactRoot">')
      const aboutDocument = await readFile(join(result.outDir, 'guides/about/index.html'), 'utf8')
      expect(aboutDocument).toContain('<title>About title</title>')
      expect(aboutDocument).toContain('<h1>About statically rendered</h1>')
      const notFoundDocument = await readFile(join(result.outDir, '404.html'), 'utf8')
      expect(notFoundDocument).toContain('<title data-devjar-default>Devjar</title>')
      expect(notFoundDocument).toContain('<h1>Static not found</h1>')
      expect(await readFile(join(result.outDir, '404/index.html'), 'utf8'))
        .toContain('<h1>Static not found</h1>')
      expect(await readFile(join(result.outDir, '_jar/client.js'), 'utf8'))
        .toContain('hydrateRoot')
      const manifest = JSON.parse(await readFile(join(result.outDir, 'manifest.json'), 'utf8'))
      const pageModule = await readFile(join(result.outDir, manifest.routes['/'].module), 'utf8')
      expect(pageModule).toContain('/_jar/runtime.js')
      expect(pageModule).not.toContain(`${address.port}/devjar`)
      const assetFiles = await readdir(join(result.outDir, '_jar/assets'))
      expect(assetFiles.some(file => /^logo-[a-f0-9]{10}\.svg$/.test(file))).toBe(true)
      expect(assetFiles.some(file => /^background-[a-f0-9]{10}\.png$/.test(file))).toBe(true)
      expect(assetFiles.some(file => /^body-[a-f0-9]{10}\.woff2$/.test(file))).toBe(true)
      const transformAssets = JSON.parse(
        await readFile(join(result.outDir, '_jar/transform-assets.json'), 'utf8'),
      )
      expect(Object.values(transformAssets)).toHaveLength(4)
      const builtServer = await startBuiltServer({
        root: result.outDir,
        host: '127.0.0.1',
        port: 0,
      })
      try {
        expect(builtServer.devjarRuntime).toBe(true)
        const response = await fetch(`http://${builtServer.host}:${builtServer.port}`)
        expect(response.headers.get('cross-origin-opener-policy')).toBe('same-origin')
        expect(response.headers.get('cross-origin-embedder-policy')).toBe('credentialless')
      } finally {
        await builtServer.close()
      }
    } finally {
      await new Promise<void>(resolvePromise => cdn.close(() => resolvePromise()))
      await rm(projectRoot, { recursive: true, force: true })
    }
  })
})
