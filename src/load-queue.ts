// Keep one running load and one pending edit. Running work is allowed to settle;
// the runtime's load generation checks prevent it from publishing stale results.
export function createLoadQueue() {
  type Job = { run: () => Promise<void>; resolve: () => void; reject: (error: unknown) => void }
  let running = false
  let pending: Job | undefined

  async function drain() {
    if (running) return
    running = true
    try {
      while (pending) {
        const job = pending
        pending = undefined
        try {
          await job.run()
          job.resolve()
        } catch (error) {
          job.reject(error)
        }
      }
    } finally {
      running = false
    }
  }

  return {
    enqueue(run: () => Promise<void>): Promise<void> {
      pending?.resolve()
      return new Promise((resolve, reject) => {
        pending = { run, resolve, reject }
        void drain()
      })
    },
    clear() {
      pending?.resolve()
      pending = undefined
    },
  }
}
