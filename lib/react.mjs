import React, { useCallback, useState, useRef } from 'react'
import { createModule } from './index.mjs'

export function useDynamicModule() {
  const elementRef = useRef()
  const [error, setError] = useState()
  const mod = useRef({})
  const rerender = useState({})[1]

  const load = useCallback(async (files) => {
    if (files) {
      try {
        mod.current = await createModule(files)
        const Component = mod.current.default
        const element = React.createElement(Component)
        elementRef.current = element
        setError()
      } catch (e) {
        setError(e)
      }
    }
    rerender({})
  }, [])

  return { element: elementRef.current, error, load }
}
