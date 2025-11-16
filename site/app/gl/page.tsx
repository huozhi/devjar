import { GlslSandbox } from '../../ui/glsl-sandbox'

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

export default function GlPage() {
  return (
    <main>
      <div className="titles">
        <h1>GLSL Shader Playground</h1>
        <p>
          Write and preview GLSL fragment shaders in real-time.
        </p>
      </div>

      <div className="playground-container">
        <div className="playground-wrapper">
          <GlslSandbox initialCode={DEFAULT_SHADER} />
        </div>
      </div>
    </main>
  )
}

