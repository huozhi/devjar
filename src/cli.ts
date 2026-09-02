import { createReadStream } from 'node:fs'
import { readFile, realpath, stat } from 'node:fs/promises'
import { createServer, type ServerResponse } from 'node:http'
import { extname, join, normalize, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { watch } from 'node:fs'
import { transformSync } from 'oxc-transform'
import { CDN_HOST, createEsmShResolver } from './_cdn'
import { getTransformErrorMessage, getTransformOptions } from './_transform'

const sourceExtensions = ['.tsx', '.ts', '.jsx', '.js']
const localExtensions = [...sourceExtensions, '.css']
type PackageJson = {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  devjar?: {
    tailwind?: boolean | string
  }
}

type Project = {
  files: Record<string, string>
  dependencies: Record<string, string>
  page: string
  route: string
  tailwindSrc?: string | false
}

export type DevServerOptions = {
  root?: string
  host?: string
  port?: number
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

function routeCandidates(route: string) {
  const cleanRoute = route.replace(/^\/+|\/+$/g, '')
  const base = cleanRoute || 'index'
  const candidates = sourceExtensions.flatMap(extension => [
    `${base}${extension}`,
    `${base}/index${extension}`,
  ])
  if (cleanRoute) candidates.push(...sourceExtensions.map(extension => `404${extension}`))
  return candidates
}

async function resolvePage(root: string, route: string) {
  const pagesRoot = join(root, 'pages')
  for (const candidate of routeCandidates(route)) {
    const path = resolve(pagesRoot, candidate)
    if (!isInside(pagesRoot, path)) continue
    if (await fileExists(path)) return path
  }
}

async function readPackage(root: string): Promise<PackageJson> {
  try {
    return JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {}
    throw error
  }
}

export async function loadProject(root: string, route: string): Promise<Project> {
  const page = await resolvePage(root, route)
  if (!page) throw new Error(`No page found for /${route.replace(/^\/+/, '')}`)
  const packageJson = await readPackage(root)
  const projectPath = relative(root, page).split(sep).join('/')
  const files = await collectFiles(root, page)
  files['index.tsx'] = `export { default } from ${JSON.stringify(`./${projectPath}`)}\n`

  for (const [filename, source] of Object.entries(files)) {
    if (filename.endsWith('.css')) continue
    const output = transformSync(filename, source, getTransformOptions(filename))
    const error = getTransformErrorMessage(output.errors)
    if (error) throw new Error(error)
    files[filename] = output.code
  }

  return {
    files,
    dependencies: {
      ...packageJson.devDependencies,
      ...packageJson.dependencies,
    },
    page: projectPath,
    route,
    tailwindSrc: packageJson.devjar?.tailwind === false
      ? false
      : typeof packageJson.devjar?.tailwind === 'string'
        ? packageJson.devjar.tailwind
        : undefined,
  }
}

function send(response: ServerResponse, status: number, type: string, body: string | Buffer) {
  response.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
  })
  response.end(body)
}

function html(dependencies: Record<string, string>) {
  const resolveModule = createEsmShResolver(dependencies)
  const imports = {
    react: resolveModule('react'),
    'react-dom': resolveModule('react-dom'),
    'react/jsx-runtime': resolveModule('react/jsx-runtime'),
    'react/jsx-dev-runtime': resolveModule('react/jsx-dev-runtime'),
    'react-dom/client': resolveModule('react-dom/client'),
    'es-module-lexer': `${CDN_HOST}/es-module-lexer@1.6.0`,
    devjar: '/__devjar/runtime.js',
  }
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Devjar</title><script type="importmap">${JSON.stringify({ imports })}</script>
<style>html,body,#root{width:100%;height:100%;margin:0}iframe{display:block;width:100%;height:100%;border:0}.devjar-error{box-sizing:border-box;position:fixed;z-index:10;inset:auto 16px 16px;padding:14px 16px;border:1px solid #ffb4ab;border-radius:8px;background:#330a08;color:#ffdad6;font:13px/1.5 ui-monospace,monospace;white-space:pre-wrap}</style>
</head><body><div id="root"></div><script>
const root = document.getElementById('root')
const showBootstrapError = value => {
  root.className = 'devjar-error'
  root.textContent = 'Devjar could not start:\\n\\n' + value
}
addEventListener('error', event => showBootstrapError(event.message || 'A browser module failed to load'))
addEventListener('unhandledrejection', event => showBootstrapError(event.reason?.stack || event.reason || 'An asynchronous module failed'))
</script><script type="module" src="/__devjar/client.js"></script></body></html>`
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

async function serveFile(response: ServerResponse, root: string, requestPath: string, allowed?: Set<string>) {
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
  createReadStream(canonicalPath).pipe(response)
  return true
}

export async function startDevServer(options: DevServerOptions = {}) {
  const root = resolve(options.root || process.cwd())
  const host = options.host || '127.0.0.1'
  const port = options.port ?? 3000
  const events = new Set<ServerResponse>()
  const moduleRoot = fileURLToPath(new URL('.', import.meta.url))
  const runtimeRoot = await fileExists(join(moduleRoot, 'index.js'))
    ? moduleRoot
    : resolve(moduleRoot, '../dist')

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
        response.write(': connected\n\n')
        events.add(response)
        request.on('close', () => events.delete(response))
        return
      }
      if (url.pathname === '/__devjar/project') {
        const route = url.searchParams.get('route') || '/'
        try {
          const project = await loadProject(root, route)
          send(response, 200, 'application/json; charset=utf-8', JSON.stringify(project))
        } catch (error) {
          send(response, 404, 'application/json; charset=utf-8', JSON.stringify({ error: error instanceof Error ? error.message : String(error) }))
        }
        return
      }
      if (url.pathname === '/__devjar/runtime.js') {
        if (!await serveFile(response, runtimeRoot, 'index.js')) send(response, 500, 'text/plain', 'Devjar runtime is missing')
        return
      }
      if (url.pathname.startsWith('/__devjar/')) {
        if (!await serveFile(response, runtimeRoot, url.pathname.slice('/__devjar/'.length))) send(response, 404, 'text/plain', 'Not found')
        return
      }
      if (url.pathname.startsWith('/api/')) {
        if (!await serveFile(response, join(root, 'api'), url.pathname.slice('/api/'.length), new Set(['.json', '.txt']))) {
          send(response, 404, 'text/plain; charset=utf-8', 'Not found')
        }
        return
      }
      if (await serveFile(response, join(root, 'public'), url.pathname.slice(1))) return
      const packageJson = await readPackage(root)
      send(response, 200, 'text/html; charset=utf-8', html({ ...packageJson.devDependencies, ...packageJson.dependencies }))
    } catch (error) {
      send(response, 500, 'text/plain; charset=utf-8', error instanceof Error ? error.stack || error.message : String(error))
    }
  })

  let timer: NodeJS.Timeout | undefined
  const watcher = watch(root, { recursive: true }, (_event, filename) => {
    if (!filename || /(?:^|[/\\])(?:\.git|node_modules|dist)(?:[/\\]|$)/.test(filename)) return
    clearTimeout(timer)
    timer = setTimeout(() => {
      for (const response of events) response.write('event: change\ndata: {}\n\n')
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
