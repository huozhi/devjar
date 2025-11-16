import Link from 'next/link'

export function RuntimeNav({ active }: { active: 'react' | 'gl' }) {
  return (
    <div className="examples-section">
      <div className="examples-label">Examples</div>
      <div className="example-tabs">
        {active === 'react' ? (
          <button className="example-tab active">
            React Runtime
          </button>
        ) : (
          <Link href="/" className="example-tab">
            React Runtime
          </Link>
        )}
        {active === 'gl' ? (
          <button className="example-tab active">
            GL Runtime
          </button>
        ) : (
          <Link href="/gl" className="example-tab">
            GL Runtime
          </Link>
        )}
      </div>
    </div>
  )
}

