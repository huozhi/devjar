import type { IncomingMessage, ServerResponse } from 'node:http'
import { isIP } from 'node:net'

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
// Applies console format specifiers such as React's console.error('%o\\n\\n%s', error, text).
const format = args => {
  if (typeof args[0] !== 'string' || !/%[sdifoOc]/.test(args[0])) return args.map(text).join(' ')
  let index = 1
  const head = args[0].replace(/%([sdifoOc%])/g, (match, type) => {
    if (type === '%') return '%'
    if (index >= args.length) return match
    const value = args[index++]
    if (type === 'c') return ''
    if (type === 'd' || type === 'i') return String(parseInt(value))
    if (type === 'f') return String(parseFloat(value))
    return text(value)
  })
  return [head, ...args.slice(index).map(text)].join(' ')
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
  send('console', format(args))
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

async function readBrowserLog(request: IncomingMessage): Promise<BrowserLogEntry | undefined> {
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

// Any website open in the same browser can POST to a local dev server. Only
// accept entries from the dev server's own pages, and refuse hostnames that
// are not local addresses, which a DNS rebinding attack would use.
function isOwnPage(request: IncomingMessage) {
  const host = request.headers.host
  if (!host) return false
  let hostname: string
  try {
    hostname = new URL(`http://${host}`).hostname.replace(/^\[|\]$/g, '')
  } catch {
    return false
  }
  if (hostname !== 'localhost' && !hostname.endsWith('.localhost') && !isIP(hostname)) return false
  const origin = request.headers.origin
  return origin === undefined || origin === `http://${host}`
}

/** Handles a POST to the browser log endpoint of a dev server. */
export async function receiveBrowserLog(
  request: IncomingMessage,
  response: ServerResponse,
  print: (entry: BrowserLogEntry, origin: string) => void,
) {
  if (!isOwnPage(request)) {
    response.writeHead(403)
    response.end()
    return
  }
  const entry = await readBrowserLog(request)
  if (entry) print(entry, `http://${request.headers.host}`)
  response.writeHead(entry ? 204 : 400)
  response.end()
}

// Keep line breaks and tabs; drop escape sequences and other control
// characters that could rewrite or hide terminal output.
function printable(value: string) {
  return value.replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, '')
}

const labels: Record<BrowserLogEntry['type'], string> = {
  error: 'Browser error',
  rejection: 'Browser error',
  console: 'Browser console.error',
  resource: 'Browser failed to load',
}

// Stack frames from other origins, such as React internals on a CDN, rarely
// point at the bug; collapse each run of them into one line.
function collapseExternalFrames(message: string) {
  const lines: string[] = []
  let hidden = 0
  const flush = () => {
    if (hidden) lines.push(`    at … ${hidden} more ${hidden === 1 ? 'frame' : 'frames'}`)
    hidden = 0
  }
  for (const line of message.split('\n')) {
    if (/^\s*at\s.*\b[a-z][a-z\d+.-]*:\/\//i.test(line)) {
      hidden++
      continue
    }
    flush()
    lines.push(line)
  }
  flush()
  return lines.join('\n')
}

/**
 * Prints entries to stderr. The same error often arrives twice, from the
 * error event and from a framework's console.error, so entries whose first
 * line matches one printed moments ago on the same page are dropped.
 */
export function createBrowserLogPrinter(write: (line: string) => void) {
  const recent = new Map<string, { time: number, repeats: number }>()
  return (entry: BrowserLogEntry, origin: string) => {
    const message = collapseExternalFrames(printable(entry.message).split(origin).join('').trim())
    const page = printable(entry.page)
    const firstLine = message.split('\n').find(line => line.trim())?.trim() || ''
    const key = `${page}\n${firstLine}`
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
    write(`${labels[entry.type]} on ${page}${repeated}\n${body.replace(/^/gm, '  ')}`)
  }
}
