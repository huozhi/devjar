import { readFile, writeFile } from 'node:fs/promises'

const root = new URL('../examples/swr/', import.meta.url)
const paths = ['swr.ts', 'demo.ts', 'pages/index.tsx', 'styles.css']
const entries = await Promise.all(paths.map(async path => [path, await readFile(new URL(path, root), 'utf8')]))
const files = Object.fromEntries(entries)
await writeFile(new URL('../site/lib/examples/swr.ts', import.meta.url),
  '// Generated from examples/swr by bun scripts/sync-swr-example.ts.\n'
  + 'export const swrFiles = ' + JSON.stringify(files, null, 2) + '\n')
