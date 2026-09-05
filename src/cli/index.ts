import { createReadStream, watch } from 'node:fs'
import { cp, mkdir, readdir, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { dirname, extname, join, normalize, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CDN_HOST, createEsmShResolver, normalizeCdnHost } from '../cdn'
import {
  builtAssetUrl,
  builtModuleUrl,
  collectProjectFiles,
  collectPackageImports,
  compileProjectModule,
  devAssetUrl,
  DevModuleGraph,
  isStaticAsset,
  moduleAssetName,
  staticAssetExtensions,
  staticAssetName,
  usesDevjarRuntime,
} from './modules'
import type { HmrChange, RouteEntry, RouteManifest } from './protocol'
import {
  normalizeBase,
  normalizeRoute,
  routeFromPagePath,
  sourceExtensions,
  withBase,
  withoutBase,
} from '../project'
import { getTailwindBrowserUrl, getTailwindBuildUrls } from '../tailwind'
import { prerender, type PrerenderedRoute } from './prerender'
import { compileTailwind } from './tailwind-build'
import { vendorModules } from './vendor'
import { LocalPackages } from './local-packages'

// Stable identities for vendoring; these URLs are loaded from disk, never fetched.
const localPackagePrefix = 'https://local.devjar.invalid/_jar/local'

type PackageJson = {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

export type DevServerOptions = {
  root: string
  host: string
  port: number
  cdn: string | undefined
  base: string
}

export type BuildOptions = {
  root: string
  outDir: string
  cdn: string | undefined
  prerender: boolean
  exclude: string[]
  base: string
}

export type StartServerOptions = {
  root: string
  host: string
  port: number
}

export type LoadRouteManifestOptions = {
  liveReload: boolean
  revision: number
  base: string
  moduleUrl: (projectPath: string) => string
}

function isInside(root: string, path: string) {
  const pathFromRoot = relative(root, path)
  return pathFromRoot === '' || (!pathFromRoot.startsWith(`..${sep}`) && pathFromRoot !== '..')
}

async function fileExists(path: string) {
  try {
    return (await stat(path)).isFile()
  } catch {
    return false
  }
}

async function directoryExists(path: string) {
  try {
    return (await stat(path)).isDirectory()
  } catch {
    return false
  }
}

async function existingDirectory(path: string): Promise<string> {
  if (await directoryExists(path)) return realpath(path)
  const parent = dirname(path)
  if (parent === path) return path
  return existingDirectory(parent)
}

async function runtimeRoot() {
  const moduleRoot = fileURLToPath(new URL('.', import.meta.url))
  return await fileExists(join(moduleRoot, 'index.js'))
    ? moduleRoot
    : resolve(moduleRoot, '../../dist')
}

async function readPackage(root: string): Promise<PackageJson> {
  try {
    return JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {}
    throw error
  }
}

function packageDependencies(packageJson: PackageJson) {
  return {
    ...packageJson.devDependencies,
    ...packageJson.dependencies,
  }
}

async function readDevjarDependencies(assetsRoot: string) {
  const packageJson = await readPackage(dirname(assetsRoot))
  const esModuleLexer = packageJson.dependencies?.['es-module-lexer']
  if (!esModuleLexer) {
    throw new Error('Devjar is missing its es-module-lexer dependency')
  }
  return { 'es-module-lexer': esModuleLexer }
}

function resolveCdn(override: string | undefined) {
  return normalizeCdnHost(override || CDN_HOST)
}

export async function loadRouteManifest(
  root: string,
  options: LoadRouteManifestOptions,
): Promise<RouteManifest> {
  root = await realpath(root)
  return createRouteManifest(root, await discoverRoutes(root, []), options)
}

function createRouteManifest(
  root: string,
  discovered: Awaited<ReturnType<typeof discoverRoutes>>,
  options: LoadRouteManifestOptions,
): RouteManifest {
  const routes: Record<string, RouteEntry> = {}
  for (const [route, page] of discovered.routes) {
    const projectPath = relative(root, page).split(sep).join('/')
    routes[route] = { module: options.moduleUrl(projectPath), page: projectPath }
  }

  const notFoundPath = discovered.notFound
    ? relative(root, discovered.notFound).split(sep).join('/')
    : undefined

  return {
    version: 3,
    base: options.base,
    liveReload: options.liveReload,
    revision: options.revision,
    routes,
    notFound: notFoundPath
      ? { module: options.moduleUrl(notFoundPath), page: notFoundPath }
      : undefined,
  }
}

const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  // Safari does not support COEP credentialless, which leaves SharedArrayBuffer unavailable.
  'Cross-Origin-Embedder-Policy': 'require-corp',
}
const noStore = 'no-store'
const immutableAsset = 'public, max-age=31536000, immutable'

function sendResponse(
  request: IncomingMessage,
  response: ServerResponse,
  status: number,
  type: string,
  body: string | Buffer,
  headers: Record<string, string>,
) {
  response.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': noStore,
    ...headers,
  })
  response.end(request.method === 'HEAD' ? undefined : body)
}

type HtmlOptions = {
  resolveModule: (specifier: string) => string
  resolveRuntimeModule: (specifier: string) => string
  tailwindUrl: string | undefined
  tailwindStylesheetUrl: string | undefined
  base: string
  clientUrl: string
  runtimeUrl: string
  devjarRuntime: boolean
  liveReload: boolean
  head: string
  content: string
  styles: string
}

function html(options: HtmlOptions) {
  const imports = {
    react: options.resolveModule('react'),
    'react-dom': options.resolveModule('react-dom'),
    'react/jsx-runtime': options.resolveModule('react/jsx-runtime'),
    'react-dom/client': options.resolveModule('react-dom/client'),
    ...(options.devjarRuntime
      ? {
          'es-module-lexer': options.resolveRuntimeModule('es-module-lexer'),
          devjar: options.runtimeUrl,
        }
      : {}),
    ...(options.liveReload
      ? {
          'react/jsx-dev-runtime': options.resolveModule('react/jsx-dev-runtime'),
          'react-refresh/runtime': options.resolveRuntimeModule('react-refresh/runtime'),
        }
      : {}),
  }
  const tailwindPreload = options.tailwindUrl
    ? `<link rel="modulepreload" href="${options.tailwindUrl}">`
    : ''
  const tailwindScript = options.tailwindUrl
    ? `<script data-devjar-tailwind type="module" src="${options.tailwindUrl}"></script>`
    : ''
  const tailwindStylesheet = options.tailwindStylesheetUrl
    ? `<link data-devjar-tailwind rel="stylesheet" href="${options.tailwindStylesheetUrl}">`
    : ''
  const clientScript = options.liveReload
    ? `<script type="module">
import * as RefreshModule from 'react-refresh/runtime'
const RefreshRuntime = RefreshModule.default || RefreshModule
RefreshRuntime.injectIntoGlobalHook(globalThis)
globalThis.__jarRefreshRuntime = RefreshRuntime
await import(${JSON.stringify(options.clientUrl)})
</script>`
    : `<script type="module" src="${options.clientUrl}"></script>`
  const staticStyles = options.styles
    ? `<style data-devjar-static>${options.styles.replace(/<\/style/gi, '<\\/style')}</style>`
    : ''
  const documentHead = /<title(?:\s|>)/i.test(options.head)
    ? options.head
    : `<title data-devjar-default>Devjar</title>${options.head}`
  const errorOverlay = options.liveReload
    ? `<pre id="__jarError" class="devjar-error" hidden></pre><script>
const errorRoot = document.getElementById('__jarError')
const showBootstrapError = value => {
  errorRoot.hidden = false
  errorRoot.textContent = 'Devjar could not start:\\n\\n' + value
}
addEventListener('error', event => showBootstrapError(event.message || 'A browser module failed to load'))
addEventListener('unhandledrejection', event => showBootstrapError(event.reason?.stack || event.reason || 'An asynchronous module failed'))
</script>`
    : ''
  const errorStyles = options.liveReload
    ? '.devjar-error{box-sizing:border-box;position:fixed;z-index:10;inset:auto 0 0;margin:0;padding:6px 12px;max-height:25vh;overflow:auto;border:0;border-radius:0;background:#fff7f6;color:#9f2d20;font:11px/1.4 ui-monospace,monospace;white-space:pre-wrap}'
    : ''
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="devjar-base" content="${options.base}">${documentHead}${tailwindPreload}<script type="importmap">${JSON.stringify({ imports })}</script>
<style>html,body,#root,#__reactRoot{width:100%;min-height:100%;margin:0}${errorStyles}</style>${staticStyles}
${tailwindStylesheet}</head><body><div id="root"><div id="__reactRoot">${options.content}</div></div>${errorOverlay}${tailwindScript}${clientScript}</body></html>`
}

const contentTypes: Record<string, string> = {
  '.avif': 'image/avif',
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.ogg': 'audio/ogg',
  '.otf': 'font/otf',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
  '.wav': 'audio/wav',
  '.webm': 'video/webm',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

async function serveResponseFile(
  request: IncomingMessage,
  response: ServerResponse,
  root: string,
  requestPath: string,
  allowed: Set<string> | undefined,
  cacheControl: string,
  headers: Record<string, string>,
) {
  const path = resolve(root, `.${normalize('/' + requestPath)}`)
  const extension = extname(path).toLowerCase()
  if (!isInside(root, path) || (allowed && !allowed.has(extension))) return false
  if (!(await fileExists(path))) return false
  const canonicalRoot = await realpath(root)
  const canonicalPath = await realpath(path)
  if (!isInside(canonicalRoot, canonicalPath)) return false
  const info = await stat(canonicalPath)
  response.writeHead(200, {
    'Content-Type': contentTypes[extension] || 'application/octet-stream',
    'Content-Length': info.size,
    'Cache-Control': cacheControl,
    ...headers,
  })
  if (request.method === 'HEAD') response.end()
  else createReadStream(canonicalPath).pipe(response)
  return true
}

function createResponder(headers: Record<string, string>) {
  return {
    send(
      request: IncomingMessage,
      response: ServerResponse,
      status: number,
      type: string,
      body: string | Buffer,
    ) {
      sendResponse(request, response, status, type, body, headers)
    },
    serveFile(
      request: IncomingMessage,
      response: ServerResponse,
      root: string,
      requestPath: string,
      allowed: Set<string> | undefined,
      cacheControl: string,
    ) {
      return serveResponseFile(
        request,
        response,
        root,
        requestPath,
        allowed,
        cacheControl,
        headers,
      )
    },
  }
}

export async function startDevServer(options: DevServerOptions) {
  const root = await realpath(resolve(options.root))
  const host = options.host
  const port = options.port
  const base = normalizeBase(options.base)
  const events = new Set<ServerResponse>()
  const assetsRoot = await runtimeRoot()
  const devjarDependencies = await readDevjarDependencies(assetsRoot)
  const modules = new DevModuleGraph(base)
  const { send, serveFile } = createResponder(isolationHeaders)
  let revision = 0
  let localReloadTimer: NodeJS.Timeout | undefined
  const localPackages = new LocalPackages({
    root,
    prefix: withBase(base, '/_jar/local'),
    serverPrefix: withBase(base, '/_jar/local'),
    cdn: resolveCdn(options.cdn),
    development: true,
    onChange: () => {
      clearTimeout(localReloadTimer)
      localReloadTimer = setTimeout(() => {
        revision++
        const change: HmrChange = { revision, reload: true, routes: false, timestamp: Date.now(), updates: [] }
        for (const response of events) response.write(`event: change\ndata: ${JSON.stringify(change)}\n\n`)
      }, 40)
    },
  })

  if (!(await fileExists(join(root, 'pages/index.tsx')))
    && !(await fileExists(join(root, 'pages/index.ts')))
    && !(await fileExists(join(root, 'pages/index.jsx')))
    && !(await fileExists(join(root, 'pages/index.js')))) {
    throw new Error(`No index page found in ${join(root, 'pages')}.\nCreate pages/index.tsx (or .ts, .jsx, .js), or pass your project directory to devjar dev.`)
  }

  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`)
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.writeHead(405, { Allow: 'GET, HEAD' })
        response.end('Method not allowed')
        return
      }
      const requestPath = withoutBase(base, url.pathname)
      if (!requestPath) {
        send(request, response, 404, 'text/plain; charset=utf-8', 'Not found')
        return
      }
      if (requestPath === '/_jar/events') {
        response.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        })
        if (request.method === 'HEAD') {
          response.end()
          return
        }
        response.write(': connected\n\n')
        events.add(response)
        request.on('close', () => events.delete(response))
        return
      }
      if (requestPath === '/_jar/routes.json') {
        try {
          const manifest = await loadRouteManifest(root, {
            liveReload: true,
            revision,
            base,
            moduleUrl: modules.moduleUrl,
          })
          send(request, response, 200, 'application/json; charset=utf-8', JSON.stringify(manifest))
        } catch (error) {
          send(request, response, 500, 'application/json; charset=utf-8', JSON.stringify({ error: error instanceof Error ? error.message : String(error) }))
        }
        return
      }
      if (requestPath.startsWith('/_jar/local/')) {
        const resource = await localPackages.load(url)
        send(request, response, 200, resource.contentType, resource.contents)
        return
      }
      if (requestPath === '/_jar/module') {
        const projectPath = url.searchParams.get('path')
        if (!projectPath) {
          send(request, response, 400, 'text/plain; charset=utf-8', 'Module path is required')
          return
        }
        try {
          const compiled = await compileProjectModule({
            root,
            projectPath,
            resolveModule: specifier => localPackages.resolve(specifier, 'browser', root),
            moduleUrl: modules.moduleUrl,
            assetUrl: (projectPath, contents) => devAssetUrl(projectPath, contents, base),
            runtimeModuleUrl: withBase(base, '/_jar/runtime.js'),
            development: true,
            refresh: true,
            platform: 'browser',
          })
          modules.update(projectPath, compiled)
          send(request, response, 200, 'text/javascript; charset=utf-8', compiled.code)
        } catch (error) {
          send(request, response, 404, 'text/javascript; charset=utf-8', `throw new Error(${JSON.stringify(error instanceof Error ? error.message : String(error))})`)
        }
        return
      }
      if (requestPath === '/_jar/asset') {
        const projectPath = url.searchParams.get('path')
        if (!projectPath || !await serveFile(
          request,
          response,
          root,
          projectPath,
          new Set(staticAssetExtensions),
          noStore,
        )) send(request, response, 404, 'text/plain', 'Not found')
        return
      }
      if (requestPath === '/_jar/runtime.js') {
        if (!await serveFile(request, response, assetsRoot, 'index.js', undefined, noStore)) send(request, response, 500, 'text/plain', 'Devjar runtime is missing')
        return
      }
      if (requestPath.startsWith('/_jar/')) {
        const cacheControl = requestPath.startsWith('/_jar/assets/')
          || requestPath.startsWith('/_jar/vendor/')
          ? immutableAsset
          : noStore
        if (!await serveFile(request, response, assetsRoot, requestPath.slice('/_jar/'.length), undefined, cacheControl)) send(request, response, 404, 'text/plain', 'Not found')
        return
      }
      if (requestPath.startsWith('/api/')) {
        if (!await serveFile(request, response, join(root, 'api'), requestPath.slice('/api/'.length), new Set(['.json', '.txt']), noStore)) {
          send(request, response, 404, 'text/plain; charset=utf-8', 'Not found')
        }
        return
      }
      if (await serveFile(request, response, join(root, 'public'), requestPath.slice(1), undefined, noStore)) return
      const packageJson = await readPackage(root)
      const dependencies = packageDependencies(packageJson)
      const cdn = resolveCdn(options.cdn)
      send(
        request,
        response,
        200,
        'text/html; charset=utf-8',
        html(
          {
            resolveModule: specifier => localPackages.resolve(specifier, 'browser', root),
            resolveRuntimeModule: createEsmShResolver({
              ...dependencies,
              ...devjarDependencies,
            }, cdn, true),
            tailwindUrl: getTailwindBrowserUrl(dependencies, cdn, true),
            tailwindStylesheetUrl: undefined,
            base,
            clientUrl: withBase(base, '/_jar/client.js'),
            runtimeUrl: withBase(base, '/_jar/runtime.js'),
            devjarRuntime: true,
            liveReload: true,
            head: '',
            content: '',
            styles: '',
          },
        ),
      )
    } catch (error) {
      send(request, response, 500, 'text/plain; charset=utf-8', error instanceof Error ? error.stack || error.message : String(error))
    }
  })

  let timer: NodeJS.Timeout | undefined
  let pendingTimestamp = 0
  const pendingFiles = new Set<string>()
  const watcher = watch(root, { recursive: true }, (_event, filename) => {
    if (!filename || /(?:^|[/\\])(?:\.git|node_modules|dist)(?:[/\\]|$)/.test(filename)) return
    if (!pendingFiles.size) pendingTimestamp = Date.now()
    pendingFiles.add(filename.split(sep).join('/'))
    clearTimeout(timer)
    timer = setTimeout(() => {
      const changedFiles = [...pendingFiles]
      pendingFiles.clear()
      const timestamp = pendingTimestamp
      pendingTimestamp = 0
      let reload = changedFiles.includes('package.json')
      const routes = changedFiles.some(filename => (
        filename.startsWith('pages/') && routeFromPagePath(filename.slice('pages/'.length)) !== undefined
      ))
      const invalidation = modules.invalidate(changedFiles)
      reload ||= invalidation.reload
      if (!reload && !routes && !invalidation.invalidated) return
      revision++
      const change: HmrChange = {
        revision,
        reload,
        routes,
        timestamp,
        updates: invalidation.updates,
      }
      for (const response of events) {
        response.write(`event: change\ndata: ${JSON.stringify(change)}\n\n`)
      }
    }, 40)
  })

  try {
    await new Promise<void>((resolvePromise, reject) => {
      server.once('error', reject)
      server.listen(port, host, resolvePromise)
    })
  } catch (error) {
    watcher.close()
    localPackages.close()
    throw error
  }

  let closePromise: Promise<void> | undefined
  const close = () => {
    if (closePromise) return closePromise
    closePromise = new Promise<void>((resolvePromise, reject) => {
      clearTimeout(timer)
      clearTimeout(localReloadTimer)
      localPackages.close()
      watcher.close()
      for (const response of events) response.end()
      events.clear()

      const forceClose = setTimeout(() => server.closeAllConnections(), 5_000)
      forceClose.unref()
      server.close(error => {
        clearTimeout(forceClose)
        if (error && (error as NodeJS.ErrnoException).code !== 'ERR_SERVER_NOT_RUNNING') reject(error)
        else resolvePromise()
      })
      server.closeIdleConnections()
    })
    return closePromise
  }

  return {
    host,
    port: (server.address() as import('node:net').AddressInfo).port,
    root,
    base,
    close,
  }
}

async function discoverRoutes(root: string, exclude: string[]) {
  const pagesRoot = join(root, 'pages')
  if (!await directoryExists(pagesRoot)) {
    throw new Error(`No pages directory found in ${root}.\nCreate pages/index.tsx, or pass your project directory to devjar build.`)
  }

  const excludedPaths = exclude.map(path => {
    const excluded = resolve(root, path)
    if (!isInside(pagesRoot, excluded)) {
      throw new Error(`Excluded paths must be page files or directories inside pages/: ${path}`)
    }
    return excluded
  })
  for (const path of excludedPaths) {
    try {
      await stat(path)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      throw new Error(`Exclude path not found: ${relative(root, path)}. Use a project-relative page file or directory.`)
    }
  }
  const isExcluded = (path: string) => excludedPaths.some(excluded => isInside(excluded, path))
  const files: string[] = []
  const visit = async (directory: string) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.name.startsWith('_') || isExcluded(path)) continue
      if (entry.isDirectory()) await visit(path)
      else if (entry.isFile() && sourceExtensions.includes(extname(entry.name))) files.push(path)
    }
  }
  if (!isExcluded(pagesRoot)) await visit(pagesRoot)

  const routes = new Map<string, string>()
  let notFound: string | undefined
  for (const path of files.sort()) {
    const pagePath = relative(pagesRoot, path).split(sep).join('/')
    if (pagePath.slice(0, -extname(pagePath).length) === '404') notFound = path
    const route = routeFromPagePath(pagePath)
    if (!route) continue
    if (routes.has(route)) {
      throw new Error(`Multiple pages resolve to ${route}: ${relative(root, routes.get(route)!)} and ${relative(root, path)}`)
    }
    routes.set(route, path)
  }

  if (!routes.has('/')) {
    throw new Error(`No index page found in ${pagesRoot}.\nCreate pages/index.tsx (or .ts, .jsx, .js) to define the home page.`)
  }
  return { routes, notFound }
}

async function copyApiFiles(source: string, destination: string) {
  if (!await directoryExists(source)) return
  for (const entry of await readdir(source, { withFileTypes: true })) {
    const sourcePath = join(source, entry.name)
    const destinationPath = join(destination, entry.name)
    if (entry.isDirectory()) await copyApiFiles(sourcePath, destinationPath)
    else if (entry.isFile() && (extname(entry.name) === '.json' || extname(entry.name) === '.txt')) {
      await mkdir(dirname(destinationPath), { recursive: true })
      await cp(sourcePath, destinationPath)
    }
  }
}

async function copyPublicFiles(source: string, destination: string) {
  if (!await directoryExists(source)) return
  for (const entry of await readdir(source, { withFileTypes: true })) {
    await cp(join(source, entry.name), join(destination, entry.name), {
      recursive: entry.isDirectory(),
    })
  }
}

type TransformAssetManifest = {
  worker: string
  binding: string
  wasm: string
  wasiWorker: string
}

async function readTransformAssetManifest(source: string): Promise<TransformAssetManifest> {
  const manifest: unknown = JSON.parse(await readFile(join(source, 'transform-assets.json'), 'utf8'))
  if (typeof manifest !== 'object' || manifest === null) {
    throw new Error('Devjar transform asset manifest is invalid')
  }
  const value = manifest as Record<string, unknown>
  const names = ['worker', 'binding', 'wasm', 'wasiWorker'] as const
  const assetPath = /^assets\/[a-z0-9.-]+-[a-z0-9]+\.(?:js|wasm)$/
  if (!names.every(name => typeof value[name] === 'string' && assetPath.test(value[name]))) {
    throw new Error('Devjar transform asset manifest is invalid')
  }
  return Object.fromEntries(names.map(name => [name, value[name]])) as TransformAssetManifest
}

function withoutSourceMapReference(contents: Buffer) {
  return Buffer.from(
    contents.toString('utf8')
      .replace(/^\s*\/\/[#@]\s*sourceMappingURL=.*$/gm, '')
      .replace(/\/\*[#@]\s*sourceMappingURL=.*?\*\//gs, ''),
  )
}

async function copyRuntimeAssets(destination: string, devjarRuntime: boolean) {
  const source = await runtimeRoot()
  await mkdir(destination, { recursive: true })
  const clientContents = await readFile(join(source, 'client.js'))
  const clientAsset = `assets/${staticAssetName('client.js', clientContents)}`
  await mkdir(join(destination, 'assets'), { recursive: true })
  await writeFile(join(destination, clientAsset), clientContents)
  if (!devjarRuntime) return { clientAsset, runtimeAsset: undefined }

  const transformAssets = await readTransformAssetManifest(source)
  const runtimeContents = withoutSourceMapReference(await readFile(join(source, 'index.js')))
  const runtimeAsset = staticAssetName('runtime.js', runtimeContents)
  const assets: Array<[string, string]> = [
    ['index.js', runtimeAsset],
    ['transform-assets.json', 'transform-assets.json'],
    ...Object.values(transformAssets).map(path => [path, path] as [string, string]),
  ]
  const entryFiles = new Set(assets.map(([sourceName]) => sourceName))
  for (const name of await readdir(source)) {
    if (name.endsWith('.js')
      && !entryFiles.has(name)
      && name !== 'bin.js'
      && name !== 'client.js') {
      assets.push([name, name])
    }
  }
  for (const [sourceName, destinationName] of assets) {
    const sourcePath = join(source, sourceName)
    if (!await fileExists(sourcePath)) throw new Error(`Devjar runtime asset is missing: ${sourceName}`)
    await mkdir(dirname(join(destination, destinationName)), { recursive: true })
    if (sourceName.endsWith('.js') && !sourceName.startsWith('assets/')) {
      const contents = sourceName === 'index.js'
        ? runtimeContents
        : withoutSourceMapReference(await readFile(sourcePath))
      await writeFile(join(destination, destinationName), contents)
    } else {
      await cp(sourcePath, join(destination, destinationName))
    }
  }
  return { clientAsset, runtimeAsset }
}

function routeHtmlPath(outDir: string, route: string) {
  return route === '/'
    ? join(outDir, 'index.html')
    : join(outDir, route.slice(1), 'index.html')
}

async function writeRouteHtml(
  outDir: string,
  route: string,
  rendered: PrerenderedRoute,
  options: Pick<
    HtmlOptions,
    | 'resolveModule'
    | 'resolveRuntimeModule'
    | 'tailwindUrl'
    | 'tailwindStylesheetUrl'
    | 'base'
    | 'clientUrl'
    | 'runtimeUrl'
    | 'devjarRuntime'
  >,
) {
  const outputPath = routeHtmlPath(outDir, route)
  await mkdir(dirname(outputPath), { recursive: true })
  const document = html({
    resolveModule: options.resolveModule,
    resolveRuntimeModule: options.resolveRuntimeModule,
    tailwindUrl: options.tailwindUrl,
    tailwindStylesheetUrl: options.tailwindStylesheetUrl,
    base: options.base,
    clientUrl: options.clientUrl,
    runtimeUrl: options.runtimeUrl,
    devjarRuntime: options.devjarRuntime,
    liveReload: false,
    head: rendered.head,
    content: rendered.markup,
    styles: rendered.styles,
  })
  await writeFile(outputPath, document)
  if (route === '/404') await writeFile(join(outDir, '404.html'), document)
}

export async function buildProject(options: BuildOptions) {
  const root = await realpath(resolve(options.root))
  const cdn = resolveCdn(options.cdn)
  const createLocalPackages = (serverPrefix: string) => new LocalPackages({
    root,
    prefix: localPackagePrefix,
    serverPrefix,
    cdn,
    development: false,
    onChange: undefined,
  })
  if (!options.prerender) {
    return buildProjectWithLocalPackages(options, createLocalPackages(localPackagePrefix))
  }
  let localPackages: LocalPackages
  const server = createServer(async (request, response) => {
    try {
      const resource = await localPackages.load(new URL(request.url || '/', 'http://localhost'))
      response.writeHead(200, { 'Content-Type': resource.contentType })
      response.end(resource.contents)
    } catch (error) {
      response.writeHead(404)
      response.end(error instanceof Error ? error.message : String(error))
    }
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const port = (server.address() as import('node:net').AddressInfo).port
  localPackages = createLocalPackages(`http://127.0.0.1:${port}/_jar/local`)
  try {
    return await buildProjectWithLocalPackages(options, localPackages)
  } finally {
    localPackages.close()
    await new Promise<void>((resolve, reject) => {
      server.close(error => {
        if (error && (error as NodeJS.ErrnoException).code !== 'ERR_SERVER_NOT_RUNNING') reject(error)
        else resolve()
      })
      server.closeAllConnections()
    })
  }
}

async function buildProjectWithLocalPackages(options: BuildOptions, localPackages: LocalPackages) {
  const root = await realpath(resolve(options.root))
  const base = normalizeBase(options.base)
  const outDir = resolve(root, options.outDir)
  const outputBoundary = await existingDirectory(outDir)
  if (outDir === root || !isInside(root, outDir) || !isInside(root, outputBoundary)) {
    throw new Error('The build output must be a directory inside the project root')
  }

  const packageJson = await readPackage(root)
  const dependencies = packageDependencies(packageJson)
  const runtime = await runtimeRoot()
  const cdn = resolveCdn(options.cdn)
  const discovered = await discoverRoutes(root, options.exclude)
  const projectPaths = new Set<string>()
  for (const page of discovered.routes.values()) {
    const files = await collectProjectFiles(root, page)
    for (const projectPath of files) projectPaths.add(projectPath)
  }
  const devjarRuntime = await usesDevjarRuntime(root, projectPaths)
  const devjarDependencies = devjarRuntime
    ? await readDevjarDependencies(runtime)
    : {}
  const resolveSourceModule = (specifier: string) => localPackages.resolve(specifier, 'browser', root)
  const resolveSourceRuntimeModule = createEsmShResolver({
    ...dependencies,
    ...devjarDependencies,
  }, cdn, false)
  const packageImports = await collectPackageImports(root, projectPaths)
  const htmlImports = ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client']
  const tailwindBuildUrls = getTailwindBuildUrls(dependencies, cdn)
  const sourceUrls = new Set([
    ...htmlImports.map(resolveSourceModule),
    ...[...packageImports].map(resolveSourceModule),
    ...(devjarRuntime ? [resolveSourceRuntimeModule('es-module-lexer')] : []),
  ])
  const vendored = await vendorModules({
    load: async url => {
      if (!url.startsWith(`${localPackagePrefix}/`)) return fetch(url)
      const resource = await localPackages.load(new URL(url))
      return new Response(resource.contents, {
        headers: { 'Content-Type': resource.contentType },
      })
    },
    moduleUrls: [...sourceUrls],
    resolveModule: resolveSourceModule,
  })
  const resolveBuiltModule = (specifier: string) => (
    vendored.moduleUrl(resolveSourceModule(specifier), base)
  )
  const resolveBuiltRuntimeModule = (specifier: string) => (
    vendored.moduleUrl(resolveSourceRuntimeModule(specifier), base)
  )
  const manifest = createRouteManifest(root, discovered, {
    liveReload: false,
    revision: 0,
    base,
    moduleUrl: projectPath => builtModuleUrl(projectPath, base),
  })
  const renderedRoutes = options.prerender
    ? await prerender({
        root,
        routes: discovered.routes,
        dependencies,
        devjarDependencies,
        cdn,
        base,
        runtimeModulePath: join(runtime, 'index.js'),
        resolveModule: specifier => localPackages.resolve(specifier, 'server', root),
      })
    : Object.fromEntries([...discovered.routes.keys()].map(route => (
        [route, { head: '', markup: '', styles: '' }]
      )))
  const tailwindCss = tailwindBuildUrls
    ? await compileTailwind({
        root,
        projectPaths,
        renderedMarkup: Object.values(renderedRoutes).map(route => route.markup),
        compilerUrl: tailwindBuildUrls.compiler,
        stylesheetUrl: tailwindBuildUrls.stylesheet,
      })
    : undefined
  const tailwindStylesheetUrl = tailwindCss
    ? builtAssetUrl('tailwind.css', tailwindCss, base)
    : undefined
  await rm(outDir, { recursive: true, force: true })
  await mkdir(outDir, { recursive: true })
  await copyPublicFiles(join(root, 'public'), outDir)
  await writeFile(join(outDir, 'manifest.json'), JSON.stringify(manifest))
  const runtimeAssets = await copyRuntimeAssets(join(outDir, '_jar'), devjarRuntime)
  const runtimeUrl = runtimeAssets.runtimeAsset
    ? withBase(base, `/_jar/${runtimeAssets.runtimeAsset}`)
    : withBase(base, '/_jar/runtime.js')
  for (const route of Object.keys(manifest.routes)) {
    await writeRouteHtml(outDir, route, renderedRoutes[route], {
      resolveModule: resolveBuiltModule,
      resolveRuntimeModule: resolveBuiltRuntimeModule,
      tailwindUrl: undefined,
      tailwindStylesheetUrl,
      base,
      clientUrl: withBase(base, `/_jar/${runtimeAssets.clientAsset}`),
      runtimeUrl,
      devjarRuntime,
    })
  }
  await vendored.write(join(outDir, '_jar/vendor'), base)
  const modulesRoot = join(outDir, '_jar/modules')
  const projectAssetsRoot = join(outDir, '_jar/assets')
  await mkdir(modulesRoot, { recursive: true })
  await mkdir(projectAssetsRoot, { recursive: true })
  if (tailwindCss) {
    await writeFile(join(projectAssetsRoot, staticAssetName('tailwind.css', tailwindCss)), tailwindCss)
  }
  for (const projectPath of projectPaths) {
    if (isStaticAsset(projectPath)) {
      const contents = await readFile(join(root, projectPath))
      await writeFile(join(projectAssetsRoot, staticAssetName(projectPath, contents)), contents)
    }
    const compiled = await compileProjectModule({
      root,
      projectPath,
      resolveModule: resolveBuiltModule,
      moduleUrl: projectPath => builtModuleUrl(projectPath, base),
      assetUrl: (projectPath, contents) => builtAssetUrl(projectPath, contents, base),
      runtimeModuleUrl: runtimeUrl,
      development: false,
      refresh: false,
      platform: 'browser',
    })
    await writeFile(join(modulesRoot, moduleAssetName(projectPath)), compiled.code)
  }
  await writeFile(join(outDir, '_jar/routes.json'), JSON.stringify(manifest))
  await copyApiFiles(join(root, 'api'), join(outDir, 'api'))

  return { root, outDir, routes: Object.keys(manifest.routes), base, devjarRuntime }
}

export async function startBuiltServer(options: StartServerOptions) {
  const requestedRoot = resolve(options.root)
  if (!await directoryExists(requestedRoot)) {
    throw new Error(`Build directory not found: ${requestedRoot}.\nRun devjar build for this project first. If you used --out-dir, pass the same flag to devjar start.`)
  }
  const root = await realpath(requestedRoot)
  const host = options.host
  const port = options.port
  const manifest = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8')) as RouteManifest
  if (manifest.version !== 3) throw new Error(`Unsupported Devjar build version: ${manifest.version}`)
  const base = normalizeBase(manifest.base)
  const devjarRuntime = await fileExists(join(root, '_jar/transform-assets.json'))
  const { send, serveFile } = createResponder(devjarRuntime ? isolationHeaders : {})
  const fallbackHtml = await readFile(join(root, 'index.html'), 'utf8')
  const routeHtml = new Map<string, string>()
  for (const route of Object.keys(manifest.routes)) {
    const path = routeHtmlPath(root, route)
    routeHtml.set(route, await fileExists(path) ? await readFile(path, 'utf8') : fallbackHtml)
  }
  const notFoundHtml = manifest.notFound ? routeHtml.get('/404') : undefined

  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`)
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.writeHead(405, { Allow: 'GET, HEAD' })
        response.end(request.method === 'HEAD' ? undefined : 'Method not allowed')
        return
      }
      const requestPath = withoutBase(base, url.pathname)
      if (!requestPath) {
        send(request, response, 404, 'text/plain; charset=utf-8', 'Not found')
        return
      }
      if (requestPath.startsWith('/_jar/')) {
        const cacheControl = requestPath.startsWith('/_jar/assets/')
          || requestPath.startsWith('/_jar/vendor/')
          || /^\/_jar\/runtime-[a-f0-9]{10}\.js$/.test(requestPath)
          ? immutableAsset
          : noStore
        if (!await serveFile(request, response, join(root, '_jar'), requestPath.slice('/_jar/'.length), undefined, cacheControl)) {
          send(request, response, 404, 'text/plain; charset=utf-8', 'Not found')
        }
        return
      }
      if (requestPath.startsWith('/api/')) {
        if (!await serveFile(request, response, join(root, 'api'), requestPath.slice('/api/'.length), new Set(['.json', '.txt']), noStore)) {
          send(request, response, 404, 'text/plain; charset=utf-8', 'Not found')
        }
        return
      }
      if (await serveFile(request, response, root, requestPath.slice(1), undefined, noStore)) return
      const route = normalizeRoute(requestPath)
      const routeDocument = routeHtml.get(route)
      if (routeDocument) {
        send(request, response, 200, 'text/html; charset=utf-8', routeDocument)
        return
      }
      send(
        request,
        response,
        404,
        'text/html; charset=utf-8',
        notFoundHtml || '<!doctype html><title>Not found</title><h1>404 — Not found</h1>',
      )
    } catch (error) {
      send(request, response, 500, 'text/plain; charset=utf-8', error instanceof Error ? error.stack || error.message : String(error))
    }
  })

  await new Promise<void>((resolvePromise, reject) => {
    server.once('error', reject)
    server.listen(port, host, resolvePromise)
  })

  let closePromise: Promise<void> | undefined
  const close = () => {
    if (closePromise) return closePromise
    closePromise = new Promise<void>((resolvePromise, reject) => {
      const forceClose = setTimeout(() => server.closeAllConnections(), 5_000)
      forceClose.unref()
      server.close(error => {
        clearTimeout(forceClose)
        if (error && (error as NodeJS.ErrnoException).code !== 'ERR_SERVER_NOT_RUNNING') reject(error)
        else resolvePromise()
      })
      server.closeIdleConnections()
    })
    return closePromise
  }

  return {
    host,
    port: (server.address() as import('node:net').AddressInfo).port,
    root,
    base,
    devjarRuntime,
    close,
  }
}
