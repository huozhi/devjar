import { expect, test } from 'bun:test'
import { createLoadQueue } from '../src/load-queue'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>(done => { resolve = done })
  return { promise, resolve }
}

test('rapid edits skip obsolete pending work and keep only the newest edit', async () => {
  const queue = createLoadQueue()
  const gate = deferred()
  const calls: string[] = []
  const first = queue.enqueue(async () => { calls.push('first'); await gate.promise })
  const skipped = queue.enqueue(async () => { calls.push('skipped') })
  const newest = queue.enqueue(async () => { calls.push('newest') })
  await skipped
  expect(calls).toEqual(['first'])
  gate.resolve()
  await Promise.all([first, newest])
  expect(calls).toEqual(['first', 'newest'])
})

test('clearing a preview discards pending edits without affecting another preview', async () => {
  const first = createLoadQueue(), second = createLoadQueue()
  const gate = deferred()
  let obsoleteRan = false
  const active = first.enqueue(() => gate.promise)
  const pending = first.enqueue(async () => { obsoleteRan = true })
  first.clear()
  await pending
  let otherRan = false
  await second.enqueue(async () => { otherRan = true })
  expect(otherRan).toBe(true)
  gate.resolve()
  await active
  expect(obsoleteRan).toBe(false)
})

test('a failed job does not block the newest edit or later loads', async () => {
  const queue = createLoadQueue(), gate = deferred()
  const failed = queue.enqueue(async () => { await gate.promise; throw new Error('broken') })
  const failure = failed.catch(error => error.message)
  let recovered = false
  const next = queue.enqueue(async () => { recovered = true })
  gate.resolve()
  expect(await failure).toBe('broken')
  await next
  expect(recovered).toBe(true)
  await queue.enqueue(async () => {})
})
