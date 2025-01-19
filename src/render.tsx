import { useEffect, useRef } from 'react'
import { useLiveCode } from './core'

const defaultOnError = typeof window !== 'undefined' ? console.error : (() => {})

export function DevJar({ files, getModuleUrl, onError = defaultOnError, ...props }: {
  files: Record<string, string>
  getModuleUrl?: (name: string) => string
  onError?: (...data: any[]) => void
} & React.IframeHTMLAttributes<HTMLIFrameElement>) {
  const onErrorRef = useRef(onError)
  const { ref, error, load } = useLiveCode({ getModuleUrl })

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
