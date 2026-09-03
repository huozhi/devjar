#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { buildProject, startBuiltServer, startDevServer } from '../cli/index'

type Command = 'dev' | 'build' | 'start'

const useColor = Boolean(process.stdout.isTTY && !process.env.NO_COLOR)

function style(code: number, value: string) {
  return useColor ? `\u001b[${code}m${value}\u001b[0m` : value
}

function help() {
  console.log(`devjar [command] [root] [options]

Turn a folder of React pages into a prototype.

Commands:
  dev      Start a development server (default)
  build    Create production output in <root>/dist
  start    Serve a directory created by devjar build

Options:
  --cdn <url>      ESM-compatible module CDN (dev and build)
  --host <host>    Host to listen on (dev and start; default: localhost)
  --port <port>    Port to listen on (dev and start; default: 3000)
  -o, --out-dir   Build output relative to the project root (default: dist)
  -v, --version    Show the installed version
  -h, --help       Show this help

Examples:
  devjar
  devjar dev examples/dashboard
  devjar build examples/dashboard
  devjar start examples/dashboard/dist`)
}

function valueAfter(args: string[], index: number) {
  const value = args[index + 1]
  if (!value || value.startsWith('-')) throw new Error(`Missing value for ${args[index]}`)
  return value
}

async function version() {
  const candidates = [
    new URL('../package.json', import.meta.url),
    new URL('../../package.json', import.meta.url),
  ]
  for (const url of candidates) {
    try {
      const packageJson = JSON.parse(await readFile(url, 'utf8'))
      if (packageJson.name === 'devjar' && packageJson.version) return packageJson.version as string
    } catch {}
  }
  return 'unknown'
}

function friendlyError(error: unknown) {
  if ((error as NodeJS.ErrnoException)?.code === 'EADDRINUSE') {
    return 'Port is already in use. Choose another one with --port <port>.'
  }
  return error instanceof Error ? error.message : String(error)
}

async function run() {
  const args = process.argv.slice(2)
  if (args.includes('--help') || args.includes('-h')) {
    help()
    return
  }
  if (args.includes('--version') || args.includes('-v')) {
    console.log(await version())
    return
  }

  const commands = new Set<Command>(['dev', 'build', 'start'])
  const command: Command = commands.has(args[0] as Command) ? args.shift() as Command : 'dev'
  let root: string | undefined
  let host: string | undefined
  let port: number | undefined
  let cdn: string | undefined
  let outDir: string | undefined

  for (let index = 0; index < args.length; index++) {
    const arg = args[index]
    if (arg === '--host') host = valueAfter(args, index++)
    else if (arg === '--port' || arg === '-p') port = Number(valueAfter(args, index++))
    else if (arg === '--cdn') cdn = valueAfter(args, index++)
    else if (arg === '--out-dir' || arg === '-o') outDir = valueAfter(args, index++)
    else if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg}`)
    else if (!root) root = arg
    else throw new Error(`Unexpected argument: ${arg}`)
  }

  if (port !== undefined && (!Number.isInteger(port) || port < 0 || port > 65535)) {
    throw new Error(`Invalid port: ${port}`)
  }
  if (command === 'build' && (host || port !== undefined)) {
    throw new Error('build does not accept --host or --port')
  }
  if (command === 'start' && (cdn || outDir)) {
    throw new Error('start does not accept --cdn or --out-dir; configure these when building')
  }
  if (command === 'dev' && outDir) throw new Error('dev does not accept --out-dir')

  if (command === 'build') {
    const result = await buildProject({
      root: root || process.cwd(),
      outDir: outDir || 'dist',
      cdn,
      prerender: true,
    })
    console.log(style(1, 'Devjar build complete'))
    console.log('')
    console.log(`Output  ${style(36, result.outDir)}`)
    console.log(`Routes  ${result.routes.length}`)
    return
  }

  const server = command === 'start'
    ? await startBuiltServer({
        root: root || join(process.cwd(), 'dist'),
        host: host || 'localhost',
        port: port ?? 3000,
      })
    : await startDevServer({
        root: root || process.cwd(),
        host: host || 'localhost',
        port: port ?? 3000,
        cdn,
      })
  const browserHost = server.host === '0.0.0.0' || server.host === '::'
    ? 'localhost'
    : server.host.includes(':') ? `[${server.host}]` : server.host
  const url = `http://${browserHost}:${server.port}/`
  console.log(style(1, command === 'start' ? 'Devjar production server ready' : 'Devjar development server ready'))
  console.log('')
  console.log(`Local  ${style(36, url)}`)

  let shuttingDown = false
  async function close(signal: string) {
    if (shuttingDown) return
    shuttingDown = true
    console.log(`\n${signal} received, shutting down…`)
    try {
      await server.close()
    } catch (error) {
      console.error(friendlyError(error))
      process.exitCode = 1
    }
  }
  process.once('SIGINT', () => void close('SIGINT'))
  process.once('SIGTERM', () => void close('SIGTERM'))
}

run().catch(error => {
  console.error(`Devjar: ${friendlyError(error)}`)
  process.exitCode = 1
})
