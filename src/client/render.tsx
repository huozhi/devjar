import { useCallback, useEffect, useImperativeHandle, useRef } from 'react'
import { useDevJar } from './use-dev-jar'
import type { PreviewStatus } from './core'
import type { CompilerAssets } from './compiler'

const defaultOnError: (error: unknown) => void = typeof window !== 'undefined'
  ? console.error
  : () => {}

export type DevJarHandle = { reset: () => Promise<void> }

export function DevJar({
  files,
  resolveModule,
  dependencies,
  transform,
  tailwind,
  onError = defaultOnError,
  onStatusChange,
  apiRef,
  transformWorkerUrl,
  compiler,
  ref: forwardedRef,
  ...props
}: {
  files: Record<string, string>
  resolveModule?: (specifier: string) => string
  dependencies?: Record<string, string>
  transform?: boolean
  tailwind?: boolean
  apiRef?: React.Ref<DevJarHandle>
  onStatusChange?: (status: PreviewStatus) => void
  onError?: (error: unknown) => void
  transformWorkerUrl?: string | URL
  compiler?: CompilerAssets
  ref?: React.Ref<HTMLIFrameElement>
} & Omit<React.IframeHTMLAttributes<HTMLIFrameElement>, 'src' | 'srcDoc' | 'children' | 'dangerouslySetInnerHTML' | 'onError'>) {
  const onErrorRef = useRef(onError)
  const onStatusRef = useRef(onStatusChange)
  const { ref, error, status, load, reset } = useDevJar({ resolveModule, dependencies, transform, tailwind, transformWorkerUrl, compiler })

  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const attachIframe = useCallback((iframe: HTMLIFrameElement | null) => {
    iframeRef.current = iframe
    ref(iframe)
  }, [ref])

  useImperativeHandle(apiRef, () => ({ reset }), [reset])
  useImperativeHandle(forwardedRef, () => iframeRef.current!, [iframeRef])

  useEffect(() => {
    onErrorRef.current = onError
    onStatusRef.current = onStatusChange
  }, [onError, onStatusChange])

  useEffect(() => {
    onErrorRef.current(error)
  }, [error])

  useEffect(() => {
    onStatusRef.current?.(status)
  }, [status])

  // load code files and execute them as live code
  useEffect(() => {
    load(files)
  }, [files, load])

  // Attach the ref to an iframe element for runtime of code execution
  return <iframe {...props} ref={attachIframe} />
}
