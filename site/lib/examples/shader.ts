import { source } from '../demo-files'

export function shuffleShaderColor(code: string) {
  return code.replace(/(\bhue\s*:\s*)(-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(?=\s*[,}])/i, (_, prefix, value) => {
    const hue = ((Number(value) % 1 + 1) % 1 + 0.2 + Math.random() * 0.6) % 1
    return prefix + hue.toFixed(2)
  })
}

export const shaderFiles = {
  'pages/index.tsx': source`\
  import { useEffect, useRef, useState } from 'react'
  import { init, effect, surface, frame } from 'vgpu@0.4.0'
  import { appearance } from '../vgpu'
  import { fragment } from '../fragment'
  import '../styles.css'

  export default function Shader() {
    const canvas = useRef(null)
    const settings = useRef(appearance)
    const paused = useRef(false)
    const pointer = useRef([0.5, 0.5])
    const [isPaused, setPaused] = useState(false)
    const [status, setStatus] = useState('Starting shader…')
    settings.current = appearance

    useEffect(() => {
      let alive = true, gpu, screen, animation
      function fail(error) {
        if (!alive) return
        cancelAnimationFrame(animation)
        setStatus(error.message?.includes('requestAdapter')
          ? 'WebGPU is unavailable. Try a browser with hardware acceleration enabled.'
          : error.message || 'Could not start the shader. Try reloading.')
      }
      async function start() {
        if (!navigator.gpu) {
          setStatus('This shader needs a browser with WebGPU enabled.')
          return
        }
        gpu = await init()
        if (!alive) { gpu.dispose(); return }
        gpu.onError(fail)
        screen = surface(gpu, canvas.current, { dpr: [1, 2] })
        const shader = effect(gpu, fragment)
        let time = 0, previous = performance.now()
        function draw(now) {
          if (!alive) return
          const delta = Math.min((now - previous) / 1000, 0.05)
          previous = now
          if (!paused.current) time += delta * settings.current.speed
          try {
            frame(gpu, current => {
              shader.set({ params: {
                time, aspect: screen.size[0] / screen.size[1],
                scale: settings.current.scale, warp: settings.current.warp,
                hue: settings.current.hue, bands: settings.current.bands,
                pointer: pointer.current,
              } })
              current.pass(screen, shader)
            })
            animation = requestAnimationFrame(draw)
          } catch (error) { fail(error) }
        }
        setStatus('')
        animation = requestAnimationFrame(draw)
      }
      start().catch(fail)
      return () => {
        alive = false
        cancelAnimationFrame(animation)
        screen?.dispose()
        gpu?.dispose()
      }
    }, [])

    return <main>
      <div className="stage">
        <canvas ref={canvas} aria-label="Animated iridescent shader"
          onPointerMove={event => {
            const rect = event.currentTarget.getBoundingClientRect()
            pointer.current = [(event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height]
          }} />
        {status && <p role="status">{status}</p>}
      </div>
      <footer><span>Move your pointer. Bend the light.</span>
        <button disabled={!!status} aria-pressed={isPaused} onClick={() => {
          paused.current = !paused.current; setPaused(paused.current)
        }}>{isPaused ? 'Resume' : 'Pause'}</button>
      </footer>
    </main>
  }
  `,
  'vgpu.ts': source`\
  // Warm — change a number to reshape the light.
  export const appearance = {
    speed: 0.35,  // 0 freezes time.
    scale: 2.4,   // Zoom into the pattern.
    warp: 1.2,    // Twist the flowing bands.
    hue: 0.15,    // Try 0.6 for a new palette.
    bands: 3,     // More bands, finer ribbons.
  }
  `,
  'fragment.ts': source`\
  export const fragment = \`
    struct Params {
      time: f32, aspect: f32, scale: f32, warp: f32,
      hue: f32, bands: f32, pointer: vec2f,
    }
    @group(0) @binding(0) var<uniform> params: Params;

    @fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
      var p = (uv - 0.5) * vec2f(params.aspect, 1.0) * params.scale;
      p += (params.pointer - 0.5) * 0.7;
      let t = params.time;
      for (var i = 0; i < 3; i++) {
        let n = f32(i) + 1.0;
        p += params.warp / n * vec2f(
          sin(p.y * n + t * 0.7), cos(p.x * n - t * 0.5)
        );
      }
      let wave = p.x + sin(p.y + t) * 0.7;
      let phase = wave * params.bands + t;
      let palette = 0.62 + 0.38 * cos(phase + params.hue * 6.28318 + vec3f(0.0, 1.0, 2.0));
      let shine = pow(0.5 + 0.5 * sin(phase + 0.6), 12.0);
      let color = palette * (0.65 + 0.35 * shine) + shine * 0.18;
      return vec4f(color, 1.0);
    }
  \`
  `,
  'styles.css': source`\
  * { box-sizing: border-box; }
  body { margin: 0; background: #13131b; color: #c7c5d6; font-family: Arial, sans-serif; }
  main { min-height: 360px; display: flex; flex-direction: column; }
  .stage { position: relative; height: 318px; }
  canvas { display: block; width: 100%; height: 100%; }
  .stage p { position: absolute; inset: 0; margin: 0; display: grid; place-content: center; padding: 24px; background: #13131b; font-size: 12px; text-align: center; }
  footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 11px 18px; font-size: 10px; border-top: 1px solid #302d3e; }
  button { background: none; border: 0; padding: 3px 0; font: inherit; color: #e3d9fb; cursor: pointer; }
  button:hover { color: white; }button:disabled { opacity: 0.4; cursor: default; }
  button:focus-visible { outline: 2px solid #b5a3e8; outline-offset: 4px; }
  `,
}
