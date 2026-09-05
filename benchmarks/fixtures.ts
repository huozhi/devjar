export function project(components: number) {
  const files: Record<string, string> = {}
  for (let i = 0; i < components; i++) {
    files[`components/Item${i}.tsx`] = `import { useState } from 'react'
export default function Item${i}() {
  const [count, setCount] = useState(0)
  const values: number[] = [${Array.from({ length: 30 }, (_, n) => n).join(',')}]
  return <section><button id="item-${i}" onClick={() => setCount(count + 1)}>Revision 0 Count {count}</button>
    <ul>{values.map(value => <li key={value}>Item ${i}: {value * 2}</li>)}</ul></section>
}`
  }
  files['pages/index.tsx'] = Array.from({ length: components }, (_, i) =>
    `import Item${i} from '../components/Item${i}'`).join('\n') +
    `\nexport default function Page() { return <main>${Array.from({ length: components }, (_, i) => `<Item${i} />`).join('')}</main> }`
  return files
}

