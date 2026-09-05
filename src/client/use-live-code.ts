import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPreviewResolver } from '../cdn'
import type { CompilerAssets } from './compiler'
import type { PreviewStatus } from './core'
import { createPreviewRuntime, type CompilationOptions, type PreviewRuntime } from './runtime'

export function useLiveCode({
  resolveModule: customResolveModule,
  dependencies,
  transform = true,
  tailwind = true,
  transformWorkerUrl,
  compiler,
}: {
  resolveModule?: (specifier: string) => string
  dependencies?: Record<string, string>
  transform?: boolean
  tailwind?: boolean
  transformWorkerUrl?: string | URL
  compiler?: CompilerAssets
}) {
  // Equal dependency/asset values must not reload a preview merely because a
  // parent creates fresh options objects while handling status notifications.
  const dependenciesKey = JSON.stringify(Object.entries(dependencies || {}).sort(([a], [b]) => a.localeCompare(b)))
  const resolveModule = useMemo(
    () => customResolveModule || createPreviewResolver(Object.fromEntries(JSON.parse(dependenciesKey))),
    [customResolveModule, dependenciesKey]
  )
  const workerUrl = compiler?.workerUrl.toString()
  const bindingUrl = compiler?.bindingUrl.toString()
  const wasmUrl = compiler?.wasmUrl.toString()
  const legacyUrl = compiler ? undefined : transformWorkerUrl?.toString()
  const compilation = useMemo<CompilationOptions>(() => ({
    transform,
    compiler: workerUrl === undefined ? undefined : { workerUrl, bindingUrl: bindingUrl!, wasmUrl: wasmUrl! },
    workerUrl: legacyUrl,
  }), [transform, workerUrl, bindingUrl, wasmUrl, legacyUrl])
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const runtimeRef = useRef<PreviewRuntime | undefined>(undefined)
  const [{ error, status }, setPreview] = useState<{ error: unknown; status: PreviewStatus }>({ error: undefined, status: 'idle' })

  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe) return
    const runtime = createPreviewRuntime(iframe, { resolveModule, tailwind, onChange: setPreview })
    runtimeRef.current = runtime
    setPreview({ error: undefined, status: 'idle' })
    return () => {
      runtimeRef.current = undefined
      runtime.dispose()
    }
  }, [resolveModule, tailwind])

  // Session options also change load's identity so consumers reload their files.
  const load = useCallback((files: Record<string, string>) => {
    return runtimeRef.current?.load(files, compilation) ?? Promise.resolve()
  }, [compilation, resolveModule, tailwind])

  const reset = useCallback((): Promise<void> => {
    return runtimeRef.current?.reset(compilation) ?? Promise.resolve()
  }, [compilation])

  return { ref: iframeRef, error, status, load, reset }
}
