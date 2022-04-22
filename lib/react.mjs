import { useCallback, useEffect, useState, useRef } from 'react'
import { createModule } from './index.mjs'

export function useDynamicModule() {
  const [{ mod, error }, setMod] = useState({})
  const [shouldRender, rerender] = useState({})
  const prevShouldRenderRef = useRef({})

  const load = useCallback((code) => {
    if (code) {
      createModule(code).then(_mod => {
        setMod(_mod)
      })
    }
    rerender({})
  })

  useEffect(() => {
    if (prevShouldRenderRef.current !== shouldRender) {
      load()
    }
    prevShouldRenderRef.current = shouldRender
  }, [shouldRender])

  return { mod, error, load }
}
