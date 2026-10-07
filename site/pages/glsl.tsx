import { useEffect, useRef, useState } from 'react'
import { Editor } from '@sugar-high/react'
import { taffy } from '@sugar-high/react/themes'
import '../styles.css'
import '../glsl.css'

const example = `float i,e,R,s;vec3 q,p,d=vec3((FC.xy-.5*r)/r.y*2.5,1.);for(q.z--;i++<99.;i>56.){o.rgb+=hsv(.57,-e,e/.7e1);p=q+=d*max(e,.01)*R*.2;p=vec3(log2(R=length(p))-t*1.5,e=-p.z/R-1.3+R,atan(p.x,p.y)-t*.25)-.5;for(s=2.;s<8e2;s+=s)e+=abs(dot(sin(p.zyy*s),cos(p*s+R)))/s*.9;}`

const vertexSource = `#version 300 es
in vec2 position;
void main() { gl_Position = vec4(position, 0.0, 1.0); }`

function fragmentSource(code: string) {
  return `#version 300 es
precision highp float;
uniform vec2 u_resolution;
uniform float u_time;
out vec4 color;
vec3 hsv(float h, float s, float v) {
  return v * mix(vec3(1.0), clamp(abs(fract(h + vec3(0.0, 2.0/3.0, 1.0/3.0)) * 6.0 - 3.0) - 1.0, 0.0, 1.0), s);
}
void main() {
  vec2 FC = gl_FragCoord.xy;
  vec2 r = u_resolution;
  float t = u_time;
  vec4 o = vec4(0.0);
  ${code}
  color = vec4(o.rgb, 1.0);
}`
}

function compile(gl: WebGL2RenderingContext, kind: number, source: string) {
  const shader = gl.createShader(kind)
  if (!shader) throw new Error('Could not create shader.')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || 'Shader compilation failed.'
    gl.deleteShader(shader)
    throw new Error(message)
  }
  return shader
}

export default function GlslPage() {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [code, setCode] = useState(example)
  const [runningCode, setRunningCode] = useState(example)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const queryCode = new URLSearchParams(window.location.search).get('code')
    if (queryCode !== null) {
      setCode(queryCode)
      setRunningCode(queryCode)
    }
  }, [])

  useEffect(() => {
    const timeout = window.setTimeout(() => setRunningCode(code), 350)
    return () => window.clearTimeout(timeout)
  }, [code])

  useEffect(() => {
    const element = canvas.current
    const gl = element?.getContext('webgl2')
    if (!element || !gl) {
      setError('WebGL 2 is unavailable in this browser.')
      return
    }

    let vertex: WebGLShader | undefined
    let fragment: WebGLShader | undefined
    let program: WebGLProgram | null = null
    let buffer: WebGLBuffer | null = null
    let animation = 0
    let observer: ResizeObserver | undefined
    let visibilityObserver: IntersectionObserver | undefined
    try {
      vertex = compile(gl, gl.VERTEX_SHADER, vertexSource)
      fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentSource(runningCode))
      program = gl.createProgram()
      if (!program) throw new Error('Could not create shader program.')
      gl.attachShader(program, vertex)
      gl.attachShader(program, fragment)
      gl.linkProgram(program)
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(program) || 'Shader linking failed.')
      }
      buffer = gl.createBuffer()
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
      const position = gl.getAttribLocation(program, 'position')
      gl.enableVertexAttribArray(position)
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)
      const resolution = gl.getUniformLocation(program, 'u_resolution')
      const time = gl.getUniformLocation(program, 'u_time')
      gl.useProgram(program)
      const started = performance.now()
      let lastFrame = 0
      let visible = true
      const resize = () => {
        const scale = Math.min(devicePixelRatio, 320 / Math.max(element.clientWidth, element.clientHeight, 1))
        const width = Math.max(1, Math.round(element.clientWidth * scale))
        const height = Math.max(1, Math.round(element.clientHeight * scale))
        if (element.width !== width || element.height !== height) {
          element.width = width
          element.height = height
          gl.viewport(0, 0, width, height)
        }
      }
      observer = new ResizeObserver(resize)
      observer.observe(element)
      visibilityObserver = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting })
      visibilityObserver.observe(element)
      const draw = (now: number) => {
        animation = requestAnimationFrame(draw)
        if (!visible || document.hidden || now - lastFrame < 1000 / 24) return
        lastFrame = now
        resize()
        gl.uniform2f(resolution, element.width, element.height)
        gl.uniform1f(time, (now - started) / 1000)
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
      }
      setError('')
      animation = requestAnimationFrame(draw)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
    return () => {
      cancelAnimationFrame(animation)
      observer?.disconnect()
      visibilityObserver?.disconnect()
      if (buffer) gl.deleteBuffer(buffer)
      if (program) gl.deleteProgram(program)
      if (vertex) gl.deleteShader(vertex)
      if (fragment) gl.deleteShader(fragment)
    }
  }, [runningCode])

  async function copyLink() {
    const url = new URL(window.location.href)
    url.searchParams.set('code', code)
    await navigator.clipboard.writeText(url.toString())
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  return <main className="glsl-page">
    <title>GLSL playground — Devjar</title>
    <div className="glsl-workspace">
      <div className="glsl-editor-row">
        <div className="glsl-editor-wrap">
          <Editor
            className="glsl-editor"
            theme={taffy.light}
            lang="c"
            controls={false}
            lineNumbers={false}
            fontSize={13}
            fontFamily="var(--font-ioskeley-mono)"
            value={code}
            onChange={setCode}
            textareaProps={{ 'aria-label': 'Fragment shader code', spellCheck: false }}
          />
        </div>
        <button className="glsl-share" type="button" onClick={() => void copyLink()}>{copied ? '[copied]' : '[share]'}</button>
      </div>
      <div className="glsl-preview"><canvas ref={canvas} aria-label="GLSL shader preview" />{error && <pre role="alert">{error}</pre>}</div>
    </div>
  </main>
}
