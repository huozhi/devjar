import { useEffect, useImperativeHandle, useRef } from 'react'
import { useLiveCode, type PreviewStatus } from './core'
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
} & React.IframeHTMLAttributes<HTMLIFrameElement>) {
  const onErrorRef = useRef(onError)
  const onStatusRef = useRef(onStatusChange)
  onErrorRef.current = onError
  onStatusRef.current = onStatusChange
  const { ref, error, status, load, reset } = useLiveCode({ resolveModule, dependencies, transform, tailwind, transformWorkerUrl, compiler })

  useImperativeHandle(apiRef, () => ({ reset }), [reset])
  useImperativeHandle(forwardedRef, () => ref.current!, [ref])

  useEffect(() => {
    onErrorRef.current(error)
  }, [error])

  useEffect(() => {
    onStatusRef.current?.(status)
  }, [status])

  // load code files and execute them as live code
  useEffect(() => {
    load(files)
  }, [files])

  // Attach the ref to an iframe element for runtime of code execution
  return <iframe {...props} ref={ref} />
}
