import { init, parse } from 'es-module-lexer'
import { isTextImport } from '../text'
import { sourceExtensions } from '../project'
import {
  createIframeRouteManifest, createMainScript, getModuleKey, isRelative,
  linkModules, normalizeProjectPath, resolveRelativeModule, type PreviewStatus,
} from './core'
import { createFrameSession } from './frame'
import { createLoadQueue } from './load-queue'
import { getCompilerWorkerUrl, type CompilerAssets } from './compiler'
import { createTransformPool, type TransformClient } from './transform-pool'

export type CompilationOptions = {
  transform: boolean
  compiler: CompilerAssets | undefined
  workerUrl: string | undefined
}

const acquireTransformClient = createTransformPool((url: string | undefined) => {
  if (!url) throw new Error('devjar: compiler worker URL is required')
  return new globalThis.Worker(url, { type: 'module', name: 'devjar-transform' })
})

// One controller owns each iframe session and all work that can publish to it.
// Compilation options can change without replacing the iframe's React state.
export function createPreviewRuntime(iframe: HTMLIFrameElement, {
  resolveModule, tailwind, onChange,
}: {
  resolveModule: (specifier: string) => string
  tailwind: boolean
  onChange: (preview: { error: unknown; status: PreviewStatus }) => void
}) {
  let disposed = false
  let generation = 0
  let queue = createLoadQueue()
  let client: TransformClient | undefined
  let compilationKey: string | undefined
  const cache = new Map<string, { source: string; code: string }>()
  let latest: { files: Record<string, string>; promise: Promise<void> } | undefined
  let pendingReset: Promise<void> | undefined
  const session = createFrameSession(iframe, {
    script: createMainScript(), resolveModule, tailwind,
    onError: error => onChange({ error, status: 'failed' }),
  })

  function isCurrent(id: number) {
    return !disposed && id === generation
  }

  function releaseCompiler() {
    client?.release()
    client = undefined
    cache.clear()
    compilationKey = undefined
  }

  // Invalidate running work before releasing its compiler or replacing its queue.
  function cancelLoads() {
    generation++
    queue.clear()
    queue = createLoadQueue()
    releaseCompiler()
  }

  async function runLoad(files: Record<string, string>, loadId: number, options: CompilationOptions) {
    if (!isCurrent(loadId)) return
    try {
      const key = JSON.stringify([options.transform, options.compiler, options.workerUrl])
      if (compilationKey !== key) {
        releaseCompiler()
        compilationKey = key
      }
      function transformFiles(files: Record<string, string>) {
        client ??= acquireTransformClient(getCompilerWorkerUrl(options.compiler, options.workerUrl))
        return client.transform(files)
      }
      const manifest = createIframeRouteManifest(files)

      await init
      if (!isCurrent(loadId)) return
      const localFiles = new Map(Object.keys(files).map(path => [normalizeProjectPath(path), getModuleKey(path)]))
      const filenames = new Map(Object.keys(files).map(path => [getModuleKey(path), path]))
      const queue = [...Object.values(manifest.routes)]
      const transformedSources: Record<string, string> = {}
      const visited = new Set<string>()
      while (queue.length) {
        const moduleKey = queue.shift()!
        if (visited.has(moduleKey)) continue
        visited.add(moduleKey)
        const filename = filenames.get(moduleKey)!
        const source = files[filename]
        if (filename.endsWith('.css') || filename.endsWith('.json')) {
          transformedSources[filename] = source
          continue
        }
        if (!sourceExtensions.some(extension => filename.endsWith(extension))) {
          throw new Error(`Cannot import ${filename} as JavaScript. Use with { type: "text" } to import its contents.`)
        }
        let cached = cache.get(filename)
        if (cached?.source !== source) {
          const output = options.transform ? await transformFiles({ [filename]: source }) : { [filename]: source }
          if (!isCurrent(loadId)) return
          cached = { source, code: output[filename] }
          cache.set(filename, cached)
        }
        transformedSources[filename] = cached.code
        for (const imported of parse(cached.code)[0]) {
          if (!imported.n || !isRelative(imported.n) || isTextImport(cached.code, imported)) continue
          queue.push(resolveRelativeModule(filename, imported.n, localFiles, false))
        }
      }
      for (const filename of cache.keys()) {
        if (!(filename in files)) cache.delete(filename)
      }
      const linked = await linkModules(transformedSources, resolveModule, files)
      if (!isCurrent(loadId)) return

      onChange({ error: undefined, status: 'loading' })
      await session.render(linked.files, linked.dependencies, manifest)
      if (!isCurrent(loadId)) return
      onChange({ error: undefined, status: 'ready' })
      iframe.dispatchEvent(new CustomEvent('devjar:render'))
    } catch (error) {
      if (isCurrent(loadId)) onChange({ error, status: 'failed' })
    }
  }

  function load(files: Record<string, string>, options: CompilationOptions): Promise<void> {
    if (disposed) return Promise.resolve()
    const loadId = ++generation
    onChange({ error: undefined, status: 'compiling' })
    const promise = queue.enqueue(() => runLoad(files, loadId, options))
    latest = { files, promise }
    return promise
  }

  function reset(options: CompilationOptions): Promise<void> {
    if (disposed) return Promise.resolve()
    if (pendingReset) return pendingReset
    cancelLoads()
    const resetId = generation
    onChange({ error: undefined, status: 'loading' })
    const pending = session.reset().then(async () => {
      if (disposed) return
      if (!latest) onChange({ error: undefined, status: 'idle' })
      else if (generation === resetId) await load(latest.files, options)
      else await latest.promise
    }).catch(error => {
      if (!disposed) onChange({ error, status: 'failed' })
    }).finally(() => {
      if (pendingReset === pending) pendingReset = undefined
    })
    pendingReset = pending
    return pending
  }

  return {
    load,
    reset,
    dispose() {
      if (disposed) return
      disposed = true
      cancelLoads()
      session.dispose()
      latest = undefined
    },
  }
}

export type PreviewRuntime = ReturnType<typeof createPreviewRuntime>
