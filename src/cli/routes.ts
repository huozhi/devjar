import { readdir, realpath, stat } from 'node:fs/promises'
import { extname, join, relative, resolve, sep } from 'node:path'
import { routeFromPagePath, sourceExtensions } from '../shared/project'
import type { RouteEntry, RouteManifest } from './protocol'

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

export async function discover(root: string, exclude: string[]) {
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

export function manifest(root: string, pages: Awaited<ReturnType<typeof discover>>, options: ManifestOptions): RouteManifest {
  const routes: Record<string, RouteEntry> = {}
  for (const [route, page] of pages.routes) {
    const projectPath = relative(root, page).split(sep).join('/')
    routes[route] = { module: options.moduleUrl(projectPath), page: projectPath }
  }

  const notFoundPath = pages.notFound
    ? relative(root, pages.notFound).split(sep).join('/')
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

export async function loadRouteManifest(root: string, options: ManifestOptions): Promise<RouteManifest> {
  root = await realpath(root)
  return manifest(root, await discover(root, []), options)
}
