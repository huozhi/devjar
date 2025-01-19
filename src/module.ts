// declare esmsInitOptions on global window

declare global {
  interface Window {
    esmsInitOptions: {
      shimMode: boolean
      mapOverrides: boolean
    }
  }

  // importShim
  function importShim(url: string): Promise<any>
}

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
    imports['react-dom/client'] = getModuleUrl('react-dom/client')

    const script = document.createElement('script')
    script.type = 'importmap-shim'
    script.innerHTML = JSON.stringify({ imports })
    document.body.appendChild(script)
    if (currentImportMap) {
      currentImportMap.parentNode.removeChild(currentImportMap)
    }
    currentImportMap = script
  }


  function createInlinedModule(code, type) {
    if (type === 'css') return `data:text/css;utf-8,${encodeURIComponent(code)}`

    return `data:text/javascript;utf-8,${encodeURIComponent(code)}`
  }

  await setupImportMap()
  const imports = Object.fromEntries(
    Object.entries(files).map(([fileName, code]) => [
      fileName,
      createInlinedModule(code, fileName.endsWith('.css') ? 'css' : 'js'),
    ])
  )

  updateImportMap(imports)
  return self.importShim('index.js')
}

export { createModule }
