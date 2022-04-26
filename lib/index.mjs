import { transform } from 'sucrase'
import { setupImportMap, updateImportMap } from './utils/import-map.mjs'

function createInlinedModule(code) {
  return `data:text/javascript;utf-8,${encodeURIComponent(code)}`
}

function transformCode(code) {
  return transform(code, {
    transforms: ['jsx', 'typescript'],
  }).code
}

async function createModule(files) {
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
