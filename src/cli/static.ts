import { createReadStream, watch, type FSWatcher } from 'node:fs'
import { readFile, readdir, realpath, stat } from 'node:fs/promises'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path'
import { browserLogPath, browserLogScript, createBrowserLogPrinter, receiveBrowserLog, withEarlyScript } from './browser-log'
import { contentTypes } from './content-types'

// Serves HTML documents and their files as-is, without pages/ routing. This is
// for HTML that agents generate: a single report.html, or a folder of output.

export type StaticTarget = {
  root: string
  /** The HTML file served at `/`, or undefined to serve a directory. */
  entry: string | undefined
}

export type StaticServerOptions = {
  target: StaticTarget
  host: string
  port: number
}

const eventsPath = '/_jar/events'
const listingLimit = 500
const listingDepth = 4

function isHtml(path: string) {
  const extension = extname(path).toLowerCase()
  return extension === '.html' || extension === '.htm'
}

function isHiddenSegment(segment: string) {
  return segment.startsWith('.') || segment === 'node_modules'
}

function isInside(root: string, path: string) {
  const pathFromRoot = relative(root, path)
  return pathFromRoot === '' || (!pathFromRoot.startsWith(`..${sep}`) && pathFromRoot !== '..')
}

async function statOrUndefined(path: string) {
  try {
    return await stat(path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT' || (error as NodeJS.ErrnoException).code === 'ENOTDIR') return
    throw error
  }
}

async function htmlFiles(directory: string, limit: number) {
  const files: string[] = []
  const visit = async (current: string, depth: number) => {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      if (files.length >= limit) return
      if (isHiddenSegment(entry.name)) continue
      const path = join(current, entry.name)
      if (entry.isDirectory()) {
        if (depth < listingDepth) await visit(path, depth + 1)
      } else if (entry.isFile() && isHtml(entry.name)) files.push(path)
    }
  }
  await visit(directory, 0)
  return files
}

/**
 * Resolves `devjar dev <path>` to static serving: an HTML file, or a directory
 * that has HTML files but no pages/ directory. Returns undefined for projects.
 */
export async function staticTarget(path: string): Promise<StaticTarget | undefined> {
  const info = await statOrUndefined(path)
  if (!info) return
  if (info.isFile()) {
    if (!isHtml(path)) {
      throw new Error(`Cannot serve ${basename(path)} directly. Pass an .html, .tsx, .jsx, or .md file, a folder of HTML files, or a project directory.`)
    }
    return { root: await realpath(dirname(path)), entry: basename(path) }
  }
  if (!info.isDirectory() || (await statOrUndefined(join(path, 'pages')))?.isDirectory()) return
  if (!(await htmlFiles(path, 1)).length) return
  return { root: await realpath(path), entry: undefined }
}

function escapeHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// Swaps changed stylesheets in place; otherwise reloads and keeps the scroll position.
const reloadScript = `<script type="module">
const key = 'devjar:scroll:' + location.pathname
try {
  const saved = sessionStorage.getItem(key)
  if (saved) {
    sessionStorage.removeItem(key)
    const [x, y] = JSON.parse(saved)
    const restore = () => scrollTo(x, y)
    if (document.readyState === 'complete') restore()
    else addEventListener('load', restore, { once: true })
  }
} catch {}
new EventSource(${JSON.stringify(eventsPath)}).addEventListener('change', event => {
  const change = JSON.parse(event.data)
  const links = change.reload ? [] : [...document.querySelectorAll('link[rel~="stylesheet"]')]
    .filter(link => link.href && change.paths.includes(decodeURIComponent(new URL(link.href).pathname)))
  if (links.length) {
    for (const link of links) {
      const next = link.cloneNode()
      const url = new URL(link.href)
      url.searchParams.set('devjar', Date.now())
      next.href = url.href
      next.addEventListener('load', () => link.remove(), { once: true })
      next.addEventListener('error', () => link.remove(), { once: true })
      link.after(next)
    }
    return
  }
  try { sessionStorage.setItem(key, JSON.stringify([scrollX, scrollY])) } catch {}
  location.reload()
})
</script>`

const logScript = browserLogScript(browserLogPath)

function withDevScripts(document: string) {
  const withLog = withEarlyScript(document, logScript)
  const bodyEnd = withLog.toLowerCase().lastIndexOf('</body>')
  return bodyEnd === -1
    ? withLog + reloadScript
    : withLog.slice(0, bodyEnd) + reloadScript + withLog.slice(bodyEnd)
}

async function listing(directory: string) {
  const files = await htmlFiles(directory, listingLimit)
  const entries = await Promise.all(files.map(async path => ({
    href: relative(directory, path).split(sep).map(encodeURIComponent).join('/'),
    name: relative(directory, path).split(sep).join('/'),
    modified: (await stat(path)).mtimeMs,
  })))
  entries.sort((a, b) => b.modified - a.modified || a.name.localeCompare(b.name))
  const title = escapeHtml(basename(directory) + '/')
  const items = entries.map(entry => {
    const slash = entry.name.lastIndexOf('/') + 1
    const folder = slash ? `<span>${escapeHtml(entry.name.slice(0, slash))}</span>` : ''
    return `<li><a href="${escapeHtml(entry.href)}">${folder}${escapeHtml(entry.name.slice(slash))}</a></li>`
  }).join('')
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light dark"><title>${title}</title>
<style>body{font:15px/1.6 system-ui,sans-serif;max-width:560px;margin:72px auto;padding:0 24px;color:#1f1f1f;background:#fff}h1{font-size:13px;font-weight:400;color:#8a8a8a;margin:0 0 20px}ul{list-style:none;margin:0;padding:0}a{display:block;margin:0 -10px;padding:6px 10px;border-radius:6px;color:inherit;text-decoration:none}a:hover{background:#f3f3f3}a span{color:#8a8a8a}p{color:#8a8a8a}@media (prefers-color-scheme:dark){body{color:#e8e8e8;background:#161616}a:hover{background:#242424}h1,a span,p{color:#8f8f8f}}</style>
</head><body><h1>${title}</h1>${items ? `<ul>${items}</ul>` : '<p>No HTML files.</p>'}</body></html>`
}

function send(request: IncomingMessage, response: ServerResponse, status: number, type: string, body: string) {
  response.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' })
  response.end(request.method === 'HEAD' ? undefined : body)
}

export async function startStaticServer(options: StaticServerOptions) {
  const { root, entry } = options.target
  const events = new Set<ServerResponse>()
  const printBrowserLog = createBrowserLogPrinter(message => console.error(message))

  async function serveHtml(request: IncomingMessage, response: ServerResponse, path: string) {
    if (entry) watchDirectory(dirname(path), false)
    send(request, response, 200, 'text/html; charset=utf-8', withDevScripts(await readFile(path, 'utf8')))
  }

  async function handle(request: IncomingMessage, response: ServerResponse) {
    if (request.method === 'POST' && request.url === browserLogPath) {
      await receiveBrowserLog(request, response, printBrowserLog)
      return
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { Allow: 'GET, HEAD' })
      response.end()
      return
    }
    const url = new URL(request.url || '/', 'http://localhost')
    if (url.pathname === eventsPath) {
      response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })
      if (request.method === 'HEAD') {
        response.end()
        return
      }
      response.write(': connected\n\n')
      events.add(response)
      request.on('close', () => events.delete(response))
      return
    }
    let segments: string[]
    try {
      segments = decodeURIComponent(url.pathname).split('/').filter(Boolean)
    } catch {
      send(request, response, 400, 'text/plain; charset=utf-8', 'Bad request')
      return
    }
    if (segments.some(segment => isHiddenSegment(segment) || segment === '..' || segment.includes('\\'))) {
      send(request, response, 404, 'text/plain; charset=utf-8', 'Not found')
      return
    }
    if (entry && !segments.length) {
      await serveHtml(request, response, join(root, entry))
      return
    }
    const path = resolve(root, ...segments)
    const info = isInside(root, path) ? await statOrUndefined(path) : undefined
    if (info?.isDirectory()) {
      // Relative URLs in a directory's index.html resolve from the trailing slash.
      if (!url.pathname.endsWith('/')) {
        response.writeHead(308, { Location: url.pathname + '/' + url.search })
        response.end()
        return
      }
      const index = join(path, 'index.html')
      if ((await statOrUndefined(index))?.isFile()) await serveHtml(request, response, index)
      else send(request, response, 200, 'text/html; charset=utf-8', withDevScripts(await listing(path)))
      return
    }
    if (!info?.isFile() || !isInside(root, await realpath(path))) {
      send(request, response, 404, 'text/plain; charset=utf-8', 'Not found')
      return
    }
    if (isHtml(path)) {
      await serveHtml(request, response, path)
      return
    }
    if (entry) watchDirectory(dirname(path), false)
    response.writeHead(200, {
      'Content-Type': contentTypes[extname(path).toLowerCase()] || 'application/octet-stream',
      'Content-Length': info.size,
      'Cache-Control': 'no-store',
    })
    if (request.method === 'HEAD') response.end()
    else createReadStream(path).pipe(response)
  }

  const server = createServer((request, response) => {
    handle(request, response).catch(error => {
      if (response.headersSent) response.destroy(error)
      else send(request, response, 500, 'text/plain; charset=utf-8', error instanceof Error ? error.message : String(error))
    })
  })

  let closing = false
  let timer: NodeJS.Timeout | undefined
  const changed = new Set<string>()
  const notify = (directory: string, filename: string | null) => {
    if (!filename) return
    const path = relative(root, join(directory, filename))
    if (path.split(sep).some(isHiddenSegment)) return
    changed.add('/' + path.split(sep).join('/'))
    clearTimeout(timer)
    timer = setTimeout(() => {
      const paths = [...changed]
      changed.clear()
      const css = paths.every(path => extname(path).toLowerCase() === '.css')
      const change = JSON.stringify({ reload: !css, paths })
      for (const response of events) response.write(`event: change\ndata: ${change}\n\n`)
    }, 40)
  }
  // A folder is watched whole so new HTML files appear in its listing. For a
  // single file, which may sit in a large folder such as Downloads, watch only
  // the directories of files the page has loaded.
  const watchers = new Map<string, FSWatcher>()
  const watchDirectory = (directory: string, recursive: boolean) => {
    if (watchers.has(directory) || closing) return
    const watcher = watch(directory, { recursive }, (_event, filename) => notify(directory, filename))
    watcher.on('error', () => {
      watcher.close()
      watchers.delete(directory)
    })
    watchers.set(directory, watcher)
  }
  if (entry) watchDirectory(root, false)
  else watchDirectory(root, true)

  try {
    await new Promise<void>((resolvePromise, reject) => {
      server.once('error', reject)
      server.listen(options.port, options.host, resolvePromise)
    })
  } catch (error) {
    for (const watcher of watchers.values()) watcher.close()
    throw error
  }

  let closePromise: Promise<void> | undefined
  const close = () => {
    closePromise ||= new Promise<void>((resolvePromise, reject) => {
      closing = true
      clearTimeout(timer)
      for (const watcher of watchers.values()) watcher.close()
      watchers.clear()
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
    host: options.host,
    port: (server.address() as AddressInfo).port,
    root,
    base: '/',
    entry,
    close,
  }
}
