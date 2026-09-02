import { createReadStream } from 'node:fs'
import { cp, mkdir, readdir, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { dirname, extname, join, normalize, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { watch } from 'node:fs'
import { transformSync } from 'oxc-transform'
import { init, parse } from 'es-module-lexer'
import { CDN_HOST, createEsmShResolver, normalizeCdnHost } from './_cdn'
import { getTailwindBrowserUrl } from './tailwind'
import { getTransformErrorMessage, getTransformOptions } from './_transform'

const sourceExtensions = ['.tsx', '.ts', '.jsx', '.js']
const localExtensions = [...sourceExtensions, '.css']
type PackageJson = {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  devjar?: {
    cdn?: string
  }
}

type RouteEntry = {
  module: string
  page: string
}

type RouteManifest = {
  version: 2
  liveReload: boolean
  revision: number
  routes: Record<string, RouteEntry>
  notFound: RouteEntry | undefined
}

type ModuleGraphEntry = {
  dependencies: Set<string>
  refreshBoundary: boolean
}

export type CompiledProjectModule = {
  code: string
  dependencies: string[]
  refreshBoundary: boolean
}

type HmrUpdate = {
  path: string
  url: string
  type: 'css' | 'refresh'
}

type HmrChange = {
  revision: number
  reload: boolean
  routes: boolean
  timestamp: number
  updates: HmrUpdate[]
}

export type DevServerOptions = {
  root: string
  host: string
  port: number
  cdn: string | undefined
}

export type BuildOptions = {
  root: string
  outDir: string
  cdn: string | undefined
}

export type StartServerOptions = {
  root: string
  host: string
  port: number
}

export type LoadRouteManifestOptions = {
  liveReload: boolean
  revision: number
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
    : resolve(moduleRoot, '../dist')
}

function normalizeRoute(route: string) {
  const cleanRoute = route.replace(/^\/+|\/+$/g, '')
  return cleanRoute ? `/${cleanRoute}` : '/'
}

async function findSourceFile(path: string) {
  if (await fileExists(path) && localExtensions.includes(extname(path))) return path
  if (!extname(path)) {
    for (const extension of localExtensions) {
      if (await fileExists(path + extension)) return path + extension
    }
    for (const extension of localExtensions) {
      const indexPath = join(path, `index${extension}`)
      if (await fileExists(indexPath)) return indexPath
    }
  }
}

function localImports(source: string) {
  const imports = new Set<string>()
  const pattern = /(?:import\s+(?:[^'";]*?\s+from\s*)?|export\s+[^'";]*?\s+from\s*|import\s*\()(['"])(\.{1,2}\/[^'"]+)\1/g
  for (const match of source.matchAll(pattern)) imports.add(match[2])
  return [...imports]
}

async function collectFiles(root: string, entry: string) {
  const files: Record<string, string> = {}
  const queue = [entry]
  const visited = new Set<string>()

  while (queue.length) {
    const path = queue.shift()!
    const canonicalPath = await realpath(path)
    if (!isInside(root, canonicalPath)) {
      throw new Error(`Local import escapes the project root: ${relative(root, path)}`)
    }
    if (visited.has(canonicalPath)) continue
    visited.add(canonicalPath)

    const source = await readFile(canonicalPath, 'utf8')
    const projectPath = relative(root, canonicalPath).split(sep).join('/')
    files[`./${projectPath}`] = source
    if (extname(canonicalPath) === '.css') continue

    for (const specifier of localImports(source)) {
      const imported = await findSourceFile(resolve(canonicalPath, '..', specifier))
      if (!imported) {
        throw new Error(`Cannot resolve ${specifier} imported by ${projectPath}`)
      }
      queue.push(imported)
    }
  }
  return files
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

function projectCdn(packageJson: PackageJson, override: string | undefined) {
  return normalizeCdnHost(override || packageJson.devjar?.cdn || CDN_HOST)
}

export async function loadRouteManifest(
  root: string,
  options: LoadRouteManifestOptions,
): Promise<RouteManifest> {
  root = await realpath(root)
  const discovered = await discoverRoutes(root)
  const routes: Record<string, RouteEntry> = {}
  for (const [route, page] of discovered.routes) {
    const projectPath = relative(root, page).split(sep).join('/')
    routes[route] = { module: options.moduleUrl(projectPath), page: projectPath }
  }

  const notFoundPath = discovered.notFound
    ? relative(root, discovered.notFound).split(sep).join('/')
    : undefined

  return {
    version: 2,
    liveReload: options.liveReload,
    revision: options.revision,
    routes,
    notFound: notFoundPath
      ? { module: options.moduleUrl(notFoundPath), page: notFoundPath }
      : undefined,
  }
}

function devModuleUrl(projectPath: string, revision: number) {
  const parameters = new URLSearchParams({ path: projectPath })
  if (revision) parameters.set('v', String(revision))
  return `/__devjar/module?${parameters}`
}

function moduleAssetName(projectPath: string) {
  return `${Buffer.from(projectPath).toString('base64url')}.js`
}

function builtModuleUrl(projectPath: string) {
  return `/__devjar/modules/${moduleAssetName(projectPath)}`
}

function cssModule(source: string, projectPath: string) {
  return `const sheet = new CSSStyleSheet()
sheet.replaceSync(${JSON.stringify(source)})
globalThis.__devjarStyleSheets ||= new Map()
const previous = globalThis.__devjarStyleSheets.get(${JSON.stringify(projectPath)})
const sheets = [...document.adoptedStyleSheets]
const index = sheets.indexOf(previous)
if (index < 0) sheets.push(sheet)
else sheets[index] = sheet
document.adoptedStyleSheets = sheets
globalThis.__devjarStyleSheets.set(${JSON.stringify(projectPath)}, sheet)
export default sheet
`
}

async function resolveProjectSource(root: string, projectPath: string) {
  const requestedPath = resolve(root, projectPath)
  if (!isInside(root, requestedPath)) {
    throw new Error(`Local module escapes the project root: ${projectPath}`)
  }
  const sourcePath = await findSourceFile(requestedPath)
  if (!sourcePath) throw new Error(`Module not found: ${projectPath}`)
  const canonicalPath = await realpath(sourcePath)
  if (!isInside(root, canonicalPath)) {
    throw new Error(`Local module escapes the project root: ${projectPath}`)
  }
  return canonicalPath
}

export async function compileProjectModule(
  root: string,
  projectPath: string,
  dependencies: Record<string, string>,
  cdn: string,
  moduleUrl: (projectPath: string) => string,
  refresh: boolean,
): Promise<CompiledProjectModule> {
  const sourcePath = await resolveProjectSource(root, projectPath)
  const canonicalProjectPath = relative(root, sourcePath).split(sep).join('/')
  const source = await readFile(sourcePath, 'utf8')
  if (extname(sourcePath) === '.css') {
    return {
      code: cssModule(source, canonicalProjectPath),
      dependencies: [],
      refreshBoundary: false,
    }
  }

  const output = transformSync(
    canonicalProjectPath,
    source,
    getTransformOptions(canonicalProjectPath, refresh),
  )
  const error = getTransformErrorMessage(output.errors)
  if (error) throw new Error(error)

  await init
  const [imports, exports] = parse(output.code)
  const replacements: Array<{ start: number, end: number, value: string }> = []
  const localDependencies: string[] = []
  const resolveModule = createEsmShResolver(dependencies, cdn)
  for (const imported of imports) {
    if (!imported.n) continue
    let value: string
    if (imported.n.startsWith('./') || imported.n.startsWith('../')) {
      const importedPath = await resolveProjectSource(
        root,
        relative(root, resolve(sourcePath, '..', imported.n)),
      )
      const importedProjectPath = relative(root, importedPath).split(sep).join('/')
      value = moduleUrl(importedProjectPath)
      localDependencies.push(importedProjectPath)
    } else {
      value = resolveModule(imported.n)
    }
    replacements.push({
      start: imported.s,
      end: imported.e,
      value: imported.d >= 0 ? JSON.stringify(value) : value,
    })
  }

  let code = output.code
  for (const replacement of replacements.reverse()) {
    code = code.slice(0, replacement.start) + replacement.value + code.slice(replacement.end)
  }

  const refreshNames = new Set(
    [...output.code.matchAll(/\$RefreshReg\$\([^,]+,\s*["']([^"']+)["']\)/g)]
      .map(match => match[1]),
  )
  const refreshBoundary = refresh
    && exports.length > 0
    && exports.every(exported => Boolean(exported.ln && refreshNames.has(exported.ln)))
  if (refresh) {
    const registeredExports = exports
      .filter(exported => exported.ln)
      .map(exported => `${JSON.stringify(exported.n)}: ${exported.ln}`)
      .join(', ')
    code = `const $RefreshReg$ = (type, id) => globalThis.__devjarRefreshRuntime.register(type, ${JSON.stringify(`${canonicalProjectPath} `)} + id)
const $RefreshSig$ = globalThis.__devjarRefreshRuntime.createSignatureFunctionForTransform
${code}
globalThis.__devjarRegisterModule(${JSON.stringify(canonicalProjectPath)}, import.meta.url, { ${registeredExports} })
`
  }
  return {
    code,
    dependencies: [...new Set(localDependencies)],
    refreshBoundary,
  }
}

function updateModuleGraph(
  graph: Map<string, ModuleGraphEntry>,
  importers: Map<string, Set<string>>,
  projectPath: string,
  compiled: CompiledProjectModule,
) {
  const previous = graph.get(projectPath)
  for (const dependency of previous?.dependencies || []) {
    importers.get(dependency)?.delete(projectPath)
  }

  const dependencies = new Set(compiled.dependencies)
  graph.set(projectPath, {
    dependencies,
    refreshBoundary: compiled.refreshBoundary,
  })
  for (const dependency of dependencies) {
    let dependencyImporters = importers.get(dependency)
    if (!dependencyImporters) {
      dependencyImporters = new Set()
      importers.set(dependency, dependencyImporters)
    }
    dependencyImporters.add(projectPath)
  }
}

function findRefreshBoundaries(
  projectPath: string,
  graph: Map<string, ModuleGraphEntry>,
  importers: Map<string, Set<string>>,
) {
  const boundaries = new Set<string>()
  const visited = new Set<string>()
  const queue = [projectPath]
  let reload = false

  while (queue.length) {
    const current = queue.shift()!
    if (visited.has(current)) continue
    visited.add(current)
    const entry = graph.get(current)
    if (entry?.refreshBoundary) {
      boundaries.add(current)
      continue
    }
    const currentImporters = importers.get(current)
    if (!currentImporters?.size) {
      reload = true
      continue
    }
    queue.push(...currentImporters)
  }
  return { boundaries, reload }
}

function send(
  request: IncomingMessage,
  response: ServerResponse,
  status: number,
  type: string,
  body: string | Buffer,
) {
  response.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
  })
  response.end(request.method === 'HEAD' ? undefined : body)
}

function html(
  dependencies: Record<string, string>,
  cdn: string,
  liveReload: boolean,
) {
  const resolveModule = createEsmShResolver(dependencies, cdn)
  const resolveRuntimeModule = createEsmShResolver({
    ...dependencies,
    'es-module-lexer': '1.6.0',
  }, cdn)
  const imports = {
    react: resolveModule('react'),
    'react-dom': resolveModule('react-dom'),
    'react/jsx-runtime': resolveModule('react/jsx-runtime'),
    'react/jsx-dev-runtime': resolveModule('react/jsx-dev-runtime'),
    'react-dom/client': resolveModule('react-dom/client'),
    'es-module-lexer': resolveRuntimeModule('es-module-lexer'),
    devjar: '/__devjar/runtime.js',
    ...(liveReload
      ? { 'react-refresh/runtime': resolveRuntimeModule('react-refresh/runtime') }
      : {}),
  }
  const tailwindUrl = getTailwindBrowserUrl(dependencies, cdn)
  const tailwindPreload = tailwindUrl
    ? `<link rel="modulepreload" href="${tailwindUrl}">`
    : ''
  const tailwindScript = tailwindUrl
    ? `<script data-devjar-tailwind type="module" src="${tailwindUrl}"></script>`
    : ''
  const clientScript = liveReload
    ? `<script type="module">
import * as RefreshModule from 'react-refresh/runtime'
const RefreshRuntime = RefreshModule.default || RefreshModule
RefreshRuntime.injectIntoGlobalHook(globalThis)
globalThis.__devjarRefreshRuntime = RefreshRuntime
await import('/__devjar/client.js')
</script>`
    : '<script type="module" src="/__devjar/client.js"></script>'
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Devjar</title>${tailwindPreload}<script type="importmap">${JSON.stringify({ imports })}</script>
<style>html,body,#root,#__reactRoot{width:100%;min-height:100%;margin:0}.devjar-error{box-sizing:border-box;position:fixed;z-index:10;inset:auto 16px 16px;padding:14px 16px;border:1px solid #ffb4ab;border-radius:8px;background:#330a08;color:#ffdad6;font:13px/1.5 ui-monospace,monospace;white-space:pre-wrap}</style>
</head><body><div id="root"></div><pre id="__devjarError" class="devjar-error" hidden></pre><script>
const errorRoot = document.getElementById('__devjarError')
const showBootstrapError = value => {
  errorRoot.hidden = false
  errorRoot.textContent = 'Devjar could not start:\\n\\n' + value
}
addEventListener('error', event => showBootstrapError(event.message || 'A browser module failed to load'))
addEventListener('unhandledrejection', event => showBootstrapError(event.reason?.stack || event.reason || 'An asynchronous module failed'))
</script>${tailwindScript}${clientScript}</body></html>`
}

const contentTypes: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

async function serveFile(
  request: IncomingMessage,
  response: ServerResponse,
  root: string,
  requestPath: string,
  allowed: Set<string> | undefined,
) {
  const path = resolve(root, `.${normalize('/' + requestPath)}`)
  if (!isInside(root, path) || (allowed && !allowed.has(extname(path)))) return false
  if (!(await fileExists(path))) return false
  const canonicalRoot = await realpath(root)
  const canonicalPath = await realpath(path)
  if (!isInside(canonicalRoot, canonicalPath)) return false
  const info = await stat(canonicalPath)
  response.writeHead(200, {
    'Content-Type': contentTypes[extname(path)] || 'application/octet-stream',
    'Content-Length': info.size,
    'Cache-Control': 'no-store',
  })
  if (request.method === 'HEAD') response.end()
  else createReadStream(canonicalPath).pipe(response)
  return true
}

export async function startDevServer(options: DevServerOptions) {
  const root = await realpath(resolve(options.root))
  const host = options.host
  const port = options.port
  const events = new Set<ServerResponse>()
  const assetsRoot = await runtimeRoot()
  const moduleGraph = new Map<string, ModuleGraphEntry>()
  const moduleImporters = new Map<string, Set<string>>()
  const moduleVersions = new Map<string, number>()
  let revision = 0
  const currentModuleUrl = (projectPath: string) => (
    devModuleUrl(projectPath, moduleVersions.get(projectPath) || 0)
  )

  if (!(await fileExists(join(root, 'pages/index.tsx')))
    && !(await fileExists(join(root, 'pages/index.ts')))
    && !(await fileExists(join(root, 'pages/index.jsx')))
    && !(await fileExists(join(root, 'pages/index.js')))) {
    throw new Error(`Devjar expected an index page in ${join(root, 'pages')}`)
  }

  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`)
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.writeHead(405, { Allow: 'GET, HEAD' })
        response.end('Method not allowed')
        return
      }
      if (url.pathname === '/__devjar/events') {
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
      if (url.pathname === '/__devjar/routes.json') {
        try {
          const manifest = await loadRouteManifest(root, {
            liveReload: true,
            revision,
            moduleUrl: currentModuleUrl,
          })
          send(request, response, 200, 'application/json; charset=utf-8', JSON.stringify(manifest))
        } catch (error) {
          send(request, response, 500, 'application/json; charset=utf-8', JSON.stringify({ error: error instanceof Error ? error.message : String(error) }))
        }
        return
      }
      if (url.pathname === '/__devjar/module') {
        const projectPath = url.searchParams.get('path')
        if (!projectPath) {
          send(request, response, 400, 'text/plain; charset=utf-8', 'Module path is required')
          return
        }
        try {
          const packageJson = await readPackage(root)
          const dependencies = packageDependencies(packageJson)
          const cdn = projectCdn(packageJson, options.cdn)
          const compiled = await compileProjectModule(
            root,
            projectPath,
            dependencies,
            cdn,
            currentModuleUrl,
            true,
          )
          updateModuleGraph(
            moduleGraph,
            moduleImporters,
            projectPath,
            compiled,
          )
          send(request, response, 200, 'text/javascript; charset=utf-8', compiled.code)
        } catch (error) {
          send(request, response, 404, 'text/javascript; charset=utf-8', `throw new Error(${JSON.stringify(error instanceof Error ? error.message : String(error))})`)
        }
        return
      }
      if (url.pathname === '/__devjar/runtime.js') {
        if (!await serveFile(request, response, assetsRoot, 'index.js', undefined)) send(request, response, 500, 'text/plain', 'Devjar runtime is missing')
        return
      }
      if (url.pathname.startsWith('/__devjar/')) {
        if (!await serveFile(request, response, assetsRoot, url.pathname.slice('/__devjar/'.length), undefined)) send(request, response, 404, 'text/plain', 'Not found')
        return
      }
      if (url.pathname.startsWith('/api/')) {
        if (!await serveFile(request, response, join(root, 'api'), url.pathname.slice('/api/'.length), new Set(['.json', '.txt']))) {
          send(request, response, 404, 'text/plain; charset=utf-8', 'Not found')
        }
        return
      }
      if (await serveFile(request, response, join(root, 'public'), url.pathname.slice(1), undefined)) return
      const packageJson = await readPackage(root)
      send(
        request,
        response,
        200,
        'text/html; charset=utf-8',
        html(
          packageDependencies(packageJson),
          projectCdn(packageJson, options.cdn),
          true,
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
        filename.startsWith('pages/') && sourceExtensions.includes(extname(filename))
      ))
      const invalidated = new Set<string>()
      const cssUpdates = new Set<string>()
      const refreshBoundaries = new Set<string>()

      for (const projectPath of changedFiles) {
        if (!localExtensions.includes(extname(projectPath)) || !moduleGraph.has(projectPath)) continue
        invalidated.add(projectPath)
        if (extname(projectPath) === '.css') {
          cssUpdates.add(projectPath)
          continue
        }
        const result = findRefreshBoundaries(projectPath, moduleGraph, moduleImporters)
        reload ||= result.reload
        for (const boundary of result.boundaries) {
          invalidated.add(boundary)
          refreshBoundaries.add(boundary)
        }
      }

      if (!reload && !routes && !invalidated.size) return
      revision++
      for (const projectPath of invalidated) {
        moduleVersions.set(projectPath, (moduleVersions.get(projectPath) || 0) + 1)
      }
      const updates: HmrUpdate[] = [
        ...[...cssUpdates].map(path => ({
          path,
          type: 'css' as const,
          url: currentModuleUrl(path),
        })),
        ...[...refreshBoundaries].map(path => ({
          path,
          type: 'refresh' as const,
          url: currentModuleUrl(path),
        })),
      ]
      const change: HmrChange = {
        revision,
        reload,
        routes,
        timestamp,
        updates,
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
    throw error
  }

  let closePromise: Promise<void> | undefined
  const close = () => {
    if (closePromise) return closePromise
    closePromise = new Promise<void>((resolvePromise, reject) => {
      clearTimeout(timer)
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
    close,
  }
}

async function discoverRoutes(root: string) {
  const pagesRoot = join(root, 'pages')
  if (!await directoryExists(pagesRoot)) {
    throw new Error(`Devjar expected a pages directory in ${root}`)
  }

  const files: string[] = []
  const visit = async (directory: string) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) await visit(path)
      else if (entry.isFile() && sourceExtensions.includes(extname(entry.name))) files.push(path)
    }
  }
  await visit(pagesRoot)

  const routes = new Map<string, string>()
  let notFound: string | undefined
  for (const path of files.sort()) {
    let pagePath = relative(pagesRoot, path).split(sep).join('/')
    pagePath = pagePath.slice(0, -extname(pagePath).length)
    if (pagePath === '404') notFound = path
    const route = normalizeRoute(pagePath.replace(/(?:^|\/)index$/, ''))
    if (routes.has(route)) {
      throw new Error(`Multiple pages resolve to ${route}: ${relative(root, routes.get(route)!)} and ${relative(root, path)}`)
    }
    routes.set(route, path)
  }

  if (!routes.has('/')) {
    throw new Error(`Devjar expected an index page in ${pagesRoot}`)
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

async function copyRuntimeAssets(destination: string) {
  const source = await runtimeRoot()
  await mkdir(destination, { recursive: true })
  const assets = [
    ['index.js', 'runtime.js'],
    ['_cdn.js', '_cdn.js'],
    ['client.js', 'client.js'],
    ['transform-worker.js', 'transform-worker.js'],
    ['transform.wasi-browser.js', 'transform.wasi-browser.js'],
    ['transform.wasm32-wasi.wasm', 'transform.wasm32-wasi.wasm'],
    ['wasi-worker-browser.js', 'wasi-worker-browser.js'],
  ] as const
  for (const [sourceName, destinationName] of assets) {
    const sourcePath = join(source, sourceName)
    if (!await fileExists(sourcePath)) throw new Error(`Devjar runtime asset is missing: ${sourceName}`)
    await cp(sourcePath, join(destination, destinationName))
  }
}

export async function buildProject(options: BuildOptions) {
  const root = await realpath(resolve(options.root))
  const outDir = resolve(root, options.outDir)
  const outputBoundary = await existingDirectory(outDir)
  if (outDir === root || !isInside(root, outDir) || !isInside(root, outputBoundary)) {
    throw new Error('The build output must be a directory inside the project root')
  }

  const packageJson = await readPackage(root)
  const dependencies = packageDependencies(packageJson)
  const cdn = projectCdn(packageJson, options.cdn)
  const discovered = await discoverRoutes(root)
  const manifest = await loadRouteManifest(root, {
    liveReload: false,
    revision: 0,
    moduleUrl: builtModuleUrl,
  })
  const projectPaths = new Set<string>()
  for (const page of discovered.routes.values()) {
    const files = await collectFiles(root, page)
    for (const projectPath of Object.keys(files)) projectPaths.add(projectPath.slice(2))
  }

  await rm(outDir, { recursive: true, force: true })
  await mkdir(outDir, { recursive: true })
  await writeFile(join(outDir, 'manifest.json'), JSON.stringify(manifest))
  await writeFile(join(outDir, 'index.html'), html(dependencies, cdn, false))
  await copyRuntimeAssets(join(outDir, '__devjar'))
  const modulesRoot = join(outDir, '__devjar/modules')
  await mkdir(modulesRoot, { recursive: true })
  for (const projectPath of projectPaths) {
    const code = await compileProjectModule(
      root,
      projectPath,
      dependencies,
      cdn,
      builtModuleUrl,
      false,
    )
    await writeFile(join(modulesRoot, moduleAssetName(projectPath)), code.code)
  }
  await writeFile(join(outDir, '__devjar/routes.json'), JSON.stringify(manifest))
  if (await directoryExists(join(root, 'public'))) {
    await cp(join(root, 'public'), join(outDir, 'public'), { recursive: true })
  }
  await copyApiFiles(join(root, 'api'), join(outDir, 'api'))

  return { root, outDir, routes: Object.keys(manifest.routes) }
}

export async function startBuiltServer(options: StartServerOptions) {
  const requestedRoot = resolve(options.root)
  if (!await directoryExists(requestedRoot)) {
    throw new Error(`Devjar build directory not found: ${requestedRoot}`)
  }
  const root = await realpath(requestedRoot)
  const host = options.host
  const port = options.port
  const manifest = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8')) as RouteManifest
  if (manifest.version !== 2) throw new Error(`Unsupported Devjar build version: ${manifest.version}`)
  const shell = await readFile(join(root, 'index.html'), 'utf8')

  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`)
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.writeHead(405, { Allow: 'GET, HEAD' })
        response.end(request.method === 'HEAD' ? undefined : 'Method not allowed')
        return
      }
      if (url.pathname.startsWith('/__devjar/')) {
        if (!await serveFile(request, response, join(root, '__devjar'), url.pathname.slice('/__devjar/'.length), undefined)) {
          send(request, response, 404, 'text/plain; charset=utf-8', 'Not found')
        }
        return
      }
      if (url.pathname.startsWith('/api/')) {
        if (!await serveFile(request, response, join(root, 'api'), url.pathname.slice('/api/'.length), new Set(['.json', '.txt']))) {
          send(request, response, 404, 'text/plain; charset=utf-8', 'Not found')
        }
        return
      }
      if (await serveFile(request, response, join(root, 'public'), url.pathname.slice(1), undefined)) return
      send(request, response, 200, 'text/html; charset=utf-8', shell)
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
    close,
  }
}
