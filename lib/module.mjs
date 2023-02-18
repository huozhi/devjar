async function createModule(files, { getModuleUrl }) {
  let currentImportMap
  let shim

  async function setupImportMap() {
    if (shim) return shim
    window.esmsInitOptions = {
      shimMode: true,
      mapOverrides: true,
    }
    shim = import(/* webpackIgnore: true */ getModuleUrl('es-module-shims'))
    await shim
  }

  function updateImportMap(imports) {
    imports['react'] = getModuleUrl('react')
    imports['react-dom'] = getModuleUrl('react-dom')

    const script = document.createElement('script')
    script.type = 'importmap-shim'
    script.innerHTML = JSON.stringify({ imports })
    document.body.appendChild(script)
    if (currentImportMap) {
      currentImportMap.parentNode.removeChild(currentImportMap)
    }
    currentImportMap = script
  }


  function createInlinedModule(code) {
    return `data:text/javascript;utf-8,${encodeURIComponent(code)}`
  }

  await setupImportMap()
  const imports = Object.fromEntries(
    Object.entries(files).map(([key, code]) => [
      key,
      createInlinedModule(code),
    ])
  )

  updateImportMap(imports)
  return self.importShim('index.js')
}

export { createModule }
