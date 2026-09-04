import { createHash } from 'node:crypto'
import { readFileSync, realpathSync, watch, type FSWatcher } from 'node:fs'
import { extname, isAbsolute, join, posix, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createEsmShResolver } from '../cdn'
import { compileProjectModule } from './modules'

type Package = {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  exports?: unknown
  module?: string
  main?: string
}

function readPackage(root: string): Package {
  try {
    return JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {}
    throw error
  }
}

function localPath(version: string, root: string) {
  if (version.startsWith('file://')) return fileURLToPath(version)
  if (version.startsWith('file:')) return resolve(root, version.slice(5))
  if (version.startsWith('link:')) return resolve(root, version.slice(5))
  if (isAbsolute(version) || version.startsWith('./') || version.startsWith('../')) return resolve(root, version)
}

function exportTarget(value: unknown, development: boolean, platform: 'browser' | 'server'): string | undefined {
  if (typeof value === 'string') return value
  if (!value || typeof value !== 'object') return undefined
  if (Array.isArray(value)) {
    for (const item of value) {
      const target = exportTarget(item, development, platform)
      if (target) return target
    }
    return undefined
  }
  const conditions = new Set(['import', 'default', platform === 'browser' ? 'browser' : 'node', development ? 'development' : 'production'])
  for (const [condition, target] of Object.entries(value)) {
    if (conditions.has(condition)) {
      const resolved = exportTarget(target, development, platform)
      if (resolved) return resolved
      if (target === null) return undefined
    }
  }
}

function entryPoint(pkg: Package, subpath: string, development: boolean, platform: 'browser' | 'server') {
  if (pkg.exports !== undefined) {
    const key = subpath ? `.${subpath}` : '.'
    const exports = pkg.exports
    let target: string | undefined
    if (exports && typeof exports === 'object' && !Array.isArray(exports)
      && Object.keys(exports).some(key => key.startsWith('.'))) {
      const entries = exports as Record<string, unknown>
      if (Object.prototype.hasOwnProperty.call(entries, key)) {
        target = exportTarget(entries[key], development, platform)
      } else {
        const patterns = Object.keys(entries).filter(pattern => pattern.includes('*'))
          .sort((a, b) => b.indexOf('*') - a.indexOf('*') || b.length - a.length)
        for (const pattern of patterns) {
          const [prefix, suffix] = pattern.split('*')
          if (!key.startsWith(prefix) || !key.endsWith(suffix) || key.length < prefix.length + suffix.length) continue
          target = exportTarget(entries[pattern], development, platform)
            ?.split('*').join(key.slice(prefix.length, suffix ? -suffix.length : undefined))
          break
        }
      }
    } else if (key === '.') {
      target = exportTarget(exports, development, platform)
    }
    if (!target?.startsWith('./')) throw new Error(`Local package does not export ${key}`)
    return target
  }
  return subpath ? `.${subpath}` : pkg.module || pkg.main || './index.js'
}

/** Only explicitly declared local packages are exposed through these URLs. */
export class LocalPackages {
  private roots = new Map<string, string>()
  private watchers = new Map<string, FSWatcher>()

  constructor(private options: {
    root: string
    prefix: string
    serverPrefix: string
    cdn: string
    development: boolean
    onChange: (() => void) | undefined
  }) {}

  private url(id: string, path: string, platform: 'browser' | 'server') {
    return `${platform === 'server' ? this.options.serverPrefix : this.options.prefix}/${id}?${new URLSearchParams({ path: posix.normalize(path), platform })}`
  }

  resolve(specifier: string, platform: 'browser' | 'server', importerRoot: string): string {
    if (/^https?:\/\//.test(specifier)) return specifier
    const name = specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0]
    const project = readPackage(this.options.root)
    const importer = importerRoot === this.options.root ? project : readPackage(importerRoot)
    const projectDependencies = { ...project.devDependencies, ...project.dependencies }
    const dependencies = { ...importer.dependencies, ...projectDependencies }
    if (['react', 'react-dom', 'react-refresh'].includes(name) && !(name in projectDependencies)) delete dependencies[name]
    const version = dependencies[name]
    const dependencyRoot = Object.prototype.hasOwnProperty.call(projectDependencies, name) ? this.options.root : importerRoot
    const path = version && localPath(version, dependencyRoot)
    if (!path) return createEsmShResolver(dependencies, this.options.cdn, this.options.development)(specifier)
    const root = realpathSync(path)
    const id = createHash('sha256').update(root).digest('hex').slice(0, 16)
    this.roots.set(id, root)
    if (this.options.onChange && !this.watchers.has(root)) {
      const watcher = watch(root, { recursive: true }, (_event, filename) => {
        if (filename && !/(?:^|[/\\])(?:\.git|node_modules)(?:[/\\]|$)/.test(filename)) this.options.onChange!()
      })
      this.watchers.set(root, watcher)
    }
    return this.url(id, entryPoint(readPackage(root), specifier.slice(name.length), this.options.development, platform), platform)
  }

  async load(url: URL): Promise<{ contents: string, contentType: string }> {
    const id = url.pathname.slice(url.pathname.lastIndexOf('/') + 1)
    const root = this.roots.get(id)
    const projectPath = url.searchParams.get('path')
    if (!root || !projectPath) throw new Error('Unknown local package module')
    const platform = url.searchParams.get('platform') === 'server' ? 'server' : 'browser'
    const compiled = await compileProjectModule({
      root,
      projectPath,
      resolveModule: specifier => this.resolve(specifier, platform, root),
      moduleUrl: path => this.url(id, path, platform),
      assetUrl: (path, contents) => {
        const types: Record<string, string> = {
          '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
          '.avif': 'image/avif', '.woff': 'font/woff', '.woff2': 'font/woff2',
          '.ttf': 'font/ttf', '.otf': 'font/otf',
        }
        return `data:${types[extname(path)] || 'application/octet-stream'};base64,${contents.toString('base64')}`
      },
      runtimeModuleUrl: createEsmShResolver({}, this.options.cdn, this.options.development)('devjar'),
      development: this.options.development,
      refresh: false,
      platform,
    })
    return { contents: compiled.code, contentType: 'text/javascript; charset=utf-8' }
  }

  close() {
    for (const watcher of this.watchers.values()) watcher.close()
    this.watchers.clear()
  }
}
