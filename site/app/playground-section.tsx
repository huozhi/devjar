'use client'

import { Codesandbox } from '../ui/codesandbox'
import { useState } from 'react'

export default function PlaygroundSection({ examples }: { examples: Array<{ id: string; name: string; files: Record<string, string> }> }) {
  const [activeExample, setActiveExample] = useState('playground')
  const currentExample = examples.find(ex => ex.id === activeExample) || examples[0]

  return (
    <div className="playground-container">
      <div className="examples-section">
        <div className="examples-label">Examples</div>
        <div className="example-tabs">
          {examples.map((example) => (
            <button
              key={example.id}
              className={`example-tab ${activeExample === example.id ? 'active' : ''}`}
              onClick={() => setActiveExample(example.id)}
            >
              {example.name}
            </button>
          ))}
        </div>
      </div>
      <div className="playground-wrapper">
        <Codesandbox key={activeExample} files={currentExample.files} />
      </div>
    </div>
  )
}

