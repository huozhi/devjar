import { transform } from 'sucrase'
import { setupImportMap, updateImportMap } from './utils/importmap.mjs'

function createInlinedModule(code) {
  return `data:text/javascript;utf-8,${encodeURIComponent(code)}`
}

function transformCode(code) {
  return transform(code, {
    transforms: ['jsx', 'typescript'],
  }).code
}

async function createModule(source) {
  await setupImportMap()
  updateImportMap(
    Object.fromEntries(
      Object.entries(source).map(([key, value]) => [
        key,
        createInlinedModule(transformCode(value)),
      ])
    )
  )
  return self.importShim('index.js')
}

export { createModule }
