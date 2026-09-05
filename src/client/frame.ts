import type { IframeRouteManifest } from './core'

export type RenderFunction = ((
  files: Record<string, string>,
  dependencies: Record<string, string[]>,
  manifest: IframeRouteManifest,
  beforeCommit: () => void,
) => Promise<void>) & { dispose: () => void }

let nextDocumentId = 0

// Each session owns one document, its bootstrap, and its event listeners.
// Disposing also settles waits so superseded loads can leave the queue.
export function createFrameSession(iframe: HTMLIFrameElement, options: {
  script: string
  resolveModule: (specifier: string) => string
  tailwind: boolean
  onError: (error: unknown) => void
}) {
  let disposed = false
  let cleanup = () => {}
  let renderer: RenderFunction | undefined
  let failure: { error: unknown } | undefined

  const documentId = String(++nextDocumentId)
  const ready = new Promise<void>((resolve, reject) => {
    const finishNavigation = () => {
      clearTimeout(timeout)
      iframe.removeEventListener('load', initialize)
    }
    const initialize = () => {
      const doc = iframe.contentDocument
      if (disposed || doc?.documentElement.dataset.devjarDocument !== documentId) return
      finishNavigation()
      const frameWindow = iframe.contentWindow!
      const root = doc.createElement('div')
      root.id = '__reactRoot'
      const script = doc.createElement('script')
      script.src = `data:text/javascript;utf-8,${encodeURIComponent(options.script)}`
      const tailwind = options.tailwind ? doc.createElement('script') : undefined
      let scriptReady = false
      let stylesReady = !tailwind
      const finish = () => { if (scriptReady && stylesReady) resolve() }
      const report = (error: unknown) => {
        if (disposed) return
        failure = { error }
        options.onError(error)
      }
      const onError = (event: ErrorEvent) => report(event.error ?? new Error(event.message))
      const onRejection = (event: PromiseRejectionEvent) => report(event.reason)
      // The renderer checks the final boundary state after committing. A
      // transient caught error during Refresh must not poison recovery.
      const onReactError = (event: Event) => options.onError((event as CustomEvent).detail)
      const onInitialize = (event: Event) => {
        const initializeRenderer = (event as CustomEvent<(resolve: (specifier: string) => string) => RenderFunction>).detail
        renderer = initializeRenderer(options.resolveModule)
      }
      script.addEventListener('devjar:initialize', onInitialize)
      script.onload = () => {
        if (!renderer) { reject(new Error('devjar: renderer was not initialized')); return }
        scriptReady = true
        finish()
      }
      script.onerror = () => reject(new Error('devjar: application script failed to load'))
      if (tailwind) {
        tailwind.src = 'https://unpkg.com/@tailwindcss/browser@4'
        tailwind.onload = tailwind.onerror = () => { stylesReady = true; finish() }
      }
      frameWindow.addEventListener('error', onError)
      frameWindow.addEventListener('unhandledrejection', onRejection)
      doc.addEventListener('devjar:error', onReactError)
      cleanup = () => {
        frameWindow.removeEventListener('error', onError)
        frameWindow.removeEventListener('unhandledrejection', onRejection)
        doc.removeEventListener('devjar:error', onReactError)
        script.removeEventListener('devjar:initialize', onInitialize)
        script.onload = script.onerror = null
        if (tailwind) tailwind.onload = tailwind.onerror = null
        renderer?.dispose()
        script.remove()
        tailwind?.remove()
        root.remove()
        resolve()
      }
      doc.body.append(root)
      if (tailwind) doc.body.append(tailwind)
      doc.body.append(script)
    }
    const timeout = setTimeout(() => {
      finishNavigation()
      reject(new Error('devjar: timed out waiting for the iframe'))
    }, 10000)
    cleanup = () => { finishNavigation(); resolve() }
    iframe.addEventListener('load', initialize)
    iframe.srcdoc = `<!doctype html><html data-devjar-document="${documentId}"><head></head><body></body></html>`
  })
  // The hook may not load any files yet. Preserve failure for the first load.
  void ready.catch(() => {})

  return {
    ready,
    async render(files: Record<string, string>, dependencies: Record<string, string[]>, manifest: IframeRouteManifest) {
      await ready
      if (disposed) return
      if (!renderer) throw new Error('devjar: renderer was not initialized')
      // An error from the old visible preview must not poison a replacement.
      // Clear it at commit, after imports finish, so errors from the new React
      // render and its effects still fail this load.
      await renderer(files, dependencies, manifest, () => { failure = undefined })
      if (disposed) return
      if (failure) throw failure.error
    },
    dispose() {
      if (disposed) return
      disposed = true
      cleanup()
      renderer = undefined
    },
  }
}
