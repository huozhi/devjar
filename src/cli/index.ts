import { createReadStream } from 'node:fs'
import { cp, mkdir, readdir, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { dirname, extname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CDN_HOST, createEsmShResolver, normalizeCdnHost } from '../shared/cdn'
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
  minifyModule,
  staticAssetExtensions,
  staticAssetName,
  usesDevjarRuntime,
} from './modules'
import type { HmrChange, RouteManifest } from './protocol'
import { discover, isInside, manifest as createManifest, routeFromCliPage, routeSignature, singlePage } from './routes'
import type { DiscoveredPages, ManifestOptions } from './routes'
import { renderMarkdown, markdownDocument, type MarkdownPage } from './markdown'
import { markdownTheme, markdownStylesRoot, copyMarkdownStyles } from './markdown-theme'
import { copyMathAssets, mathAssetsRoot } from './math'
import { closeServer, createDirectoryWatcher, createEventStream, listen, trackServerShutdown } from './server'
export { loadRouteManifest } from './routes'
import {
  routeHref,
  normalizeBase,
  normalizeRoute,
  withBase,
  withoutBase,
} from '../shared/project'
import { getTailwindBrowserUrl, getTailwindBuildUrls } from './tailwind'
import { prerender, type LinkedStylesheet, type PrerenderedRoute } from './prerender'
import { compileTailwind } from './tailwind-build'
import { findIgnoredHtml } from './routes'
import { vendorModules } from './vendor'
import { LocalPackages } from './local-packages'
import { contentTypes } from './content-types'
import { browserLogPath, browserLogScript, createBrowserLogPrinter, receiveBrowserLog } from './browser-log'

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
  theme?: string
  math?: boolean
  /** Serve one React or Markdown file in root at `/` instead of pages/. */
  entry?: string
}

export type BuildOptions = {
  root: string
  outDir: string
  cdn: string | undefined
  prerender: boolean
  exclude: string[]
  base: string
  origin?: string
  sitemap?: string
  theme?: string
  math?: boolean
}

export type StartServerOptions = {
  root: string
  host: string
  port: number
}

export type LoadRouteManifestOptions = ManifestOptions

async function fileExists(path: string) {
  try {
    return (await stat(path)).isFile()
  } catch {
    return false
  }
}

async function pathExists(path: string) {
  try {
    await stat(path)
    return true
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
  metadataFiles: string[]
  metadataOrigin: string
  content: string
  stylesheets: LinkedStylesheet[]
  modulePreloads: string[]
}

function metadataTags(files: string[], base: string, origin: string) {
  return `<meta name="twitter:card" content="summary_large_image">${files.map(filename => {
    const url = withBase(base, `/${filename}`)
    const absoluteUrl = `${origin}${url}`
    const type = contentTypes[extname(filename)]
    if (filename.startsWith('icon.')) return `<link rel="icon" href="${url}" type="${type}">`
    if (filename.startsWith('opengraph-image.')) {
      return `<meta property="og:image" content="${absoluteUrl}"><meta name="twitter:image" content="${absoluteUrl}">`
    }
    const property = filename.startsWith('opengraph-video.') ? 'og:video' : 'og:audio'
    return `<meta property="${property}" content="${absoluteUrl}"><meta property="${property}:type" content="${type}">`
  }).join('')}`
}

function escapeAttribute(value: string) {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

// Pages render into <div id="__jar">. The only base style removes the body
// margin, with zero specificity in the lowest layer so any project CSS wins.
const baseStyles = '@layer devjar{:where(body){margin:0}}'

// The development error overlay styles itself instead of adding global rules.
const errorOverlayStyle = 'box-sizing:border-box;position:fixed;z-index:10;inset:auto 0 0;margin:0;padding:6px 12px;max-height:25vh;overflow:auto;border:0;border-radius:0;background:#fff7f6;color:#9f2d20;font:11px/1.4 ui-monospace,monospace;white-space:pre-wrap'

function html(options: HtmlOptions) {
  const imports = {
    react: options.resolveModule('react'),
    'react-dom': options.resolveModule('react-dom'),
    'react/jsx-runtime': options.resolveModule('react/jsx-runtime'),
    'react-dom/client': options.resolveModule('react-dom/client'),
    ...(options.devjarRuntime
      ? {
          'es-module-lexer/minimal': options.resolveRuntimeModule('es-module-lexer/minimal'),
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
  const staticStyles = options.stylesheets.map(stylesheet => (
    `<link rel="stylesheet" href="${escapeAttribute(stylesheet.href)}" data-devjar-css="${escapeAttribute(stylesheet.projectPath)}">`
  )).join('')
  const modulePreloads = [...new Set(options.modulePreloads)].map(url => (
    `<link rel="modulepreload" href="${escapeAttribute(url)}">`
  )).join('')
  const metadataHead = metadataTags(options.metadataFiles, options.base, options.metadataOrigin)
  const documentHead = /<title(?:\s|>)/i.test(options.head)
    ? options.head
    : `<title data-devjar-default>Devjar</title>${options.head}`
  const errorOverlay = options.liveReload
    ? `<pre id="__jarError" style="${errorOverlayStyle}" hidden></pre><script>
const errorRoot = document.getElementById('__jarError')
const showBootstrapError = value => {
  errorRoot.hidden = false
  errorRoot.textContent = 'Devjar could not start:\\n\\n' + value
}

addEventListener('error', event => {
  // ResizeObserver can defer layout work without an application exception.
  if (!event.error && (event.message === 'ResizeObserver loop completed with undelivered notifications.'
    || event.message === 'ResizeObserver loop limit exceeded')) return
  showBootstrapError(event.message || 'A browser module failed to load')
})
addEventListener('unhandledrejection', event => showBootstrapError(event.reason?.stack || event.reason || 'An asynchronous module failed'))
</script>`
    : ''
  const browserLog = options.liveReload ? browserLogScript(withBase(options.base, browserLogPath)) : ''
  return `<!doctype html>
<html><head>${browserLog}<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="devjar-base" content="${options.base}">${documentHead}${metadataHead}${tailwindPreload}<script type="importmap">${JSON.stringify({ imports })}</script>${modulePreloads}
<style>${baseStyles}</style>${staticStyles}
${tailwindStylesheet}</head><body><div id="__jar">${options.content}</div>${errorOverlay}${tailwindScript}${clientScript}</body></html>`
}

function metadataOrigin(origin: string | undefined) {
  const value = origin || (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : 'http://localhost:3000')
  let url: URL
  try {
    url = new URL(value.includes('://') ? value : `https://${value}`)
  } catch {
    throw new Error(`Invalid origin: ${value}`)
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error(`Invalid origin: ${value}`)
  return url.origin
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
  let path = resolve(root, `.${normalize('/' + requestPath)}`)
  if (!allowed && await directoryExists(path)) path = join(path, 'index.html')
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

// File names such as `my plot.svg` arrive percent-encoded in request URLs.
function decodedPath(pathname: string | undefined) {
  if (!pathname || /%2f|%5c/i.test(pathname)) return
  try {
    return decodeURIComponent(pathname)
  } catch {
    return
  }
}

function reportRequestError(error: unknown) {
  const detail = error instanceof Error ? error.stack || error.message : String(error)
  console.error(detail)
  return detail
}

function warnIgnoredHtml(files: string[]) {
  if (!files.length) return
  const shown = files.slice(0, 3).join(', ') + (files.length > 3 ? `, and ${files.length - 3} more` : '')
  console.warn(`Devjar: HTML files in pages/ are not pages: ${shown}.\nPreview one as-is with \`devjar ${files[0]}\`, or move it to public/ to publish it with the site.`)
}

export async function startDevServer(options: DevServerOptions) {
  const root = await realpath(resolve(options.root))
  const host = options.host
  const port = options.port
  const base = normalizeBase(options.base)
  const theme = markdownTheme(options.theme)
  const events = createEventStream()
  const printBrowserLog = createBrowserLogPrinter(message => console.error(message))
  const markdownAssets = new Set<string>()
  const assetsRoot = await runtimeRoot()
  const devjarDependencies = await readDevjarDependencies(assetsRoot)
  const modules = new DevModuleGraph(base)
  const { send, serveFile } = createResponder({})
  let revision = 0
  let localReloadTimer: NodeJS.Timeout | undefined
  warnIgnoredHtml(await findIgnoredHtml(root))
  const localPackageOptions = {
    root,
    prefix: withBase(base, '/_jar/local'),
    serverPrefix: withBase(base, '/_jar/local'),
    cdn: resolveCdn(options.cdn),
    development: true,
    onChange: () => {
      pageCache = undefined
      clearTimeout(localReloadTimer)
      localReloadTimer = setTimeout(() => {
        revision++
        const change: HmrChange = { revision, reload: true, routes: false, timestamp: Date.now(), updates: [] }
        events.send(JSON.stringify(change))
      }, 40)
    },
  }
  const localPackages = new LocalPackages(localPackageOptions)

  const entry = options.entry
  let pageCache: ReturnType<typeof discover> | undefined
  // The last routes served, so a data edit only counts as a route change when
  // paths() or defaultParams actually produce different routes.
  let lastPages: DiscoveredPages | undefined
  const findPages = async () => {
    const pages = await (pageCache ||= entry ? Promise.resolve(singlePage(root, entry))
      : discover(root, [], specifier => localPackages.resolve(specifier, 'server', root)))
    lastPages = pages
    return pages
  }
  // Root metadata files only change through the watcher below, which clears this.
  let metadataCache: Promise<string[]> | undefined
  const findMetadataFiles = () => metadataCache ||= discoverMetadataFiles(root)
    .catch(error => { metadataCache = undefined; throw error })
  const isPageFile = (filename: string) => filename.startsWith('pages/') && routeFromCliPage(filename.slice('pages/'.length)) !== undefined
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`)
      if (request.method === 'POST' && withoutBase(base, url.pathname) === browserLogPath) {
        await receiveBrowserLog(request, response, printBrowserLog)
        return
      }
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.writeHead(405, { Allow: 'GET, HEAD' })
        response.end('Method not allowed')
        return
      }
      const requestPath = decodedPath(withoutBase(base, url.pathname))
      if (!requestPath) {
        send(request, response, 404, 'text/plain; charset=utf-8', 'Not found')
        return
      }
      if (requestPath === '/_jar/events') {
        events.accept(request, response)
        return
      }
      if (requestPath === '/_jar/routes.json') {
        try {
          const manifest = createManifest(root, await findPages(), {
            liveReload: true,
            revision,
            base,
            moduleUrl: modules.moduleUrl,
          })
          send(request, response, 200, 'application/json; charset=utf-8', JSON.stringify(manifest))
        } catch (error) {
          send(request, response, 500, 'application/json; charset=utf-8', JSON.stringify({ error: reportRequestError(error) }))
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
            stylesheets: 'adopted',
          })
          modules.update(projectPath, compiled)
          watchLoadedFile(projectPath)
          send(request, response, 200, 'text/javascript; charset=utf-8', compiled.code)
        } catch (error) {
          send(request, response, 500, 'text/javascript; charset=utf-8', `throw new Error(${JSON.stringify(reportRequestError(error))})`)
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
      if (options.math && requestPath.startsWith('/_jar/math/')) {
        if (!await serveFile(request, response, mathAssetsRoot(), requestPath.slice('/_jar/math/'.length),
          new Set(['.css', '.woff2', '.woff', '.ttf']), noStore)) send(request, response, 404, 'text/plain', 'Not found')
        return
      }
      if (requestPath.startsWith('/_jar/markdown/')) {
        if (!await serveFile(request, response, markdownStylesRoot(), requestPath.slice('/_jar/markdown/'.length),
          new Set(['.css']), noStore)) send(request, response, 404, 'text/plain', 'Not found')
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
      if (requestPath.startsWith('/api/') && requestPath !== '/api/') {
        if (!await serveFile(request, response, join(root, 'api'), requestPath.slice('/api/'.length), new Set(['.json', '.txt']), noStore)) {
          send(request, response, 404, 'text/plain; charset=utf-8', 'Not found')
        }
        return
      }
      const metadataFiles = await findMetadataFiles()
      if (metadataFiles.includes(requestPath.slice(1))
        && await serveFile(request, response, root, requestPath.slice(1), undefined, noStore)) return
      if (await serveFile(request, response, join(root, 'public'), requestPath.slice(1), undefined, noStore)) return
      const pages = await findPages()
      const route = normalizeRoute(requestPath)
      const destination = pages.redirects[route]
      if (destination) {
        response.writeHead(302, { Location: withBase(base, routeHref(destination) + '/') + url.search })
        response.end()
        return
      }
      const page = pages.routes.get(route) || pages.notFound
      if (page?.endsWith('.md')) {
        const rendered = await renderMarkdown({ root, page, routes: pages.routes, base, theme,
          liveReload: true, math: options.math || false, assetUrl: (path, contents) => devAssetUrl(path, contents, base) })
        for (const path of rendered.assets.keys()) {
          markdownAssets.add(path)
          watchLoadedFile(path)
        }
        send(request, response, pages.routes.has(route) ? 200 : 404, 'text/html; charset=utf-8',
          markdownDocument(rendered, { base, theme, liveReload: true, metadataHead: metadataTags(metadataFiles, base, 'http://localhost:3000') }))
        return
      }
      const packageJson = await readPackage(root)
      const dependencies = packageDependencies(packageJson)
      const cdn = resolveCdn(options.cdn)
      send(
        request,
        response,
        pages.routes.has(route) ? 200 : 404,
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
            metadataFiles,
            metadataOrigin: 'http://localhost:3000',
            head: '',
            content: '',
            stylesheets: [],
            modulePreloads: [],
          },
        ),
      )
    } catch (error) {
      send(request, response, 500, 'text/plain; charset=utf-8', reportRequestError(error))
    }
  })

  const beginClose = trackServerShutdown(server)

  let timer: NodeJS.Timeout | undefined
  let pendingTimestamp = 0
  const pendingFiles = new Set<string>()
  const pendingRenames = new Set<string>()
  const watcher = createDirectoryWatcher(root, path => /(?:^|\/)(?:\.git|node_modules|dist)(?:\/|$)/.test(path), (event, projectPath) => {
    if (!pendingFiles.size) pendingTimestamp = Date.now()
    pendingFiles.add(projectPath)
    if (event === 'rename') pendingRenames.add(projectPath)
    clearTimeout(timer)
    timer = setTimeout(async () => {
      const changedFiles = [...pendingFiles]
      pendingFiles.clear()
      const renamedFiles = [...pendingRenames]
      pendingRenames.clear()
      const timestamp = pendingTimestamp
      pendingTimestamp = 0
      let reload = changedFiles.includes('markdown.css') || changedFiles.some(path => path.endsWith('.md') || markdownAssets.has(path)) || changedFiles.includes('package.json') || changedFiles.some(isMetadataFile)
      if (changedFiles.some(isMetadataFile)) metadataCache = undefined
      let routes = changedFiles.some(isPageFile)
      const previous = lastPages
      if (routes || !previous) {
        pageCache = undefined
      } else if (changedFiles.some(filename => previous.routeInputs.has(filename))) {
        // Data read by paths() or defaultParams changed. Other edits keep hot updates.
        pageCache = undefined
        try {
          routes = routeSignature(await findPages()) !== routeSignature(previous)
        } catch {
          routes = true // The browser reloads the route list and shows the error.
        }
      }
      const invalidation = modules.invalidate(changedFiles)
      reload ||= invalidation.reload
      const renamedTrackedFiles = renamedFiles.filter(filename => (
        modules.isTracked(filename)
        || isPageFile(filename)
      ))
      if (!reload && renamedTrackedFiles.length) {
        reload = (await Promise.all(renamedTrackedFiles.map(async filename => (
          !(await pathExists(join(root, filename)))
        )))).some(Boolean)
      }
      if (!reload && !routes && !invalidation.invalidated) return
      revision++
      const change: HmrChange = {
        revision,
        reload,
        routes,
        timestamp,
        updates: invalidation.updates,
      }
      events.send(JSON.stringify(change))
    }, 40)
  })
  // A project is watched whole. A single file, which may sit in a large
  // folder such as Downloads, watches its own folder and those of files it loads.
  watcher.watch(root, !entry)
  function watchLoadedFile(projectPath: string) {
    if (entry) watcher.watch(dirname(join(root, projectPath)), false)
  }

  try {
    await listen(server, port, host)
    const address = server.address() as import('node:net').AddressInfo
    const localHost = address.address === '0.0.0.0' ? '127.0.0.1'
      : address.address.includes(':') ? `[${address.address === '::' ? '::1' : address.address}]` : address.address
    localPackageOptions.serverPrefix = `http://${localHost}:${address.port}${withBase(base, '/_jar/local')}`
    await findPages()
  } catch (error) {
    server.close()
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
      events.close()
      closeServer(server, beginClose).then(resolvePromise, reject)
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

function isMetadataFile(filename: string) {
  return /^icon\.(ico|png|jpg|jpeg|svg|gif|webp)$/.test(filename)
    || /^opengraph-image\.(png|jpg|jpeg|gif|webp)$/.test(filename)
    || /^opengraph-video\.(mp4|webm)$/.test(filename)
    || /^opengraph-audio\.(mp3|ogg|wav)$/.test(filename)
}

async function discoverMetadataFiles(root: string) {
  const entries = await readdir(root, { withFileTypes: true })
  return entries.filter(entry => entry.isFile() && isMetadataFile(entry.name))
    .map(entry => entry.name).sort()
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
}

async function readTransformAssetManifest(source: string): Promise<TransformAssetManifest> {
  const manifest: unknown = JSON.parse(await readFile(join(source, 'transform-assets.json'), 'utf8'))
  if (typeof manifest !== 'object' || manifest === null) {
    throw new Error('Devjar transform asset manifest is invalid')
  }
  const value = manifest as Record<string, unknown>
  const names = ['worker', 'binding', 'wasm'] as const
  const assetPath = /^assets\/[a-z0-9._-]+-[a-z0-9]+\.(?:js|wasm)$/
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
  // The npm entry keeps bundler hints; static exports are ready for the browser.
  const runtimeContents = Buffer.from(minifyModule('runtime.js',
    withoutSourceMapReference(await readFile(join(source, 'index.js'))).toString('utf8')))
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

async function validateRouteOutput(root: string, pages: DiscoveredPages, metadata: string[], sitemap: string | undefined) {
  const files = new Map<string, string>()
  const directories = new Map<string, string>()
  const claim = (path: string, owner: string) => {
    const normalized = path.normalize('NFC').toLowerCase()
    let conflict = files.get(normalized) || directories.get(normalized)
    const ancestors: string[] = []
    const parts = normalized.split('/')
    for (let index = 1; index < parts.length; index++) {
      const parent = parts.slice(0, index).join('/')
      ancestors.push(parent)
      conflict ||= files.get(parent)
    }
    if (conflict) throw new Error(`Output collision at ${path}: ${conflict} and ${owner}`)
    files.set(normalized, owner)
    for (const parent of ancestors) directories.set(parent, owner)
  }
  claim('manifest.json', 'Devjar manifest')
  if (sitemap !== undefined) claim(sitemap, 'sitemap')
  if (pages.notFound) claim('404.html', '404 page')
  for (const file of metadata) claim(file, 'metadata')
  for (const route of [...pages.routes.keys(), ...Object.keys(pages.redirects)]) {
    claim(route === '/' ? 'index.html' : route.slice(1) + '/index.html', `route ${route}`)
  }
  const visit = async (directory: string, prefix: string) => {
    let entries
    try { entries = await readdir(directory, { withFileTypes: true }) } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
      throw error
    }
    for (const entry of entries) {
      const path = prefix + entry.name
      if (!prefix && ['_jar', 'api'].includes(entry.name)) throw new Error(`Reserved public path: ${path}`)
      if (entry.isDirectory()) await visit(join(directory, entry.name), path + '/')
      else if (!metadata.includes(path)) claim(path, `public/${path}`)
    }
  }
  await visit(join(root, 'public'), '')
}

function redirectDocument(target: string) {
  const escaped = target.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  // The script keeps the query and hash; the meta refresh covers disabled JavaScript.
  const script = `location.replace(${JSON.stringify(target).replace(/</g, '\\u003c')}+location.search+location.hash)`
  return `<!doctype html><html><head><meta charset="utf-8"><title>Redirecting</title><script>${script}</script><meta http-equiv="refresh" content="0;url=${escaped}"><link rel="canonical" href="${escaped}"><meta name="robots" content="noindex"></head><body><a href="${escaped}">Continue</a></body></html>`
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
    | 'metadataFiles'
    | 'metadataOrigin'
    | 'modulePreloads'
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
    metadataFiles: options.metadataFiles,
    metadataOrigin: options.metadataOrigin,
    head: rendered.head,
    content: rendered.markup,
    stylesheets: rendered.stylesheets,
    modulePreloads: options.modulePreloads,
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
    return await buildWithPackages(options, localPackages)
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

async function buildWithPackages(options: BuildOptions, localPackages: LocalPackages) {
  const root = await realpath(resolve(options.root))
  const base = normalizeBase(options.base)
  const theme = markdownTheme(options.theme)
  const metadataBaseOrigin = metadataOrigin(options.origin)
  if (options.sitemap !== undefined && (!/^[^/\\]+\.xml$/.test(options.sitemap)
    || options.sitemap === '.' || options.sitemap === '..')) {
    throw new Error('Sitemap filename must be a .xml file in the build output root')
  }
  const outDir = resolve(root, options.outDir)
  const outputBoundary = await existingDirectory(outDir)
  if (outDir === root || !isInside(root, outDir) || !isInside(root, outputBoundary)) {
    throw new Error('The build output must be a directory inside the project root')
  }

  const packageJson = await readPackage(root)
  const dependencies = packageDependencies(packageJson)
  const runtime = await runtimeRoot()
  const cdn = resolveCdn(options.cdn)
  const discovered = await discover(root, options.exclude, specifier => localPackages.resolve(specifier, 'server', root))
  warnIgnoredHtml(await findIgnoredHtml(root))
  const metadataFiles = await discoverMetadataFiles(root)
  await validateRouteOutput(root, discovered, metadataFiles, options.sitemap)
  const reactRoutes = new Map([...discovered.routes].filter(([, page]) => !page.endsWith('.md')))
  const markdownPages = new Map<string, MarkdownPage>()
  for (const [route, page] of discovered.routes) {
    if (page.endsWith('.md')) markdownPages.set(route, await renderMarkdown({
      root, page, routes: discovered.routes, base, theme, liveReload: false, math: options.math || false,
      assetUrl: (path, contents) => builtAssetUrl(path, contents, base),
    }))
  }
  const projectPaths = new Set<string>()
  const routeFiles = new Map<string, Set<string>>()
  for (const [route, page] of reactRoutes) {
    const files = await collectProjectFiles(root, page)
    routeFiles.set(route, files)
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
  const htmlImports = reactRoutes.size ? ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client'] : []
  const tailwindBuildUrls = reactRoutes.size ? getTailwindBuildUrls(dependencies, cdn) : undefined
  const sourceUrls = new Set([
    ...htmlImports.map(resolveSourceModule),
    ...[...packageImports].map(resolveSourceModule),
    ...(devjarRuntime ? [resolveSourceRuntimeModule('es-module-lexer/minimal')] : []),
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
  const manifest = createManifest(root, discovered, {
    liveReload: false,
    revision: 0,
    base,
    moduleUrl: projectPath => builtModuleUrl(projectPath, base),
  })
  const renderedRoutes = options.prerender && reactRoutes.size
    ? await prerender({
        root,
        routes: reactRoutes,
        params: discovered.params,
        dependencies,
        devjarDependencies,
        cdn,
        base,
        runtimeModulePath: join(runtime, 'index.js'),
        resolveModule: specifier => localPackages.resolve(specifier, 'server', root),
      })
    : Object.fromEntries([...reactRoutes.keys()].map(route => (
        [route, { head: '', markup: '', stylesheets: [] }]
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
  for (const filename of metadataFiles) {
    await cp(join(root, filename), join(outDir, filename))
  }
  await writeFile(join(outDir, 'manifest.json'), JSON.stringify(manifest))
  if ([...markdownPages.values()].some(page => page.hasMath)) {
    await copyMathAssets(join(outDir, '_jar/math'))
  }
  if (markdownPages.size) await copyMarkdownStyles(join(outDir, '_jar/markdown'), theme)
  const runtimeAssets = await copyRuntimeAssets(join(outDir, '_jar'), devjarRuntime)
  const runtimeUrl = runtimeAssets.runtimeAsset
    ? withBase(base, `/_jar/${runtimeAssets.runtimeAsset}`)
    : withBase(base, '/_jar/runtime.js')
  for (const route of Object.keys(manifest.routes)) {
    const markdown = markdownPages.get(route)
    if (markdown) {
      const path = routeHtmlPath(outDir, route)
      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, markdownDocument(markdown, { base, theme, liveReload: false,
        metadataHead: metadataTags(metadataFiles, base, metadataBaseOrigin) }))
      continue
    }
    await writeRouteHtml(outDir, route, renderedRoutes[route], {
      metadataFiles,
      metadataOrigin: metadataBaseOrigin,
      modulePreloads: [...routeFiles.get(route)!].map(path => builtModuleUrl(path, base)),
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
  for (const [route, target] of Object.entries(discovered.redirects)) {
    const path = routeHtmlPath(outDir, route)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, redirectDocument(withBase(base, routeHref(target) + '/')))
  }
  if (options.sitemap !== undefined) {
    const locations = Object.keys(manifest.routes)
      .filter(route => route !== '/404')
      .sort()
      .map(route => {
        const location = `${metadataBaseOrigin}${withBase(base, route === '/' ? '/' : `${routeHref(route)}/`)}`
        return `  <url><loc>${location.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</loc></url>`
      })
    await writeFile(join(outDir, options.sitemap), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${locations.join('\n')}\n</urlset>\n`)
  }
  await vendored.write(join(outDir, '_jar/vendor'), base)
  const modulesRoot = join(outDir, '_jar/modules')
  const projectAssetsRoot = join(outDir, '_jar/assets')
  await mkdir(modulesRoot, { recursive: true })
  await mkdir(projectAssetsRoot, { recursive: true })
  for (const page of markdownPages.values()) {
    for (const [path, contents] of page.assets) {
      await writeFile(join(projectAssetsRoot, staticAssetName(path, contents)), contents)
    }
  }
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
      stylesheets: 'linked',
    })
    await writeFile(join(modulesRoot, moduleAssetName(projectPath)), compiled.code)
    if (compiled.style !== undefined) {
      const style = Buffer.from(compiled.style)
      await writeFile(join(projectAssetsRoot, staticAssetName(projectPath, style)), style)
    }
  }
  await writeFile(join(outDir, '_jar/routes.json'), JSON.stringify(manifest))
  await copyApiFiles(join(root, 'api'), join(outDir, 'api'))

  return { root, outDir, routes: Object.keys(manifest.routes), redirects: manifest.redirects, base, devjarRuntime }
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
  if (manifest.version !== 4) throw new Error(`Unsupported Devjar build version: ${manifest.version}`)
  const base = normalizeBase(manifest.base)
  const devjarRuntime = await fileExists(join(root, '_jar/transform-assets.json'))
  const { send, serveFile } = createResponder({})
  const routeHtml = new Map<string, string>()
  for (const route of Object.keys(manifest.routes)) {
    const path = routeHtmlPath(root, route)
    routeHtml.set(route, await readFile(path, 'utf8'))
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
      const requestPath = decodedPath(withoutBase(base, url.pathname))
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
      if (requestPath.startsWith('/api/') && requestPath !== '/api/') {
        if (!await serveFile(request, response, join(root, 'api'), requestPath.slice('/api/'.length), new Set(['.json', '.txt']), noStore)) {
          send(request, response, 404, 'text/plain; charset=utf-8', 'Not found')
        }
        return
      }
      const destination = manifest.redirects[normalizeRoute(requestPath)]
      if (destination) {
        response.writeHead(302, { Location: withBase(base, routeHref(destination) + '/') + url.search })
        response.end()
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

  const beginClose = trackServerShutdown(server)

  await listen(server, port, host)

  let closePromise: Promise<void> | undefined
  const close = () => {
    closePromise ||= closeServer(server, beginClose)
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
