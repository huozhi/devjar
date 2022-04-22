import { transform } from 'sucrase'

const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor

async function createModuleImporter(code) {
  const buildModule = new AsyncFunction(undefined, `return await import('data:text/javascript;base64,${btoa(code)}')`)
  let mod
  try {
    mod = buildModule()
  } catch (e) {
    return {}
  }
  return mod
}

function transformCode(code) {
  return transform(code, {
    transforms: ['jsx', 'typescript'],
  }).code
}

async function compileModule(code) {
  const transformed = transformCode(code)
  return createModuleImporter(transformed)
}

async function createModule(code) {
  let mod = {}, error
  try {
    mod = await compileModule(code)
  } catch (e) {
    error = e
  }
  return { mod, error }
}

export {
  createModule,
}
