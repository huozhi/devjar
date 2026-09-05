import { expect, test } from 'bun:test'
import { createTransformPool } from '../src/client/transform-pool'

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
  const acquire = createTransformPool(() => {
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

test('unmount cancels only its own in-flight requests and ignores late replies', async () => {
  const worker = new FakeWorker()
  const acquire = createTransformPool(() => worker as unknown as Worker)
  const a = acquire(undefined), b = acquire(undefined)
  const first = a.transform({ a: '' }).catch(error => error.message)
  const second = b.transform({ b: '' })
  a.release(); a.release()
  expect(await first).toContain('released')
  expect(worker.terminated).toBe(false)
  worker.reply(0, { a: 'obsolete' })
  worker.reply(1, { b: 'compiled' })
  expect(await second).toEqual({ b: 'compiled' })
  const pending = b.transform({ b: 'pending' }).catch(error => error.message)
  b.release()
  expect(await pending).toContain('released')
  expect(worker.terminated).toBe(true)
})

test('worker failure rejects every pending request and the next edit can retry', async () => {
  const workers: FakeWorker[] = []
  const acquire = createTransformPool(() => {
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

test('worker construction failure can retry and custom worker URLs stay isolated', async () => {
  let attempts = 0
  const workers: FakeWorker[] = []
  const acquire = createTransformPool(() => {
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
