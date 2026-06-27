import { useEffect, useImperativeHandle, useRef } from 'react'
import { useLiveCode } from './core'

const defaultOnError = typeof window !== 'undefined' ? console.error : (() => {})

export function DevJar({
  files,
  resolveModule,
  onError = defaultOnError,
  tailwindSrc,
  ref: forwardedRef,
  ...props
}: {
  files: Record<string, string>
  resolveModule?: (specifier: string) => string
  onError?: (...data: any[]) => void
  tailwindSrc?: string | false
  ref?: React.Ref<HTMLIFrameElement>
} & React.IframeHTMLAttributes<HTMLIFrameElement>) {
  const onErrorRef = useRef(onError)
  const { ref, error, load } = useLiveCode({ resolveModule, tailwindSrc })

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
