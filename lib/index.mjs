import { transform } from 'sucrase'

const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor

async function createModuleImporter(source) {
  const buildModule = new AsyncFunction(undefined, `return await import('data:text/javascript;base64,${btoa(source)}')`)
  let mod
  try {
    mod = buildModule()
  } catch (e) {
    return {}
  }
  return mod
}

function transformCode(source) {
  return transform(source, {
    transforms: ['jsx', 'typescript'],
  }).code
}

async function createModule(source) {
  const code = transformCode(source)
  return createModuleImporter(code)
}

export {
  createModule
}