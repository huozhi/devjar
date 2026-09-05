import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPreviewResolver } from '../cdn'
import type { CompilerAssets } from './compiler'
import type { PreviewStatus } from './core'
import { createPreviewRuntime, type CompilationOptions, type PreviewRuntime } from './runtime'

/** Advanced API for owning the iframe and scheduling loads. Prefer DevJar for managed previews. */
export function useDevJar({
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
  const [iframe, setIframe] = useState<HTMLIFrameElement | null>(null)
  const runtimeRef = useRef<PreviewRuntime | undefined>(undefined)
  const [{ error, status }, setPreview] = useState<{ error: unknown; status: PreviewStatus }>({ error: undefined, status: 'idle' })

  useEffect(() => {
    setPreview({ error: undefined, status: 'idle' })
    if (!iframe) return
    const runtime = createPreviewRuntime(iframe, { resolveModule, tailwind, onChange: setPreview })
    runtimeRef.current = runtime
    return () => {
      runtimeRef.current = undefined
      runtime.dispose()
    }
  }, [iframe, resolveModule, tailwind])

  // Attachment and session options change load's identity so effects reload files.
  const load = useCallback((files: Record<string, string>) => {
    return runtimeRef.current?.load(files, compilation) ?? Promise.resolve()
  }, [compilation, iframe, resolveModule, tailwind])

  const reset = useCallback((): Promise<void> => {
    return runtimeRef.current?.reset(compilation) ?? Promise.resolve()
  }, [compilation])

  const ref = useCallback((node: HTMLIFrameElement | null) => {
    // Ref detachment precedes DOM removal; passive cleanup would be too late
    // to run the preview's effects in its original document.
    if (!node) {
      runtimeRef.current?.dispose()
      runtimeRef.current = undefined
    }
    setIframe(node)
  }, [])
  return { ref, error, status, load, reset }
}
