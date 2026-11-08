import type { IncomingMessage } from 'node:http'

// Forwards browser errors to the dev server's terminal, where people and
// agents running `devjar dev` already look, so a broken page is visible
// without opening developer tools.

export const browserLogPath = '/_jar/log'

const maxBodyBytes = 64 * 1024
const repeatWindowMs = 2_000

export type BrowserLogEntry = {
  type: 'error' | 'rejection' | 'console' | 'resource'
  message: string
  page: string
}

const entryTypes = new Set<BrowserLogEntry['type']>(['error', 'rejection', 'console', 'resource'])

/** A classic script for the start of <head>, so it sees errors from every later script. */
export function browserLogScript(endpoint: string) {
  return `<script>(() => {
const endpoint = ${JSON.stringify(endpoint)}
const text = value => {
  if (value instanceof Error) return value.stack && value.stack.includes(value.message) ? value.stack : String(value) + (value.stack ? '\\n' + value.stack : '')
  if (typeof value === 'string') return value
  try { return JSON.stringify(value) } catch { return String(value) }
}
const send = (type, message) => {
  const body = JSON.stringify({ type, message: String(message).slice(0, 8000), page: location.pathname + location.search })
  try { if (navigator.sendBeacon(endpoint, body)) return } catch {}
  fetch(endpoint, { method: 'POST', body, keepalive: true }).catch(() => {})
}
addEventListener('error', event => {
  const target = event.target
  if (target && target !== window && (target.src || target.href)) {
    send('resource', 'Failed to load ' + target.tagName.toLowerCase() + ' ' + (target.src || target.href))
    return
  }
  // ResizeObserver can defer layout work without an application exception.
  if (!event.error && /^ResizeObserver loop/.test(event.message)) return
  send('error', event.error ? text(event.error) : event.message + ' (' + event.filename + ':' + event.lineno + ':' + event.colno + ')')
}, true)
addEventListener('unhandledrejection', event => send('rejection', 'Unhandled rejection: ' + text(event.reason)))
const consoleError = console.error
console.error = (...args) => {
  send('console', args.map(text).join(' '))
  return consoleError.apply(console, args)
}
})()</script>`
}

/** Inserts a script at the start of <head>, or as early as the document allows. */
export function withEarlyScript(document: string, script: string) {
  const match = /<head\b[^>]*>/i.exec(document) || /<html\b[^>]*>/i.exec(document) || /<!doctype[^>]*>/i.exec(document)
  if (!match) return script + document
  const end = match.index + match[0].length
  return document.slice(0, end) + script + document.slice(end)
}

export async function readBrowserLog(request: IncomingMessage): Promise<BrowserLogEntry | undefined> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > maxBodyBytes) return
    chunks.push(chunk)
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (!entryTypes.has(value?.type) || typeof value.message !== 'string' || typeof value.page !== 'string') return
    return { type: value.type, message: value.message, page: value.page }
  } catch {
    return
  }
}

const labels: Record<BrowserLogEntry['type'], string> = {
  error: 'Browser error',
  rejection: 'Browser error',
  console: 'Browser console.error',
  resource: 'Browser failed to load',
}

/** Prints entries to stderr, dropping repeats of the same entry within a short window. */
export function createBrowserLogPrinter(write: (line: string) => void) {
  const recent = new Map<string, { time: number, repeats: number }>()
  return (entry: BrowserLogEntry, origin: string) => {
    const message = entry.message.split(origin).join('').trim()
    const key = `${entry.type}\n${entry.page}\n${message}`
    const now = Date.now()
    const previous = recent.get(key)
    if (previous && now - previous.time < repeatWindowMs) {
      previous.repeats++
      return
    }
    if (recent.size > 200) recent.clear()
    recent.set(key, { time: now, repeats: 0 })
    const repeated = previous?.repeats ? ` (repeated ${previous.repeats} more times)` : ''
    const body = entry.type === 'resource' ? message.replace(/^Failed to load /, '') : message
    write(`${labels[entry.type]} on ${entry.page}${repeated}\n${body.replace(/^/gm, '  ')}`)
  }
}
