
async function createModule(files, { getModulePath }) {
  const supports = globalThis.HTMLScriptElement.supports || (() => false)
  const isImportMapSupported = supports('importmap')

  let currentImportMap
  let shim

  async function setupImportMap() {
    if (shim) return shim
    window.esmsInitOptions = {
      shimMode: true,
      mapOverrides: true,
    }
    shim = import(/* webpackIgnore: true */ getModulePath('es-module-shims'))
    await shim
  }

  function updateImportMap(imports, onload, onerror) {
    imports['react'] = getModulePath('react')
    imports['react-dom'] = getModulePath('react-dom')

    const script = document.createElement('script')
    script.type = 'importmap' + (isImportMapSupported ? '' : '-shim')
    script.textContent = JSON.stringify({ imports })
    document.body.appendChild(script)
    if (onload) script.onload = onload
    if (onerror) script.onerror = onerror
    if (currentImportMap) {
      currentImportMap.parentNode.removeChild(currentImportMap)
    }
    currentImportMap = script
  }

  function createInlinedModule(code) {
    return `data:text/javascript;utf-8,${encodeURIComponent(code)}`
  }

  const imports = Object.fromEntries(
    Object.entries(files).map(([key, code]) => [
      key,
      createInlinedModule(code),
    ])
  )

  if (!isImportMapSupported) {
    await setupImportMap()
    updateImportMap(imports)
    return self.importShim('index.mjs')
  }

  return new Promise((resolve, reject) => {
    updateImportMap(imports, () => {
      resolve(import(/* webpackIgnore: true */ 'index.mjs'))
    }),
    reject
  })
}

export { createModule }
