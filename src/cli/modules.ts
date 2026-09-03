import { readFile, realpath, stat } from 'node:fs/promises'
import { extname, relative, resolve, sep } from 'node:path'
import { init, parse } from 'es-module-lexer'
import { transformSync } from 'oxc-transform'
import { createEsmShResolver } from '../cdn'
import { sourceExtensions } from '../project'
import { getTransformErrorMessage, getTransformOptions } from '../transform'
import type { HmrUpdate } from './protocol'

export const localExtensions = [...sourceExtensions, '.css']

type ModuleGraphEntry = {
  dependencies: Set<string>
  refreshBoundary: boolean
}

export type CompiledProjectModule = {
  code: string
  dependencies: string[]
  refreshBoundary: boolean
}

export type CompileProjectModuleOptions = {
  root: string
  projectPath: string
  dependencies: Record<string, string>
  cdn: string
  moduleUrl: (projectPath: string) => string
  runtimeModuleUrl: string
  development: boolean
  refresh: boolean
  platform: 'browser' | 'server'
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
  if (await fileExists(path) && localExtensions.includes(extname(path))) return path
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
    if (extname(canonicalPath) === '.css') continue

    const source = await readFile(canonicalPath, 'utf8')
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

export function devModuleUrl(projectPath: string, version: number) {
  const parameters = new URLSearchParams({ path: projectPath })
  if (version) parameters.set('v', String(version))
  return `/_jar/module?${parameters}`
}

export function moduleAssetName(projectPath: string) {
  return `${Buffer.from(projectPath).toString('base64url')}.js`
}

export function builtModuleUrl(projectPath: string) {
  return `/_jar/modules/${moduleAssetName(projectPath)}`
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
  const source = await readFile(sourcePath, 'utf8')
  if (extname(sourcePath) === '.css') {
    return {
      code: options.platform === 'browser'
        ? browserCssModule(source, projectPath)
        : serverCssModule(source),
      dependencies: [],
      refreshBoundary: false,
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
  }
}

export class DevModuleGraph {
  private readonly modules = new Map<string, ModuleGraphEntry>()
  private readonly importers = new Map<string, Set<string>>()
  private readonly versions = new Map<string, number>()

  readonly moduleUrl = (projectPath: string) => (
    devModuleUrl(projectPath, this.versions.get(projectPath) || 0)
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
      if (!localExtensions.includes(extname(projectPath))
        || !this.modules.has(projectPath)) continue
      invalidated.add(projectPath)
      if (extname(projectPath) === '.css') {
        cssUpdates.add(projectPath)
        continue
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
