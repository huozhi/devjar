import { useCallback, useEffect, useState, useRef } from 'react'
import { createModule } from './index.mjs'

export function useDynamicModule(code) {
  const [{ mod, error }, setMod] = useState({})
  const [shouldRender, rerender] = useState({})
  const prevShouldRenderRef = useRef({})

  const load = () => {
    rerender({})
  }

  const loadMod = useCallback(() => {
    if (code) {
      createModule(code).then(_mod => {
        setMod(_mod)
      })
    }
  }, [code])

  useEffect(() => {
    if (prevShouldRenderRef.current !== shouldRender) {
      loadMod()
    }
    prevShouldRenderRef.current = shouldRender
  }, [shouldRender, loadMod])

  return { mod, error, load }
}
