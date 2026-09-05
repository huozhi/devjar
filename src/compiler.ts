import { defaultCompilerAssets } from './generated/compiler-assets'

export type CompilerAssets = {
  workerUrl: string | URL
  bindingUrl: string | URL
  wasmUrl: string | URL
}

export function getCompilerWorkerUrl(compiler: CompilerAssets | undefined, legacyWorkerUrl: string | URL | undefined) {
  // A complete override never evaluates or fetches the default assets.
  const assets = compiler ?? defaultCompilerAssets()
  const worker = new URL(compiler ? assets.workerUrl : legacyWorkerUrl ?? assets.workerUrl, globalThis.location.href)
  worker.searchParams.set('binding', new URL(assets.bindingUrl, globalThis.location.href).href)
  worker.searchParams.set('wasm', new URL(assets.wasmUrl, globalThis.location.href).href)
  return worker.href
}
