import { watch, type FSWatcher } from 'node:fs'
import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import { join, relative, sep } from 'node:path'

// Plumbing shared by the dev server, the production server, and HTML previews.

export function listen(server: Server, port: number, host: string) {
  return new Promise<void>((resolvePromise, reject) => {
    server.once('error', reject)
    server.listen(port, host, resolvePromise)
  })
}

// End connections once their responses finish during shutdown, including
// runtimes that do not automatically reap newly idle keep-alive connections.
export function trackServerShutdown(server: Server) {
  let closing = false
  const pending = new Map<IncomingMessage['socket'], number>()
  server.on('connection', socket => {
    pending.set(socket, 0)
    socket.once('close', () => pending.delete(socket))
  })
  server.prependListener('request', (request, response) => {
    const socket = request.socket
    pending.set(socket, (pending.get(socket) || 0) + 1)
    response.once('finish', () => {
      const remaining = (pending.get(socket) || 1) - 1
      pending.set(socket, remaining)
      if (closing && remaining === 0) socket.end()
    })
  })
  return () => {
    closing = true
    for (const [socket, count] of pending) {
      if (count === 0) socket.end()
    }
  }
}

/** Stops accepting connections, ends idle ones, and forces the rest after five seconds. */
export function closeServer(server: Server, beginClose: () => void) {
  return new Promise<void>((resolvePromise, reject) => {
    const forceClose = setTimeout(() => server.closeAllConnections(), 5_000)
    forceClose.unref()
    server.close(error => {
      clearTimeout(forceClose)
      if (error && (error as NodeJS.ErrnoException).code !== 'ERR_SERVER_NOT_RUNNING') reject(error)
      else resolvePromise()
    })
    beginClose()
    server.closeIdleConnections()
  })
}

/** Server-sent `change` events for live reload. */
export function createEventStream() {
  const clients = new Set<ServerResponse>()
  return {
    accept(request: IncomingMessage, response: ServerResponse) {
      response.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      })
      if (request.method === 'HEAD') {
        response.end()
        return
      }
      response.write(': connected\n\n')
      clients.add(response)
      request.on('close', () => clients.delete(response))
    },
    send(data: string) {
      for (const response of clients) response.write(`event: change\ndata: ${data}\n\n`)
    },
    close() {
      for (const response of clients) response.end()
      clients.clear()
    },
  }
}

/**
 * Watches directories under root and reports changed paths relative to root,
 * with `/` separators. Each directory is watched once, whole or one level deep.
 */
export function createDirectoryWatcher(
  root: string,
  ignore: (path: string) => boolean,
  onChange: (event: string, path: string) => void,
) {
  const watchers = new Map<string, FSWatcher>()
  let closed = false
  return {
    watch(directory: string, recursive: boolean) {
      if (closed || watchers.has(directory)) return
      const watcher = watch(directory, { recursive }, (event, filename) => {
        if (!filename) return
        const path = relative(root, join(directory, filename)).split(sep).join('/')
        if (!ignore(path)) onChange(event, path)
      })
      watcher.on('error', () => {
        watcher.close()
        watchers.delete(directory)
      })
      watchers.set(directory, watcher)
    },
    close() {
      closed = true
      for (const watcher of watchers.values()) watcher.close()
      watchers.clear()
    },
  }
}
