import { watch } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const entry = join(root, 'src/client.tsx')
const inputs = [entry]

async function buildClient() {
  const result = await Bun.build({
    entrypoints: [entry],
    outdir: join(root, 'dist'),
    naming: 'client.js',
    target: 'browser',
    format: 'esm',
    external: ['react', 'react-dom'],
  })

  if (!result.success) {
    for (const log of result.logs) console.error(log)
    throw new Error('Unable to build the Devjar browser client')
  }

  for (const output of result.outputs) {
    console.log(`${output.path.replace(`${root}/`, '')} ${output.size} bytes`)
  }
}

await buildClient()

if (process.argv.includes('--watch')) {
  let building = false
  for (const input of inputs) {
    watch(input, async () => {
      if (building) return
      building = true
      try {
        await buildClient()
      } catch (error) {
        console.error(error)
      } finally {
        building = false
      }
    })
  }
}
