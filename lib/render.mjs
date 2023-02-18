import React, { useEffect, useRef } from 'react'
import { useLiveCode } from './core.mjs'

const noop = () => {}

export function DevJar({ files, getModuleUrl, onError = noop, ...props }) {
  const onErrorRef = useRef(onError)
  const { ref, error, load } = useLiveCode({ getModuleUrl })

  useEffect(() => {
    if (error) {
      onErrorRef.current(error)
    }
  }, [error])

  // load code files and execute them as live code
  useEffect(() => {
    load(files)
  }, [files])

  // Attach the ref to an iframe element for runtime of code execution
  return React.createElement('iframe', { ...props, ref })
}
