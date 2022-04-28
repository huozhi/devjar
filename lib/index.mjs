async function createModule(files) {
  let currentImportMap
  let shim

  async function setupImportMap() {
    if (shim) return shim
    window.esmsInitOptions = {
      shimMode: true,
      mapOverrides: true,
    }
    shim = import('es-module-shims')
    await shim
  }

  function updateImportMap(imports) {
    imports['react'] = 'https://esm.sh/react'
    imports['react-dom'] = 'https://esm.sh/react-dom'

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

  async function transformCode(code) {
    const { transform } = await import('sucrase')
    return transform(code, {
      transforms: ['jsx', 'typescript'],
    }).code
  }

  await setupImportMap()
  const imports = Object.fromEntries(
    Object.entries(files).map(([key, code]) => [
      key,
      createInlinedModule(transformCode(code)),
    ])
  )

  updateImportMap(imports)
  return self.importShim('index.js')
}

export { createModule }
