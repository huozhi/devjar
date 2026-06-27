// declare esmsInitOptions on global window

declare global {
  interface Window {
    esmsInitOptions: {
      shimMode: boolean
      mapOverrides: boolean
    }
  }

  function importShim(url: string): Promise<any>
}

async function createModule(
  files: Record<string, string>,
  { getModuleUrl, dependencies = {}, runtime = {} }: {
    getModuleUrl: (name: string) => string
    dependencies?: Record<string, string[]>
    runtime?: any
  }
): Promise<{ module: any, changed: boolean }> {

  async function setupImportMap() {
    if (runtime.shim) return runtime.shim
    window.esmsInitOptions = {
      shimMode: true,
      mapOverrides: true,
    }
    runtime.shim = import(/* webpackIgnore: true */ getModuleUrl('es-module-shims'))
    await runtime.shim
  }

  function updateImportMap(imports: Record<string, string>) {
    imports['react'] = getModuleUrl('react')
    imports['react-dom'] = getModuleUrl('react-dom')
    imports['react-dom/client'] = getModuleUrl('react-dom/client')
    imports['react-refresh/runtime'] = getModuleUrl('react-refresh/runtime')

    const script = document.createElement('script')
    script.type = 'importmap-shim'
    script.innerHTML = JSON.stringify({ imports })
    document.body.appendChild(script)
    if (runtime.currentImportMap) {
      runtime.currentImportMap.parentNode.removeChild(runtime.currentImportMap)
    }
    runtime.currentImportMap = script
  }


  function createInlinedModule(code, type) {
    if (type === 'css') return `data:text/css;utf-8,${encodeURIComponent(code)}`

    return `data:text/javascript;utf-8,${encodeURIComponent(code)}`
  }

  await setupImportMap()
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

  const imports = {}
  for (const [fileName, code] of Object.entries(files)) {
    if (!runtime.urls[fileName] || invalidated.has(fileName)) {
      const versionedCode = fileName.endsWith('.css')
        ? code
        : `${code}\n//# sourceURL=devjar/${fileName}?v=${runtime.revision}`
      runtime.urls[fileName] = createInlinedModule(
        versionedCode,
        fileName.endsWith('.css') ? 'css' : 'js'
      )
    }
    imports[fileName] = runtime.urls[fileName]
  }

  for (const fileName of Object.keys(runtime.files)) {
    if (!(fileName in files)) {
      imports[fileName] = createInlinedModule(
        `throw new Error(${JSON.stringify('devjar: Module not found: ' + fileName)})`,
        'js'
      )
      delete runtime.urls[fileName]
    }
  }

  updateImportMap(imports)

  if (!runtime.refreshRuntime) {
    const refreshModule = await self.importShim('react-refresh/runtime')
    runtime.refreshRuntime = refreshModule.default || refreshModule
    runtime.refreshRuntime.injectIntoGlobalHook(self)
    globalThis.__devjarRefreshRuntime = runtime.refreshRuntime
  }

  const module = await self.importShim('index')
  runtime.files = { ...files }
  return { module, changed: changedModules.size > 0 }
}

export { createModule }
