import { readFile, readdir, realpath, stat } from 'node:fs/promises'
import { extname, join, relative, resolve, sep } from 'node:path'
import { routeFromPagePath, sourceExtensions } from '../shared/project'
import type { RouteEntry, RouteManifest } from './protocol'
import { CDN_HOST, createEsmShResolver } from '../shared/cdn'
import { createRouteEvaluator, pageExports, type RouteEvaluation } from './route-evaluator'

export const pageExtensions = [...sourceExtensions, '.md']

export function routeFromCliPage(path: string) {
  return routeFromPagePath(path.endsWith('.md') ? path.slice(0, -3) + '.tsx' : path)
}

export type ManifestOptions = {
  liveReload: boolean
  revision: number
  base: string
  moduleUrl: (projectPath: string) => string
}

export function isInside(root: string, path: string) {
  const pathFromRoot = relative(root, path)
  return pathFromRoot === '' || (!pathFromRoot.startsWith(`..${sep}`) && pathFromRoot !== '..')
}

export type DiscoveredPages = {
  routes: Map<string, string>
  params: Map<string, Record<string, string>>
  redirects: Record<string, string>
  /** Project files read by paths() and defaultParams; editing one may change the routes. */
  routeInputs: Set<string>
  notFound: string | undefined
}

function segments(route: string) {
  return route.split('/').filter(Boolean)
}

function parameter(segment: string) {
  return /^\[([A-Za-z_$][\w$]*)\]$/.exec(segment)?.[1]
}

function checkedParams(value: unknown, names: string[], source: string): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== names.length
    || names.some(name => !Object.prototype.hasOwnProperty.call(value, name))) {
    throw new Error(`${source}: expected exactly these parameters: ${names.join(', ')}`)
  }
  for (const name of names) {
    const part = (value as Record<string, unknown>)[name]
    if (typeof part !== 'string' || !part || part === '.' || part === '..'
      || /[\/\\\x00-\x1f\x7f]/.test(part)) {
      throw new Error(`${source}: invalid path segment for ${name}`)
    }
  }
  return value as Record<string, string>
}

export async function discover(root: string, exclude: string[], resolver?: (specifier: string) => string): Promise<DiscoveredPages> {
  root = await realpath(root)
  const pagesRoot = join(root, 'pages')
  let pagesExist = false
  try {
    pagesExist = (await stat(pagesRoot)).isDirectory()
  } catch {}
  if (!pagesExist) {
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
      else if (entry.isFile() && pageExtensions.includes(extname(entry.name))) files.push(path)
    }
  }
  if (!isExcluded(pagesRoot)) await visit(pagesRoot)

  type Definition = { page: string; parts: string[]; names: string[]; defaults: boolean }
  const definitions: Definition[] = []
  let notFound: string | undefined
  for (const page of files.sort()) {
    const pagePath = relative(pagesRoot, page).split(sep).join('/')
    if (pagePath.slice(0, -extname(pagePath).length) === '404') notFound = page
    const route = routeFromCliPage(pagePath)
    if (route === undefined) continue
    const parts = segments(route)
    const names = parts.flatMap(part => parameter(part) ? [parameter(part)!] : [])
    if (parts.some(part => /[\[\]]/.test(part) && !parameter(part)) || new Set(names).size !== names.length) {
      throw new Error(`Unsupported dynamic route: ${pagePath}`)
    }
    if (page.endsWith('.md') && names.length) throw new Error(`Dynamic Markdown pages are not supported: ${pagePath}`)
    const inspect = !page.endsWith('.md') && (names.length > 0 || (await readFile(page, 'utf8')).includes('defaultParams'))
    const exports = inspect ? await pageExports(page) : new Set<string>()
    const defaults = exports.has('defaultParams')
    if (names.length && !defaults && !exports.has('paths')) {
      throw new Error(`${pagePath}: dynamic content pages must export paths()`)
    }
    if (defaults && (!/(?:^|\/)index\.[^.]+$/.test(pagePath) || exports.has('default') || exports.has('paths'))) {
      throw new Error(`${pagePath}: defaultParams requires an index without a default component or paths()`)
    }
    definitions.push({ page, parts, names, defaults })
  }
  let resolveModule = resolver
  if (!resolveModule) {
    let pkg: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> } = {}
    try { pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')) } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    resolveModule = createEsmShResolver({ ...pkg.dependencies, ...pkg.devDependencies }, CDN_HOST, false)
  }
  const executable = definitions.filter(definition => definition.defaults || definition.names.length)
  const evaluator = executable.length
    ? await createRouteEvaluator(root, executable.map(definition => definition.page), resolveModule)
    : undefined
  try {
    type Candidate = { definition: Definition; params: Record<string, string>; target: string | undefined }
    // Every page that claims a URL, keyed by its shape: 0 for a static segment,
    // 1 for [name]. The smallest shape (leftmost static segment) wins; equal shapes conflict.
    const claims = new Map<string, Map<string, Candidate>>()
    const routeFor = (parts: string[], params: Record<string, string>) => '/' + parts.map(part => parameter(part) ? params[parameter(part)!] : part).join('/')
    const add = (route: string, candidate: Candidate) => {
      if ((route === '/404' && candidate.definition.page !== notFound) || (route === '/_jar' || route.startsWith('/_jar/')) || route.startsWith('/api/')) {
        throw new Error(`Reserved route: ${route}`)
      }
      const shape = candidate.definition.parts.map(part => parameter(part) ? '1' : '0').join('')
      const shapes = claims.get(route) || new Map<string, Candidate>()
      const duplicate = shapes.get(shape)
      if (duplicate) throw new Error(`Multiple pages resolve to ${route}: ${relative(root, duplicate.definition.page)} and ${relative(root, candidate.definition.page)}`)
      claims.set(route, shapes.set(shape, candidate))
    }
    const winners = () => new Map([...claims].map(([route, shapes]) => (
      [route, shapes.get([...shapes.keys()].sort()[0])!] as const
    )))
    const content = definitions.filter(definition => !definition.defaults)
    const dynamic = content.filter(definition => definition.names.length)
    const results = await evaluator?.evaluate(dynamic.map(definition => ({ page: definition.page, name: 'paths', params: {} }))) || []
    for (const definition of content) {
      const rows = definition.names.length ? results[dynamic.indexOf(definition)] : [{}]
      if (!Array.isArray(rows)) throw new Error(`${definition.page}: paths() must return an array`)
      const seen = new Set<string>()
      for (const row of rows) {
        const params = checkedParams(row, definition.names, definition.page)
        const route = routeFor(definition.parts, params)
        if (seen.has(route)) throw new Error(`${definition.page}: duplicate path ${route}`)
        seen.add(route)
        add(route, { definition, params, target: undefined })
      }
    }
    let candidates = winners()
    const entrances: Array<{ definition: Definition; params: Record<string, string> }> = []
    for (const definition of definitions.filter(definition => definition.defaults)) {
      const instances = new Map<string, Record<string, string>>()
      if (!definition.names.length) instances.set(routeFor(definition.parts, {}), {})
      for (const [route, candidate] of candidates) {
        if (candidate.definition.page === notFound || !definition.parts.every((part, index) => part === candidate.definition.parts[index])) continue
        const parts = segments(route)
        if (parts.length <= definition.parts.length) continue
        const params: Record<string, string> = {}
        if (!definition.parts.every((part, index) => {
          const name = parameter(part)
          if (name) { Object.defineProperty(params, name, { value: parts[index], enumerable: true }); return true }
          return part === parts[index]
        })) continue
        instances.set(routeFor(definition.parts, params), params)
      }
      for (const params of instances.values()) entrances.push({ definition, params })
    }
    const defaults = await evaluator?.evaluate(entrances.map(({ definition, params }): RouteEvaluation => ({ page: definition.page, name: 'defaultParams', params }))) || []
    for (let index = 0; index < entrances.length; index++) {
      const { definition, params } = entrances[index]
      const value = defaults[index]
      const keys = value && typeof value === 'object' ? Object.keys(value) : []
      const next = keys[0]
      if (keys.length !== 1 || definition.names.includes(next)
        || !definitions.some(child => child.parts.length > definition.parts.length
          && definition.parts.every((part, index) => part === child.parts[index])
          && parameter(child.parts[definition.parts.length]) === next)) {
        throw new Error(`${definition.page}: defaultParams must supply exactly one immediate child parameter`)
      }
      const child = checkedParams(value, [next], definition.page)
      add(routeFor(definition.parts, params), {
        definition, params, target: routeFor([...definition.parts, `[${next}]`], { ...params, ...child }),
      })
    }
    candidates = winners()
    const routes = new Map<string, string>()
    const params = new Map<string, Record<string, string>>()
    const redirects: Record<string, string> = Object.create(null)
    for (const [route, candidate] of candidates) {
      if (candidate.target === undefined) {
        routes.set(route, candidate.definition.page)
        if (candidate.definition.names.length) params.set(route, candidate.params)
        continue
      }
      let target = candidate.target
      const visited = new Set([route])
      while (true) {
        if (visited.has(target)) throw new Error(`Default entrance cycle: ${[...visited, target].join(' -> ')}`)
        visited.add(target)
        const destination = candidates.get(target)
        if (!destination || destination.definition.page === notFound) {
          throw new Error(`${candidate.definition.page}: default entrance ${route} has no target: ${target}`)
        }
        if (destination.target === undefined) break
        target = destination.target
      }
      redirects[route] = target
    }
    if (!routes.size) throw new Error(`No content pages found in ${pagesRoot}`)
    return { routes, params, redirects, routeInputs: evaluator?.inputs || new Set(), notFound }
  } finally {
    await evaluator?.close()
  }
}

/** HTML files in pages/. They are not pages; `devjar file.html` previews them as-is. */
export async function findIgnoredHtml(root: string) {
  const files: string[] = []
  const visit = async (directory: string) => {
    let entries
    try {
      entries = await readdir(directory, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.name.startsWith('_') || entry.name.startsWith('.') || entry.name === 'node_modules') continue
      const path = join(directory, entry.name)
      if (entry.isDirectory()) await visit(path)
      else if (entry.isFile() && /\.html?$/i.test(entry.name)) files.push(relative(root, path).split(sep).join('/'))
    }
  }
  await visit(join(root, 'pages'))
  return files.sort()
}

/** Equal signatures mean the same URLs render the same pages with the same params. */
export function routeSignature(pages: DiscoveredPages) {
  return JSON.stringify([[...pages.routes], [...pages.params], Object.entries(pages.redirects)])
}

export function manifest(root: string, pages: Awaited<ReturnType<typeof discover>>, options: ManifestOptions): RouteManifest {
  const routes: Record<string, RouteEntry> = Object.create(null)
  for (const [route, page] of pages.routes) {
    const projectPath = relative(root, page).split(sep).join('/')
    routes[route] = { module: options.moduleUrl(projectPath), page: projectPath,
      ...(pages.params.has(route) ? { params: pages.params.get(route)! } : {}),
    }
  }

  const notFoundPath = pages.notFound
    ? relative(root, pages.notFound).split(sep).join('/')
    : undefined

  return {
    version: 4,
    base: options.base,
    liveReload: options.liveReload,
    revision: options.revision,
    routes,
    redirects: pages.redirects,
    notFound: notFoundPath
      ? { module: options.moduleUrl(notFoundPath), page: notFoundPath }
      : undefined,
  }
}

export async function loadRouteManifest(root: string, options: ManifestOptions): Promise<RouteManifest> {
  root = await realpath(root)
  return manifest(root, await discover(root, []), options)
}

/** Pages for `devjar dev chart.tsx`: one React or Markdown file served at `/`. */
export function singlePage(root: string, entry: string): Awaited<ReturnType<typeof discover>> {
  return { routes: new Map([['/', join(root, entry)]]), params: new Map(), redirects: {}, routeInputs: new Set(), notFound: undefined }
}
