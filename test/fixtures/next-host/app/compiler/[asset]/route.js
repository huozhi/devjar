import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

// Only the explicit-override fixture uses this route. The default fixture has
// no asset copy step, resolver, Next config, or hosting headers.
export async function GET(_request, { params }) {
  const { asset } = await params
  if (!['worker', 'binding', 'wasm'].includes(asset)) return new Response(null, { status: 404 })
  const root = join(process.cwd(), 'node_modules/devjar/dist')
  const manifest = JSON.parse(await readFile(join(root, 'transform-assets.json'), 'utf8'))
  return new Response(await readFile(join(root, manifest[asset])), {
    headers: { 'Content-Type': asset === 'wasm' ? 'application/wasm' : 'text/javascript' },
  })
}
