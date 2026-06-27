import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { useLiveCode } from './core'

const defaultOnError = typeof window !== 'undefined' ? console.error : (() => {})

export const DevJar = forwardRef<HTMLIFrameElement, {
  files: Record<string, string>
  getModuleUrl?: (name: string) => string
  onError?: (...data: any[]) => void
} & React.IframeHTMLAttributes<HTMLIFrameElement>>(function DevJar(
  { files, getModuleUrl, onError = defaultOnError, ...props },
  forwardedRef
) {
  const onErrorRef = useRef(onError)
  const { ref, error, load } = useLiveCode({ getModuleUrl })

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
})
