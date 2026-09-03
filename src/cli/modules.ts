import { createHash } from 'node:crypto'
import { readFile, realpath, stat } from 'node:fs/promises'
import { basename, extname, relative, resolve, sep } from 'node:path'
import { init, parse } from 'es-module-lexer'
import { transformSync } from 'oxc-transform'
import { createEsmShResolver } from '../cdn'
import { sourceExtensions, withBase } from '../project'
import { getTransformErrorMessage, getTransformOptions } from '../transform'
import type { HmrUpdate } from './protocol'

export const staticAssetExtensions = [
  '.avif',
  '.gif',
  '.ico',
  '.jpeg',
  '.jpg',
  '.mp3',
  '.mp4',
  '.ogg',
  '.otf',
  '.pdf',
  '.png',
  '.svg',
  '.ttf',
  '.wav',
  '.webm',
  '.webp',
  '.woff',
  '.woff2',
] as const
export const localExtensions = [...sourceExtensions, '.css', ...staticAssetExtensions]

type ModuleGraphEntry = {
  dependencies: Set<string>
  refreshBoundary: boolean
}

export type CompiledProjectModule = {
  code: string
  dependencies: string[]
  refreshBoundary: boolean
  style: string | undefined
}

export type CompileProjectModuleOptions = {
  root: string
  projectPath: string
  dependencies: Record<string, string>
  cdn: string
  moduleUrl: (projectPath: string) => string
  assetUrl: (projectPath: string, contents: Buffer) => string
  runtimeModuleUrl: string
  development: boolean
  refresh: boolean
  platform: 'browser' | 'server'
}

export function isStaticAsset(projectPath: string) {
  return (staticAssetExtensions as readonly string[]).includes(extname(projectPath).toLowerCase())
}

export function staticAssetName(projectPath: string, contents: Buffer) {
  const extension = extname(projectPath).toLowerCase()
  const name = basename(projectPath, extname(projectPath))
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'asset'
  const hash = createHash('sha256').update(contents).digest('hex').slice(0, 10)
  return `${name}-${hash}${extension}`
}

export function devAssetUrl(projectPath: string, contents: Buffer, base: string) {
  const parameters = new URLSearchParams({
    path: projectPath,
    v: createHash('sha256').update(contents).digest('hex').slice(0, 10),
  })
  return `${withBase(base, '/_jar/asset')}?${parameters}`
}

export function builtAssetUrl(projectPath: string, contents: Buffer, base: string) {
  return withBase(base, `/_jar/assets/${staticAssetName(projectPath, contents)}`)
}

async function fileExists(path: string) {
  try {
    return (await stat(path)).isFile()
  } catch {
    return false
  }
}

function isInside(root: string, path: string) {
  const pathFromRoot = relative(root, path)
  return pathFromRoot === ''
    || (!pathFromRoot.startsWith(`..${sep}`) && pathFromRoot !== '..')
}

async function findSourceFile(path: string) {
  if (await fileExists(path) && localExtensions.includes(extname(path).toLowerCase())) return path
  if (extname(path)) return
  for (const extension of localExtensions) {
    if (await fileExists(path + extension)) return path + extension
  }
  for (const extension of localExtensions) {
    const indexPath = resolve(path, `index${extension}`)
    if (await fileExists(indexPath)) return indexPath
  }
}

async function localImports(projectPath: string, source: string) {
  const output = transformSync(
    projectPath,
    source,
    getTransformOptions(projectPath, false, false),
  )
  const error = getTransformErrorMessage(output.errors)
  if (error) throw new Error(error)

  await init
  const [parsedImports] = parse(output.code)
  const imports = new Set<string>()
  for (const imported of parsedImports) {
    if (imported.n?.startsWith('./') || imported.n?.startsWith('../')) {
      imports.add(imported.n)
    }
  }
  return imports
}

function cssAssetSpecifiers(source: string) {
  const specifiers = new Set<string>()
  for (const match of source.matchAll(/url\(\s*(?:(["'])(.*?)\1|([^)'"\s][^)]*))\s*\)/g)) {
    const specifier = (match[2] || match[3] || '').trim()
    const path = specifier.split(/[?#]/, 1)[0]
    if (path && !path.startsWith('/') && !path.startsWith('#')
      && !/^(?:data|https?):/i.test(path)) specifiers.add(specifier)
  }
  return specifiers
}

async function resolveCssAssets(
  root: string,
  sourcePath: string,
  source: string,
) {
  const assets = new Map<string, { path: string, projectPath: string, contents: Buffer }>()
  for (const specifier of cssAssetSpecifiers(source)) {
    const path = specifier.split(/[?#]/, 1)[0]
    const assetPath = await resolveProjectSource(root, relative(root, resolve(sourcePath, '..', path)))
    if (!isStaticAsset(assetPath)) {
      throw new Error(`CSS URL must reference a static asset: ${specifier}`)
    }
    assets.set(specifier, {
      path: assetPath,
      projectPath: relative(root, assetPath).split(sep).join('/'),
      contents: await readFile(assetPath),
    })
  }
  return assets
}

function rewriteCssAssets(
  source: string,
  assets: Map<string, { path: string, projectPath: string, contents: Buffer }>,
  assetUrl: CompileProjectModuleOptions['assetUrl'],
) {
  return source.replace(
    /url\(\s*(?:(["'])(.*?)\1|([^)'"\s][^)]*))\s*\)/g,
    (match, _quote: string | undefined, quoted: string | undefined, unquoted: string | undefined) => {
      const specifier = (quoted || unquoted || '').trim()
      const asset = assets.get(specifier)
      if (!asset) return match
      const path = specifier.split(/[?#]/, 1)[0]
      const suffix = specifier.slice(path.length)
      return match.replace(specifier, `${assetUrl(asset.projectPath, asset.contents)}${suffix}`)
    },
  )
}

export async function collectProjectFiles(root: string, entry: string) {
  const projectPaths = new Set<string>()
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

    const projectPath = relative(root, canonicalPath).split(sep).join('/')
    projectPaths.add(projectPath)
    if (isStaticAsset(canonicalPath)) continue

    const source = await readFile(canonicalPath, 'utf8')
    if (extname(canonicalPath) === '.css') {
      for (const asset of (await resolveCssAssets(root, canonicalPath, source)).values()) {
        queue.push(asset.path)
      }
      continue
    }
    for (const specifier of await localImports(projectPath, source)) {
      const imported = await findSourceFile(resolve(canonicalPath, '..', specifier))
      if (!imported) {
        throw new Error(`Cannot resolve ${specifier} imported by ${projectPath}`)
      }
      queue.push(imported)
    }
  }
  return projectPaths
}

export function devModuleUrl(projectPath: string, version: number, base: string) {
  const parameters = new URLSearchParams({ path: projectPath })
  if (version) parameters.set('v', String(version))
  return `${withBase(base, '/_jar/module')}?${parameters}`
}

export function moduleAssetName(projectPath: string) {
  return `${Buffer.from(projectPath).toString('base64url')}.js`
}

export function builtModuleUrl(projectPath: string, base: string) {
  return withBase(base, `/_jar/modules/${moduleAssetName(projectPath)}`)
}

function browserCssModule(source: string, projectPath: string) {
  return `const sheet = new CSSStyleSheet()
sheet.replaceSync(${JSON.stringify(source)})
globalThis.__jarStyleSheets ||= new Map()
const previous = globalThis.__jarStyleSheets.get(${JSON.stringify(projectPath)})
const sheets = [...document.adoptedStyleSheets]
const index = sheets.indexOf(previous)
if (index < 0) sheets.push(sheet)
else sheets[index] = sheet
document.adoptedStyleSheets = sheets
globalThis.__jarStyleSheets.set(${JSON.stringify(projectPath)}, sheet)
export default sheet
`
}

function serverCssModule(source: string) {
  return `export default ${JSON.stringify(source)}\n`
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
  options: CompileProjectModuleOptions,
): Promise<CompiledProjectModule> {
  const sourcePath = await resolveProjectSource(options.root, options.projectPath)
  const projectPath = relative(options.root, sourcePath).split(sep).join('/')
  const contents = await readFile(sourcePath)
  if (isStaticAsset(sourcePath)) {
    return {
      code: `export default ${JSON.stringify(options.assetUrl(projectPath, contents))}\n`,
      dependencies: [],
      refreshBoundary: false,
      style: undefined,
    }
  }

  let source = contents.toString('utf8')
  if (extname(sourcePath) === '.css') {
    const assets = await resolveCssAssets(options.root, sourcePath, source)
    source = rewriteCssAssets(source, assets, options.assetUrl)
    return {
      code: options.platform === 'browser'
        ? browserCssModule(source, projectPath)
        : serverCssModule(source),
      dependencies: [...assets.values()].map(asset => asset.projectPath),
      refreshBoundary: false,
      style: source,
    }
  }

  const output = transformSync(
    projectPath,
    source,
    getTransformOptions(projectPath, options.development, options.refresh),
  )
  const error = getTransformErrorMessage(output.errors)
  if (error) throw new Error(error)

  await init
  const [imports, exports] = parse(output.code)
  const replacements: Array<{ start: number, end: number, value: string }> = []
  const localDependencies: string[] = []
  const resolveModule = createEsmShResolver(
    options.dependencies,
    options.cdn,
    options.development,
  )
  for (const imported of imports) {
    if (!imported.n) continue
    let value: string
    if (imported.n === 'devjar') {
      value = options.runtimeModuleUrl
    } else if (imported.n.startsWith('./') || imported.n.startsWith('../')) {
      const importedPath = await resolveProjectSource(
        options.root,
        relative(options.root, resolve(sourcePath, '..', imported.n)),
      )
      const importedProjectPath = relative(options.root, importedPath).split(sep).join('/')
      value = options.moduleUrl(importedProjectPath)
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
  const refreshBoundary = options.refresh
    && exports.length > 0
    && exports.every(exported => Boolean(exported.ln && refreshNames.has(exported.ln)))
  if (options.refresh) {
    const registeredExports = exports
      .filter(exported => exported.ln)
      .map(exported => `${JSON.stringify(exported.n)}: ${exported.ln}`)
      .join(', ')
    code = `const $RefreshReg$ = (type, id) => globalThis.__jarRefreshRuntime.register(type, ${JSON.stringify(`${projectPath} `)} + id)
const $RefreshSig$ = globalThis.__jarRefreshRuntime.createSignatureFunctionForTransform
${code}
globalThis.__jarRegisterModule(${JSON.stringify(projectPath)}, import.meta.url, { ${registeredExports} })
`
  }
  return {
    code,
    dependencies: [...new Set(localDependencies)],
    refreshBoundary,
    style: undefined,
  }
}

export class DevModuleGraph {
  private readonly modules = new Map<string, ModuleGraphEntry>()
  private readonly importers = new Map<string, Set<string>>()
  private readonly versions = new Map<string, number>()

  constructor(private readonly base: string) {}

  readonly moduleUrl = (projectPath: string) => (
    devModuleUrl(projectPath, this.versions.get(projectPath) || 0, this.base)
  )

  update(projectPath: string, compiled: CompiledProjectModule) {
    const previous = this.modules.get(projectPath)
    for (const dependency of previous?.dependencies || []) {
      this.importers.get(dependency)?.delete(projectPath)
    }

    const dependencies = new Set(compiled.dependencies)
    this.modules.set(projectPath, {
      dependencies,
      refreshBoundary: compiled.refreshBoundary,
    })
    for (const dependency of dependencies) {
      let dependencyImporters = this.importers.get(dependency)
      if (!dependencyImporters) {
        dependencyImporters = new Set()
        this.importers.set(dependency, dependencyImporters)
      }
      dependencyImporters.add(projectPath)
    }
  }

  invalidate(changedFiles: string[]) {
    const invalidated = new Set<string>()
    const cssUpdates = new Set<string>()
    const refreshBoundaries = new Set<string>()
    let reload = false

    for (const projectPath of changedFiles) {
      if (!localExtensions.includes(extname(projectPath).toLowerCase())
        || (!this.modules.has(projectPath) && !this.importers.has(projectPath))) continue
      invalidated.add(projectPath)
      if (extname(projectPath).toLowerCase() === '.css') {
        cssUpdates.add(projectPath)
        continue
      }
      if (isStaticAsset(projectPath)) {
        for (const importer of this.importers.get(projectPath) || []) {
          if (extname(importer).toLowerCase() === '.css') {
            invalidated.add(importer)
            cssUpdates.add(importer)
          }
        }
      }
      const result = this.findRefreshBoundaries(projectPath)
      reload ||= result.reload
      for (const boundary of result.boundaries) {
        invalidated.add(boundary)
        refreshBoundaries.add(boundary)
      }
    }

    for (const projectPath of invalidated) {
      this.versions.set(projectPath, (this.versions.get(projectPath) || 0) + 1)
    }
    const updates: HmrUpdate[] = [
      ...[...cssUpdates].map(path => ({
        path,
        type: 'css' as const,
        url: this.moduleUrl(path),
      })),
      ...[...refreshBoundaries].map(path => ({
        path,
        type: 'refresh' as const,
        url: this.moduleUrl(path),
      })),
    ]
    return { invalidated: invalidated.size > 0, reload, updates }
  }

  private findRefreshBoundaries(projectPath: string) {
    const boundaries = new Set<string>()
    const visited = new Set<string>()
    const queue = [projectPath]
    let reload = false

    while (queue.length) {
      const current = queue.shift()!
      if (visited.has(current)) continue
      visited.add(current)
      const entry = this.modules.get(current)
      if (entry?.refreshBoundary) {
        boundaries.add(current)
        continue
      }
      const importers = this.importers.get(current)
      if (!importers?.size) {
        reload = true
        continue
      }
      queue.push(...importers)
    }
    return { boundaries, reload }
  }
}
