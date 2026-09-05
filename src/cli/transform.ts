import type { OxcError, TransformOptions } from 'oxc-transform'

export function getTransformOptions(
  filename: string,
  development: boolean,
  refresh: boolean,
): TransformOptions {
  return {
    lang: /\.[cm]?tsx?$/.test(filename) ? 'tsx' : 'jsx',
    sourceType: 'module',
    target: 'es2022',
    define: {
      'process.env.NODE_ENV': JSON.stringify(development ? 'development' : 'production'),
    },
    decorator: {
      legacy: true,
    },
    jsx: {
      runtime: 'automatic',
      development,
      refresh,
    },
    sourcemap: false,
  }
}

export function getTransformErrorMessage(errors: OxcError[] | undefined) {
  if (!errors?.length) return ''
  const error = errors.find(error => error.severity === 'Error')
  return error?.codeframe || error?.message || ''
}
