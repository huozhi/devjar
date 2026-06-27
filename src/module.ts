async function createModule(
  files: Record<string, string>,
  { resolveModule, dependencies = {}, runtime = {} }: {
    resolveModule: (specifier: string) => string
    dependencies?: Record<string, string[]>
    runtime?: any
  }
): Promise<{ module: any, changed: boolean }> {
  const localImportPrefix = '__DEVJAR_LOCAL_IMPORT__'

  function createLocalImportPlaceholder(moduleKey: string) {
    return `${localImportPrefix}${encodeURIComponent(moduleKey)}__`
  }

  function createInlinedModule(code) {
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

  const changedModules = new Set<string>()
  for (const [fileName, code] of Object.entries(files)) {
    if (runtime.files[fileName] !== code) changedModules.add(fileName)
  }
  for (const fileName of Object.keys(runtime.files)) {
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
    const changed = queue.shift()
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
      delete runtime.urls[moduleKey]
      continue
    }

    moduleSources[moduleKey] = moduleKey.endsWith('.css')
      ? createCssModule(files[moduleKey])
      : files[moduleKey]
  }

  const buildingUrls = new Set<string>()
  const buildModuleUrl = (moduleKey: string): string => {
    if (runtime.urls[moduleKey] && !invalidated.has(moduleKey)) return runtime.urls[moduleKey]
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

    runtime.urls[moduleKey] = createInlinedModule(moduleCode)
    buildingUrls.delete(moduleKey)
    return runtime.urls[moduleKey]
  }

  for (const moduleKey of moduleKeys) {
    buildModuleUrl(moduleKey)
  }

  if (!runtime.refreshRuntime) {
    const refreshModule = await import(/* webpackIgnore: true */ /* @vite-ignore */ /* turbopackIgnore: true */ resolveModule('react-refresh/runtime'))
    runtime.refreshRuntime = refreshModule.default || refreshModule
    runtime.refreshRuntime.injectIntoGlobalHook(self)
    globalThis.__devjarRefreshRuntime = runtime.refreshRuntime
  }

  if (!runtime.urls['index']) {
    throw new Error('devjar: Module not found: index')
  }

  const module = await import(/* webpackIgnore: true */ /* @vite-ignore */ /* turbopackIgnore: true */ runtime.urls['index'])
  runtime.files = { ...files }
  return { module, changed: changedModules.size > 0 }
}

export { createModule }
