import type { OxcError } from 'oxc-transform'

type OxcTransform = Pick<typeof import('oxc-transform'), 'transformSync'>

let oxc: OxcTransform | undefined
// Bun strips import-ignore comments, then Turbopack rewrites import(moduleUrl) to
// an "unknown" context module. Keep this runtime import opaque to bundlers.
const dynamicImport = new Function('specifier', 'return import(specifier)')

function importModule(specifier: string): Promise<unknown> {
  return dynamicImport(specifier)
}

function isOxcTransform(value: unknown): value is OxcTransform {
  return typeof value === 'object'
    && value !== null
    && 'transformSync' in value
    && typeof value.transformSync === 'function'
}

function getLang(filename: string) {
  if (/\.[cm]?tsx?$/.test(filename)) return 'tsx'
  return 'jsx'
}

function getTransformErrorMessage(errors: OxcError[] | undefined) {
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
      const module = await importModule(moduleUrl)
      if (!isOxcTransform(module)) {
        throw new Error('devjar: Invalid oxc-transform module')
      }
      oxc = module
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
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    const stack = error instanceof Error ? error.stack : undefined
    self.postMessage({
      id,
      error: {
        message,
        stack,
      },
    })
  }
}

export {}
