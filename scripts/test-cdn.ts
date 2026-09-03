export function testCdnModule(pathname: string) {
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
function render(node) {
  if (node == null || typeof node === 'boolean') return ''
  if (Array.isArray(node)) return node.map(render).join('')
  if (typeof node === 'string' || typeof node === 'number') return escape(node)
  if (typeof node.type === 'function') return render(node.type(node.props))
  if (node.type === Symbol.for('react.fragment')) return render(node.props.children)
  const attributes = Object.entries(node.props || {})
    .filter(([name]) => name !== 'children')
    .map(([name, value]) => ' ' + (name === 'className' ? 'class' : name) + '="' + escape(value) + '"')
    .join('')
  return '<' + node.type + attributes + '>' + render(node.props?.children) + '</' + node.type + '>'
}
export function renderToString(node) { return render(node) }`
  }
  if (pathname.includes('/react@')) {
    return `export function createElement(type, props) { return { type, props: props || {} } }
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
