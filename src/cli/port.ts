import { createServer } from 'node:net'

// A server on `localhost` binds one address family, so another program can
// hold the same port on the other family. Browsers may then reach that
// program at http://localhost:<port>, so treat the port as busy.

function listens(port: number, host: string) {
  return new Promise<boolean>(resolve => {
    const server = createServer()
    server.once('error', (error: NodeJS.ErrnoException) => {
      // A machine without IPv6 cannot have the port in use there.
      resolve(error.code !== 'EADDRINUSE')
    })
    server.listen({ port, host, exclusive: true }, () => server.close(() => resolve(true)))
  })
}

/** Whether `localhost` can use `port` on both IPv4 and IPv6. Other hosts report their own conflicts when listening. */
export async function isPortFree(port: number, host: string) {
  if (host !== 'localhost') return true
  for (const address of ['127.0.0.1', '::1']) {
    if (!await listens(port, address)) return false
  }
  return true
}
