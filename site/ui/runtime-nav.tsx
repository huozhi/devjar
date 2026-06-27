import Link from 'next/link'

export function RuntimeNav({ active }: { active: 'react' | 'gl' }) {
  return (
    <div className="runtime-nav">
      <div className="runtime-label">Runtime</div>
      <div className="runtime-tabs">
        {active === 'react' ? (
          <button type="button" className="runtime-tab active">
            React
          </button>
        ) : (
          <Link href="/" className="runtime-tab">
            React
          </Link>
        )}
        {active === 'gl' ? (
          <button type="button" className="runtime-tab active">
            GL
          </button>
        ) : (
          <Link href="/gl" className="runtime-tab">
            GL
          </Link>
        )}
      </div>
    </div>
  )
}
