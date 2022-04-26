let currentImportMap
let shim

export async function setupImportMap() {
  if (shim) return shim
  window.esmsInitOptions = {
    shimMode: true,
    mapOverrides: true,
  }
  shim = import('es-module-shims')
  await shim
}

export function updateImportMap(imports) {
  imports['react'] = 'https://esm.sh/react'

  const script = document.createElement('script')
  script.type = 'importmap-shim'
  script.innerHTML = JSON.stringify({ imports })
  document.body.appendChild(script)
  if (currentImportMap) {
    currentImportMap.parentNode.removeChild(currentImportMap)
  }
  currentImportMap = script
}
