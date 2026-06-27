'use client'

import { Codesandbox } from '../ui/codesandbox'

export default function PlaygroundSection({ 
  codeRuntimeFiles
}: { 
  codeRuntimeFiles: Record<string, string>
}) {
  return (
    <>
      <div className="playground-container">
        <div className="playground-wrapper">
          <Codesandbox files={codeRuntimeFiles} />
        </div>
      </div>
    </>
  )
}
