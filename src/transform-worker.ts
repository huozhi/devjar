import { getTransformErrorMessage, getTransformOptions } from './transform'

type OxcTransform = Pick<typeof import('oxc-transform'), 'transformSync'>

// Keep the local runtime import opaque so this worker can install its message
// handler before the WASI module begins its asynchronous initialization.
const dynamicImport = new Function('specifier', 'return import(specifier)')
const workerUrl = new URL(globalThis.location.href)

function requiredAssetUrl(name: string) {
  const url = workerUrl.searchParams.get(name)
  if (!url) throw new Error(`devjar: transform worker asset URL is required: ${name}`)
  return url
}

const bindingUrl = requiredAssetUrl('binding')
const wasmUrl = requiredAssetUrl('wasm')
const wasiWorkerUrl = requiredAssetUrl('wasiWorker')

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

async function loadOxc() {
  const wasiWorkerResponse = await fetch(wasiWorkerUrl)
  if (!wasiWorkerResponse.ok) {
    throw new Error(
      `devjar: Failed to preload WASI worker: ${wasiWorkerResponse.status} ${wasiWorkerResponse.statusText}`,
    )
  }
  await wasiWorkerResponse.arrayBuffer()

  const module: unknown = await dynamicImport(bindingUrl)
  if (!isOxcTransform(module)) {
    throw new Error('devjar: Invalid Oxc transform module')
  }
  return module
}

let oxcPromise: Promise<OxcTransform> | undefined

self.onmessage = async ({ data }: MessageEvent<{
  id: number
  files: Record<string, string>
}>) => {
  const { id, files } = data
  try {
    oxcPromise ??= loadOxc()
    const oxc = await oxcPromise

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
