import { getTransformErrorMessage, getTransformOptions } from './transform'

type OxcTransform = Pick<typeof import('oxc-transform'), 'transformSync'>

let oxc: OxcTransform | undefined
// Keep the local runtime import opaque so this worker can install its message
// handler before the WASI module begins its asynchronous initialization.
const dynamicImport = new Function('specifier', 'return import(specifier)')
const workerUrl = new URL(globalThis.location.href)
const bindingUrl = workerUrl.searchParams.get('binding')
const wasmUrl = workerUrl.searchParams.get('wasm')
const wasiWorkerUrl = workerUrl.searchParams.get('wasiWorker')

if (!bindingUrl || !wasmUrl || !wasiWorkerUrl) {
  throw new Error('devjar: transform worker asset URLs are required')
}

Object.assign(globalThis, {
  __devjarOxcWasmUrl: wasmUrl,
  __devjarOxcWasiWorkerUrl: wasiWorkerUrl,
})

function isOxcTransform(value: unknown): value is OxcTransform {
  return typeof value === 'object'
    && value !== null
    && 'transformSync' in value
    && typeof value.transformSync === 'function'
}

self.onmessage = async ({ data }: MessageEvent<{
  id: number
  files: Record<string, string>
}>) => {
  const { id, files } = data
  try {
    if (!oxc) {
      const module = await dynamicImport(bindingUrl)
      if (!isOxcTransform(module)) {
        throw new Error('devjar: Invalid Oxc transform module')
      }
      oxc = module
    }

    const transformed: Record<string, string> = {}
    for (const [filename, source] of Object.entries(files)) {
      const output = oxc.transformSync(filename, source, getTransformOptions(filename, true))

      const errorMessage = getTransformErrorMessage(output.errors)
      if (errorMessage) throw new Error(errorMessage)

      transformed[filename] = output.code
    }
    self.postMessage({ id, transformed })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    const stack = error instanceof Error ? error.stack : undefined
    self.postMessage({
      id,
      error: {
        message,
        stack,
      },
    })
  }
}

export {}
