import { GlslSandbox } from '../../ui/glsl-sandbox'
import { CodeBlock } from '../../ui/code-block'
import { RuntimeNav } from '../../ui/runtime-nav'

const DEFAULT_SHADER = `\
precision mediump float;

uniform vec2 u_resolution;
uniform float u_time;
uniform vec2 u_mouse;

void main() {
  vec2 st = gl_FragCoord.xy / u_resolution.xy;
  
  // Create a pulsing circle
  vec2 center = vec2(0.5, 0.5);
  float dist = distance(st, center);
  float radius = 0.3 + 0.1 * sin(u_time * 2.0);
  
  // Create color based on distance and time
  vec3 color = vec3(0.0);
  if (dist < radius) {
    float intensity = 1.0 - (dist / radius);
    color = vec3(
      0.5 + 0.5 * sin(u_time + st.x * 10.0),
      0.5 + 0.5 * sin(u_time + st.y * 10.0 + 2.0),
      0.5 + 0.5 * sin(u_time + (st.x + st.y) * 10.0 + 4.0)
    ) * intensity;
  }
  
  // Add mouse interaction
  vec2 mouseDist = st - u_mouse;
  float mouseRadius = 0.1;
  if (length(mouseDist) < mouseRadius) {
    color += vec3(1.0, 1.0, 0.5) * (1.0 - length(mouseDist) / mouseRadius) * 0.5;
  }
  
  gl_FragColor = vec4(color, 1.0);
}
`

const glRuntimeExample = `import { useGL } from 'devjar'
import { useRef } from 'react'

function Shader() {
  const canvasRef = useRef(null)
  
  useGL({
    fragment: \`
      precision mediump float;
      uniform vec2 u_resolution;
      uniform float u_time;
      
      void main() {
        vec2 st = gl_FragCoord.xy / u_resolution.xy;
        gl_FragColor = vec4(st.x, st.y, abs(sin(u_time)), 1.0);
      }
    \`,
    canvasRef,
    onError: (err) => console.error(err)
  })
  
  return <canvas ref={canvasRef} />
}`

export default function GlPage() {
  return (
    <>
      <div className="playground-container">
        <RuntimeNav active="gl" />
        <div className="playground-wrapper">
          <GlslSandbox initialCode={DEFAULT_SHADER} />
        </div>
      </div>
      
      <div className="usage-section">
        <div className="usage-content">
          <h2>Usage</h2>
          <div className="usage-example">
            <h3>GL Runtime</h3>
            <p>
              Import <code>useGL</code> from <code>devjar</code> and call it with your fragment shader code, 
              a canvas ref, and an optional error callback. The hook handles WebGL setup, shader compilation, 
              and provides automatic uniforms for time, resolution, and mouse position.
            </p>
            <CodeBlock code={glRuntimeExample} />
          </div>
        </div>
      </div>
    </>
  )
}

