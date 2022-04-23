import { useCallback, useState, useRef } from 'react'
import { createModule } from './index.mjs'

export function useDynamicModule() {
  const [error, setError] = useState(null)
  const mod = useRef({})
  const rerender = useState({})[1]

  const load = useCallback(async (code) => {
    if (code) {
      try {
        mod.current = await createModule(code)
        setError(null)
      } catch (e) {
        setError(e)
      }
    }
    rerender({})
  }, [])

  return { mod, error, load }
}
