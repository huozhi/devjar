type BrowserCompiler = {
  default: (options: { module_or_path: string }) => Promise<unknown>
  transform: (filename: string, source: string) => string
}

const workerUrl = new URL(globalThis.location.href)

function requiredAssetUrl(name: string) {
  const url = workerUrl.searchParams.get(name)
  if (!url) throw new Error(`devjar: transform worker asset URL is required: ${name}`)
  return url
}

async function loadCompiler(): Promise<BrowserCompiler> {
  // This worker is emitted as a standalone asset, outside the host's module graph.
  const compiler = await import(requiredAssetUrl('binding')) as BrowserCompiler
  await compiler.default({ module_or_path: requiredAssetUrl('wasm') })
  return compiler
}

let compilerPromise: Promise<BrowserCompiler> | undefined

self.onmessage = async ({ data }: MessageEvent<{
  id: number
  files: Record<string, string>
}>) => {
  const { id, files } = data
  try {
    compilerPromise ??= loadCompiler().catch(error => {
      compilerPromise = undefined
      throw error
    })
    const compiler = await compilerPromise
    const transformed: Record<string, string> = {}
    for (const [filename, source] of Object.entries(files)) {
      transformed[filename] = compiler.transform(filename, source)
    }
    self.postMessage({ id, transformed })
  } catch (error: unknown) {
    self.postMessage({
      id,
      error: {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
    })
  }
}

export {}
