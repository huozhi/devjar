export interface RefreshRuntime {
  injectIntoGlobalHook(target: typeof globalThis): void
  performReactRefresh(): unknown
  _getMountedRootCount?(): number
}

export interface ModuleRuntime {
  files?: Record<string, string>
  urls?: Record<string, string>
  revision?: number
  refreshRuntime?: RefreshRuntime
  hasRendered?: boolean
}

export interface ModuleNamespace {
  default?: unknown
  [exportName: string]: unknown
}

async function createModule(
  files: Record<string, string>,
  { resolveModule, dependencies = {}, runtime = {} }: {
    resolveModule: (specifier: string) => string
    dependencies?: Record<string, string[]>
    runtime?: ModuleRuntime
  }
): Promise<{ module: ModuleNamespace, changed: boolean }> {
  function isRefreshRuntime(value: unknown): value is RefreshRuntime {
    if (typeof value !== 'object' || value === null) return false
    return 'injectIntoGlobalHook' in value
      && typeof value.injectIntoGlobalHook === 'function'
      && 'performReactRefresh' in value
      && typeof value.performReactRefresh === 'function'
  }

  const localImportPrefix = '__DEVJAR_LOCAL_IMPORT__'

  function createLocalImportPlaceholder(moduleKey: string) {
    return `${localImportPrefix}${encodeURIComponent(moduleKey)}__`
  }

  function createInlinedModule(code: string) {
    return `data:text/javascript;utf-8,${encodeURIComponent(code)}`
  }

  function createCssModule(code: string) {
    return `\
const sheet = new CSSStyleSheet();
sheet.replaceSync(${JSON.stringify(code)});
export default sheet;`
  }

  function rewriteLocalImports(code: string, specifiers: Record<string, string>) {
    let rewritten = code
    for (const [moduleKey, specifier] of Object.entries(specifiers)) {
      rewritten = rewritten
        .split(createLocalImportPlaceholder(moduleKey))
        .join(specifier)
    }
    return rewritten
  }

  runtime.files ||= {}
  runtime.urls ||= {}
  runtime.revision = (runtime.revision || 0) + 1
  const runtimeFiles = runtime.files
  const runtimeUrls = runtime.urls

  const changedModules = new Set<string>()
  for (const [fileName, code] of Object.entries(files)) {
    if (runtimeFiles[fileName] !== code) changedModules.add(fileName)
  }
  for (const fileName of Object.keys(runtimeFiles)) {
    if (!(fileName in files)) changedModules.add(fileName)
  }

  const importers: Record<string, string[]> = {}
  for (const [importer, importedModules] of Object.entries(dependencies)) {
    for (const imported of importedModules) {
      ;(importers[imported] ||= []).push(importer)
    }
  }

  const invalidated = new Set(changedModules)
  const queue = [...changedModules]
  while (queue.length) {
    const changed = queue.shift()!
    for (const importer of importers[changed] || []) {
      if (invalidated.has(importer)) continue
      invalidated.add(importer)
      queue.push(importer)
    }
  }

  const moduleKeys = new Set(Object.keys(files))
  for (const importedModules of Object.values(dependencies)) {
    for (const moduleKey of importedModules) moduleKeys.add(moduleKey)
  }

  const moduleSources: Record<string, string> = {}
  for (const moduleKey of moduleKeys) {
    if (!(moduleKey in files)) {
      moduleSources[moduleKey] = `throw new Error(${JSON.stringify('devjar: Module not found: ' + moduleKey)})`
      delete runtimeUrls[moduleKey]
      continue
    }

    moduleSources[moduleKey] = moduleKey.endsWith('.css')
      ? createCssModule(files[moduleKey])
      : files[moduleKey]
  }

  const buildingUrls = new Set<string>()
  const buildModuleUrl = (moduleKey: string): string => {
    if (runtimeUrls[moduleKey] && !invalidated.has(moduleKey)) return runtimeUrls[moduleKey]
    if (buildingUrls.has(moduleKey)) {
      throw new Error('devjar: Circular local imports are not supported: ' + moduleKey)
    }

    buildingUrls.add(moduleKey)
    const specifiers: Record<string, string> = {}
    for (const imported of dependencies[moduleKey] || []) {
      specifiers[imported] = buildModuleUrl(imported)
    }

    const moduleCode = moduleKey.endsWith('.css')
      ? moduleSources[moduleKey]
      : rewriteLocalImports(moduleSources[moduleKey], specifiers)

    runtimeUrls[moduleKey] = createInlinedModule(moduleCode)
    buildingUrls.delete(moduleKey)
    return runtimeUrls[moduleKey]
  }

  for (const moduleKey of moduleKeys) {
    buildModuleUrl(moduleKey)
  }

  if (!runtime.refreshRuntime) {
    const refreshModule: ModuleNamespace = await import(/* webpackIgnore: true */ /* @vite-ignore */ /* turbopackIgnore: true */ resolveModule('react-refresh/runtime'))
    const refreshRuntime = refreshModule.default || refreshModule
    if (!isRefreshRuntime(refreshRuntime)) {
      throw new Error('devjar: Invalid react-refresh runtime module')
    }
    runtime.refreshRuntime = refreshRuntime
    runtime.refreshRuntime.injectIntoGlobalHook(self)
    Object.defineProperty(globalThis, '__devjarRefreshRuntime', {
      configurable: true,
      value: runtime.refreshRuntime,
      writable: true,
    })
  }

  if (!runtimeUrls['index']) {
    throw new Error('devjar: Module not found: index')
  }

  const module: ModuleNamespace = await import(/* webpackIgnore: true */ /* @vite-ignore */ /* turbopackIgnore: true */ runtimeUrls['index'])
  runtime.files = { ...files }
  return { module, changed: changedModules.size > 0 }
}

export { createModule }
