import { useState } from 'react'
import data from './data.json'
import './chart.css'

// A single component file: `npx devjar chart.tsx` renders it at /.
export default function Chart() {
  const [highlight, setHighlight] = useState(-1)
  const max = Math.max(...data.weeks.map(week => week.signups))
  return (
    <main>
      <h1>{data.title}</h1>
      <div className="chart" role="img" aria-label="Bar chart of weekly signups">
        {data.weeks.map((week, index) => (
          <button
            key={week.label}
            className={index === highlight ? 'bar active' : 'bar'}
            style={{ height: `${(week.signups / max) * 100}%` }}
            onClick={() => setHighlight(index)}
          >
            <span>{week.signups}</span>
          </button>
        ))}
      </div>
      <p>{highlight === -1 ? 'Click a bar.' : `${data.weeks[highlight].label}: ${data.weeks[highlight].signups} signups`}</p>
    </main>
  )
}
