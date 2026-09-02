#!/usr/bin/env node
import { startDevServer } from '../cli'

function help() {
  console.log(`devjar [root] [options]

Serve a folder of React pages with CDN dependencies.

Options:
  --host <host>  Host to listen on (default: 127.0.0.1)
  --port <port>  Port to listen on (default: 3000)
  --help         Show this help`)
}

const args = process.argv.slice(2)
if (args.includes('--help') || args.includes('-h')) {
  help()
  process.exit(0)
}

let root: string | undefined
let host: string | undefined
let port: number | undefined
for (let index = 0; index < args.length; index++) {
  const arg = args[index]
  if (arg === '--host') host = args[++index]
  else if (arg === '--port' || arg === '-p') port = Number(args[++index])
  else if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg}`)
  else if (!root) root = arg
  else throw new Error(`Unexpected argument: ${arg}`)
}
if (port !== undefined && (!Number.isInteger(port) || port < 0 || port > 65535)) {
  throw new Error(`Invalid port: ${port}`)
}

const server = await startDevServer({ root, host, port })
console.log(`Devjar serving ${server.root}`)
console.log(`http://${server.host}:${server.port}`)

async function close() {
  await server.close()
  process.exit(0)
}
process.once('SIGINT', close)
process.once('SIGTERM', close)
