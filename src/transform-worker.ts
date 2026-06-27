let oxc: any

function getLang(filename: string) {
  if (/\.[cm]?tsx?$/.test(filename)) return 'tsx'
  return 'jsx'
}

function getTransformErrorMessage(errors: any[] | undefined) {
  if (!errors?.length) return ''

  const error = errors.find(error => error.severity === 'Error')
  if (!error) return ''

  return error.codeframe || error.message || 'devjar: transform failed'
}

self.onmessage = async ({ data }: MessageEvent<{
  id: number
  moduleUrl: string
  files: Record<string, string>
}>) => {
  const { id, moduleUrl, files } = data
  try {
    if (!oxc) {
      oxc = await import(/* webpackIgnore: true */ /* @vite-ignore */ /* turbopackIgnore: true */ moduleUrl)
    }

    const transformed: Record<string, string> = {}
    for (const [filename, source] of Object.entries(files)) {
      const output = oxc.transformSync(filename, source, {
        lang: getLang(filename),
        sourceType: 'module',
        target: 'es2022',
        decorator: {
          legacy: true,
        },
        jsx: {
          runtime: 'automatic',
          development: true,
          refresh: true,
        },
        sourcemap: false,
      })

      const errorMessage = getTransformErrorMessage(output.errors)
      if (errorMessage) throw new Error(errorMessage)

      transformed[filename] = output.code
    }
    self.postMessage({ id, transformed })
  } catch (error: any) {
    self.postMessage({
      id,
      error: {
        message: error?.message || String(error),
        stack: error?.stack,
      },
    })
  }
}

export {}
