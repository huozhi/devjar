'use client'

import { useMemo, useState } from 'react'
import { DevJar } from 'devjar'

const dependencies = { react: '19.2.3', 'react-dom': '19.2.3', swr: 'latest' }
const examples = {
  SWR: `import { useState } from 'react'
import useSWR from 'swr'
export default function Page() {
  const [count, setCount] = useState(0)
  const { data } = useSWR('message', async () => 'SWR')
  return <><p>Hello from {data ?? 'Loading…'}</p><button onClick={() => setCount(count + 1)}>Count {count}</button></>
}`,
  Infinite: `import useSWRInfinite from 'swr/infinite'
export default function Page() {
  const { data, size, setSize } = useSWRInfinite(index => 'page-' + index, async key => key)
  return <><p>{data?.join(', ') ?? 'Loading…'}</p><button onClick={() => setSize(size + 1)}>More</button></>
}`,
  Subscription: `import useSWRSubscription from 'swr/subscription'
export default function Page() {
  const { data } = useSWRSubscription('message', (_key, { next }) => {
    next(null, 'Subscription works')
    return () => {}
  })
  return <p>{data ?? 'Loading…'}</p>
}`,
}

export default function Playground({ compiler }) {
  const [example, setExample] = useState('SWR')
  const [code, setCode] = useState(examples.SWR)
  const [error, setError] = useState('')
  const files = useMemo(() => ({ 'pages/index.jsx': code }), [code])
  return <main style={{ maxWidth: 900, margin: '40px auto', fontFamily: 'system-ui' }}>
    <h1>DevJar in Next.js</h1>
    <nav>{Object.keys(examples).map(name => <button key={name} onClick={() => {
      setExample(name)
      setCode(examples[name])
    }}>{name}</button>)}</nav>
    <textarea aria-label="Code" value={code} onChange={event => setCode(event.target.value)} style={{ width: '100%', height: 220, marginTop: 16 }} />
    <button onClick={() => setCode(examples[example])}>Reset</button>
    <pre role="status">{error}</pre>
    <DevJar title="Live preview" files={files} dependencies={dependencies} compiler={compiler} tailwind={false}
      onError={error => setError(error ? String(error) : '')} style={{ width: '100%', height: 240, border: '1px solid #ddd' }} />
  </main>
}
