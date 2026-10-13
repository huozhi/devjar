import katex from 'katex'
import type { MarkedExtension, Tokens } from 'marked'

type MathToken = Tokens.Generic & {
  text: string
  displayMode: boolean
}

const inlineMath = /^(\${1,2})(?!\$)((?:\\.|[^\\\n])*?(?:\\.|[^\\\n\$]))\1/
const blockMath = /^(\${1,2})\n([\s\S]*?)\n\1(?=\n|$)/

function render(token: MathToken) {
  return katex.renderToString(token.text, {
    displayMode: token.displayMode,
    throwOnError: true,
    trust: false,
    output: 'htmlAndMathml',
    maxSize: 20,
    maxExpand: 1000,
  })
}

export function markdownMath(): MarkedExtension {
  // Keep the tokenizer local while marked-katex-extension requires KaTeX <0.19.
  return {
    extensions: [
      {
        name: 'inlineKatex',
        level: 'inline',
        start(source) {
          for (let index = source.indexOf('$'); index !== -1; index = source.indexOf('$', index + 1)) {
            if (inlineMath.test(source.slice(index))) return index
          }
        },
        tokenizer(source) {
          const match = inlineMath.exec(source)
          if (!match) return
          return { type: 'inlineKatex', raw: match[0], text: match[2].trim(), displayMode: match[1].length === 2 }
        },
        renderer(token) { return render(token as MathToken) },
      },
      {
        name: 'blockKatex',
        level: 'block',
        tokenizer(source) {
          const match = blockMath.exec(source)
          if (!match) return
          return { type: 'blockKatex', raw: match[0], text: match[2].trim(), displayMode: match[1].length === 2 }
        },
        renderer(token) { return render(token as MathToken) + '\n' },
      },
    ],
  }
}
