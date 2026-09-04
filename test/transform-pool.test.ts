import { expect, test } from 'bun:test'
import { createTransformPool } from '../src/transform-pool'

class FakeWorker {
  onmessage: ((event: { data: unknown }) => void) | null = null
  onerror: ((event: { message: string }) => void) | null = null
  onmessageerror: (() => void) | null = null
  messages: Array<{ id: number; files: Record<string, string> }> = []
  terminated = false
  postMessage(message: { id: number; files: Record<string, string> }) { this.messages.push(message) }
  terminate() { this.terminated = true }
  reply(index: number, transformed: Record<string, string>) {
    this.onmessage?.({ data: { id: this.messages[index].id, transformed } })
  }
}
const flush = () => new Promise(resolve => setTimeout(resolve, 0))

test('previews share one compiler and route out-of-order replies independently', async () => {
  const workers: FakeWorker[] = []
  const acquire = createTransformPool(async () => {
    const worker = new FakeWorker(); workers.push(worker); return worker as unknown as Worker
  })
  const a = acquire(undefined), b = acquire(undefined)
  const first = a.transform({ 'index.tsx': 'first' }), second = b.transform({ 'index.tsx': 'second' })
  await flush()
  expect(workers).toHaveLength(1)
  workers[0].reply(1, { 'index.tsx': 'SECOND' })
  workers[0].reply(0, { 'index.tsx': 'FIRST' })
  expect(await first).toEqual({ 'index.tsx': 'FIRST' })
  expect(await second).toEqual({ 'index.tsx': 'SECOND' })
  a.release()
  expect(workers[0].terminated).toBe(false)
  const edit = b.transform({ 'index.tsx': 'edit' })
  await flush(); workers[0].reply(2, { 'index.tsx': 'EDIT' })
  expect(await edit).toEqual({ 'index.tsx': 'EDIT' })
  b.release(); await flush()
  expect(workers[0].terminated).toBe(true)
})

test('unmount cancels only its own requests, even during initialization', async () => {
  let ready!: (worker: Worker) => void
  const acquire = createTransformPool(() => new Promise(resolve => { ready = resolve }))
  const a = acquire(undefined), b = acquire(undefined), worker = new FakeWorker()
  const first = a.transform({ a: '' }).catch(error => error.message)
  const second = b.transform({ b: '' })
  a.release(); a.release()
  expect(await first).toContain('released')
  ready(worker as unknown as Worker); await flush()
  expect(worker.messages).toHaveLength(1)
  expect(worker.messages[0].files).toEqual({ b: '' })
  worker.reply(0, { b: 'compiled' }); await second
  b.release(); await flush()
  expect(worker.terminated).toBe(true)
})

test('last unmount terminates a worker that is still initializing', async () => {
  let ready!: (worker: Worker) => void
  const acquire = createTransformPool(() => new Promise(resolve => { ready = resolve }))
  const client = acquire(undefined), worker = new FakeWorker()
  const result = client.transform({ a: '' }).catch(error => error.message)
  client.release(); await result
  ready(worker as unknown as Worker); await flush()
  expect(worker.terminated).toBe(true)
  expect(worker.messages).toHaveLength(0)
})

test('worker failure rejects every pending request and the next edit can retry', async () => {
  const workers: FakeWorker[] = []
  const acquire = createTransformPool(async () => {
    const worker = new FakeWorker(); workers.push(worker); return worker as unknown as Worker
  })
  const a = acquire(undefined), b = acquire(undefined)
  const first = a.transform({ a: '' }).catch(error => error.message)
  const second = b.transform({ b: '' }).catch(error => error.message)
  await flush(); workers[0].onerror?.({ message: 'Compiler crashed' })
  expect(await first).toBe('Compiler crashed'); expect(await second).toBe('Compiler crashed')
  const retry = a.transform({ a: 'retry' }); await flush()
  expect(workers).toHaveLength(2)
  workers[1].reply(0, { a: 'RETRY' }); expect(await retry).toEqual({ a: 'RETRY' })
  a.release(); b.release()
})

test('initialization failure can retry and custom worker URLs stay isolated', async () => {
  let attempts = 0
  const workers: FakeWorker[] = []
  const acquire = createTransformPool(async () => {
    if (++attempts === 1) throw new Error('Network failed')
    const worker = new FakeWorker(); workers.push(worker); return worker as unknown as Worker
  })
  const a = acquire('one'), b = acquire('two')
  await expect(a.transform({ a: '' })).rejects.toThrow('Network failed')
  const first = a.transform({ a: '' }), second = b.transform({ b: '' })
  await flush(); expect(workers).toHaveLength(2)
  workers[0].reply(0, { a: '' }); workers[1].reply(0, { b: '' })
  await Promise.all([first, second]); a.release(); b.release()
})
