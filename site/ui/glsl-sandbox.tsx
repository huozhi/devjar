'use client'

import { Editor } from 'codice'
import { useRef, useState } from 'react'
import { useGL } from 'devjar'
import './codesandbox.css'
import './glsl-sandbox.css'

// Default fragment shader
const DEFAULT_FRAGMENT_SHADER = `\
precision mediump float;

uniform vec2 u_resolution;
uniform float u_time;
uniform vec2 u_mouse;

void main() {
  vec2 st = gl_FragCoord.xy / u_resolution.xy;
  vec3 color = vec3(st.x, st.y, abs(sin(u_time)));
  gl_FragColor = vec4(color, 1.0);
}
`

export function GlslSandbox({ initialCode }: { initialCode?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [code, setCode] = useState(initialCode || DEFAULT_FRAGMENT_SHADER)
  const [error, setError] = useState<string | null>(null)

  useGL({
    fragment: code,
    canvasRef,
    onError: setError,
  })

  return (
    <div data-codesandbox="gl">
      <div className="codesandbox-layout">
        <div className="glsl-editor-wrapper">
          <Editor
            className="editor"
            controls={false}
            title={null}
            lineNumbers={true}
            fontSize={13}
            value={code}
            onChange={(newCode) => setCode(newCode)}
          />
        </div>
      </div>
      <div className="preview">
        <canvas
          ref={canvasRef}
          className="glsl-canvas"
        />
        {error && (
          <pre className="preview--error" dangerouslySetInnerHTML={{ __html: error }} />
        )}
      </div>
    </div>
  )
}

