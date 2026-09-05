type Files = Record<string, string>
type Response = { id: number; transformed: Files; error?: never }
  | { id: number; error: { message: string; stack?: string }; transformed?: never }
export type TransformClient = { transform: (files: Files) => Promise<Files>; release: () => void }

export function createTransformPool(createWorker: (url: string | undefined) => Promise<Worker>) {
  type Request = { owner: symbol; resolve: (files: Files) => void; reject: (error: Error) => void }
  type Entry = { users: number; nextId: number; worker: Promise<Worker> | undefined; requests: Map<number, Request> }
  const entries = new Map<string | undefined, Entry>()

  return function acquire(url: string | undefined): TransformClient {
    let shared = entries.get(url)
    if (!shared) {
      shared = { users: 0, nextId: 0, worker: undefined, requests: new Map() }
      entries.set(url, shared)
    }
    const entry = shared
    entry.users++
    const owner = Symbol()
    let released = false

    function getWorker() {
      if (!entry.worker) {
        const pending = createWorker(url).then(worker => {
          worker.onmessage = ({ data }: MessageEvent<Response>) => {
            const request = entry.requests.get(data.id)
            if (!request) return
            entry.requests.delete(data.id)
            if (data.error) {
              const error = new Error(data.error.message)
              if (data.error.stack) error.stack = data.error.stack
              request.reject(error)
            } else request.resolve(data.transformed)
          }
          const fail = (error: Error) => {
            if (entry.worker !== pending) return
            entry.worker = undefined
            worker.terminate()
            for (const request of entry.requests.values()) request.reject(error)
            entry.requests.clear()
          }
          worker.onerror = event => fail(new Error(event.message || 'devjar: transform worker failed'))
          worker.onmessageerror = () => fail(new Error('devjar: invalid transform worker message'))
          return worker
        })
        entry.worker = pending
        void pending.catch(() => { if (entry.worker === pending) entry.worker = undefined })
      }
      return entry.worker
    }

    return {
      transform(files) {
        if (released) return Promise.reject(new Error('devjar: transform client was released'))
        const id = ++entry.nextId
        return new Promise((resolve, reject) => {
          entry.requests.set(id, { owner, resolve, reject })
          void getWorker().then(worker => {
            if (entry.requests.has(id)) worker.postMessage({ id, files })
          }).catch(error => {
            const request = entry.requests.get(id)
            entry.requests.delete(id)
            request?.reject(error)
          })
        })
      },
      release() {
        if (released) return
        released = true
        for (const [id, request] of entry.requests) {
          if (request.owner !== owner) continue
          entry.requests.delete(id)
          request.reject(new Error('devjar: transform client was released'))
        }
        if (--entry.users === 0) {
          entries.delete(url)
          void entry.worker?.then(worker => worker.terminate(), () => {})
        }
      },
    }
  }
}
