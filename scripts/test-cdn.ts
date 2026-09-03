export function testCdnModule(pathname: string) {
  if (pathname.includes('/tailwindcss@') && pathname.endsWith('/index.css')) {
    return '@tailwind utilities;'
  }
  if (pathname.includes('/tailwindcss@')) {
    return `export async function compile() {
  return {
    build(candidates) {
      return '/* ' + JSON.stringify(candidates) + ' */\\nbody { --devjar-tailwind-test: 1; }'
    },
  }
}`
  }
  if (pathname.includes('/es-module-lexer@')) {
    return `export const init = Promise.resolve()
export function parse() { return [[], []] }`
  }
  if (pathname.includes('/jsx-runtime') || pathname.includes('/jsx-dev-runtime')) {
    return `export const Fragment = Symbol.for('react.fragment')
export function jsx(type, props) { return { type, props: props || {} } }
export const jsxs = jsx
export const jsxDEV = jsx`
  }
  if (pathname.includes('/react-dom@') && pathname.includes('/server')) {
    return `function escape(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}
let metadata = ''
function render(node, hoistMetadata) {
  if (node == null || typeof node === 'boolean') return ''
  if (Array.isArray(node)) return node.map(child => render(child, hoistMetadata)).join('')
  if (typeof node === 'string' || typeof node === 'number') return escape(node)
  if (typeof node.type === 'function') return render(node.type(node.props), hoistMetadata)
  if (node.type === Symbol.for('react.fragment')) return render(node.props.children, hoistMetadata)
  const attributes = Object.entries(node.props || {})
    .filter(([name]) => name !== 'children')
    .map(([name, value]) => ' ' + (name === 'className' ? 'class' : name) + '="' + escape(value) + '"')
    .join('')
  const isVoid = node.type === 'meta' || node.type === 'link'
  const element = '<' + node.type + attributes + '>'
    + (isVoid ? '' : render(node.props?.children, hoistMetadata) + '</' + node.type + '>')
  if (hoistMetadata && (node.type === 'title' || isVoid)) {
    metadata += element
    return ''
  }
  return element
}
export function renderToString(node) {
  metadata = ''
  return render(node, true).replace('</head>', metadata + '</head>')
}`
  }
  if (pathname.includes('/react@')) {
    return `export function createElement(type, props, ...children) {
  return {
    type,
    props: {
      ...(props || {}),
      ...(children.length ? { children: children.length === 1 ? children[0] : children } : {}),
    },
  }
}
export function useCallback(callback) { return callback }
export function useEffect() {}
export function useId() { return 'test-id' }
export function useImperativeHandle() {}
export function useMemo(factory) { return factory() }
export function useRef(value) { return { current: value } }
export function useState(value) { return [typeof value === 'function' ? value() : value, () => {}] }
export default { createElement }`
  }
  return `throw new Error('Unknown test CDN module: ${pathname}')`
}
