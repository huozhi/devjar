import { useEffect, useImperativeHandle, useRef } from 'react'
import { useLiveCode } from './core'

const defaultOnError: (error: unknown) => void = typeof window !== 'undefined'
  ? console.error
  : () => {}

export function DevJar({
  files,
  resolveModule,
  dependencies,
  transform,
  onError = defaultOnError,
  transformWorkerUrl,
  ref: forwardedRef,
  ...props
}: {
  files: Record<string, string>
  resolveModule?: (specifier: string) => string
  dependencies?: Record<string, string>
  transform?: boolean
  onError?: (error: unknown) => void
  transformWorkerUrl?: string | URL
  ref?: React.Ref<HTMLIFrameElement>
} & React.IframeHTMLAttributes<HTMLIFrameElement>) {
  const onErrorRef = useRef(onError)
  const { ref, error, load } = useLiveCode({ resolveModule, dependencies, transform, transformWorkerUrl })

  useImperativeHandle(forwardedRef, () => ref.current!, [ref])

  useEffect(() => {
    onErrorRef.current(error)
  }, [error])

  // load code files and execute them as live code
  useEffect(() => {
    load(files)
  }, [files])

  // Attach the ref to an iframe element for runtime of code execution
  return <iframe {...props} ref={ref} />
}
