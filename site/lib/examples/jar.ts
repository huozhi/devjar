import { source } from '../demo-files'

export const jarFiles = {
  'jar.json': source`\
  {
    "pieces": 100,
    "wind": 0.8,
    "colors": ["#e87955", "#efb94f", "#d96f83", "#f5d69a", "#b28ac7"],
    "gravity": 1.8,
    "glass": 0.12
  }
  `,
  'confetti.ts': source`\
  // GLSL fragment shader: edit the paper's appearance live.
  export default \`
  uniform float uTime;
  varying vec2 vUv;
  varying vec3 vColor;

  void main() {
    // Try 0.45 for round pieces, or 0.05 for square corners.
    float radius = 0.15;
    vec2 edge = abs(vUv - 0.5) - vec2(0.5 - radius);
    if (length(max(edge, 0.0)) > radius) discard;

    // Raise this to 0.5 for a stronger shimmer.
    float shimmer = 0.12 * sin(uTime * 3.0 + vUv.y * 12.0);
    vec3 paper = vColor * (0.88 + shimmer);
    gl_FragColor = vec4(paper, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
  \`
  `,
  'pages/index.tsx': source`\
  import { useEffect, useMemo, useRef, useState } from 'react'
  import { Canvas, useFrame } from '@react-three/fiber'
  import { CanvasTexture, Color, Object3D, DoubleSide, EquirectangularReflectionMapping, SRGBColorSpace, SplineCurve, Vector2 } from 'three'
  import jar from '../jar.json'
  import fragmentShader from '../confetti'
  import '../styles.css'

  const vertexShader = \`
  varying vec2 vUv;
  varying vec3 vColor;
  void main() {
    vUv = uv;
    vColor = instanceColor;
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  }
  \`

  function Coriandoli({ moving, burst }) {
    const mesh = useRef(null)
    const time = useRef(0)
    const uniforms = useMemo(() => ({ uTime: { value: 0 } }), [])
    const count = Math.max(1, Math.min(400, Math.floor(Number(jar.pieces) || 1)))
    const pieces = useMemo(() => Array.from({ length: count }, (_, index) => {
      const phase = index * 2.39996
      const radius = 0.2 + (index * 0.618 % 1) * 0.48
      return {
        phase, size: 0.035 + (index * 0.317 % 1) * 0.04,
        x: Math.cos(phase) * radius, y: -0.7 + (index * 0.754 % 1) * 1.15,
        z: Math.sin(phase) * radius, vx: 0, vy: 0, vz: 0,
        rx: phase, ry: phase * 0.7, rz: phase * 0.3,
      }
    }), [count])
    const dummy = useMemo(() => new Object3D(), [])
    useEffect(() => {
      pieces.forEach((_, index) => mesh.current.setColorAt(index,
        new Color(jar.colors[index % jar.colors.length] || '#e87955')))
      mesh.current.instanceColor.needsUpdate = true
    }, [pieces, jar.colors])
    useFrame((_, delta) => {
      const dt = moving ? Math.min(delta, 0.05) : 0
      const steps = Math.max(1, Math.ceil(dt / 0.012))
      const step = dt / steps
      for (let frame = 0; frame < steps; frame++) {
        time.current += step
        const t = time.current
        // Uneven gusts from a wandering jet near the bottom.
        const pulse = Math.max(0, Math.sin(t * 1.7) * 0.55 + Math.sin(t * 0.73 + 1) * 0.45)
        const gust = Math.max(0, jar.wind) * (0.08 + Math.pow(pulse, 4) * 9) + burst.current
        burst.current *= Math.exp(-step * 4)
        const jetX = Math.sin(t * 0.67) * 0.25
        const jetZ = Math.cos(t * 0.91) * 0.25
        pieces.forEach(piece => {
          const distance = (piece.x - jetX) ** 2 + (piece.z - jetZ) ** 2
          const lift = gust * Math.exp(-distance * 1.1) * Math.exp(-(piece.y + 0.8) * 0.85)
          const flutter = Math.sin(t * 7 + piece.phase)
          piece.vx += (Math.sin(t * 2.3 + piece.phase) * lift * 0.45 - piece.vx * 1.1) * step
          piece.vz += (Math.cos(t * 1.9 + piece.phase) * lift * 0.45 - piece.vz * 1.1) * step
          piece.vy += (lift - Math.max(0, jar.gravity) - piece.vy * (0.35 + Math.abs(flutter) * 0.2)) * step
          piece.x += piece.vx * step
          piece.y += piece.vy * step
          piece.z += piece.vz * step
          // The floor catches falling paper; a later gust can lift it again.
          if (piece.y < -0.79) {
            piece.y = -0.79
            piece.vy = Math.max(0, -piece.vy * 0.08)
            piece.vx *= Math.exp(-step * 7)
            piece.vz *= Math.exp(-step * 7)
          }
          if (piece.y > 0.7) { piece.y = 0.7; piece.vy = -Math.abs(piece.vy) * 0.3 }
          const radius = piece.y > 0.2 ? 0.96 - (piece.y - 0.2) * 0.95 : 0.96 - Math.max(0, -piece.y - 0.45) * 0.6
          const radial = Math.hypot(piece.x, piece.z)
          if (radial > radius) {
            piece.x *= radius / radial
            piece.z *= radius / radial
            const outward = (piece.vx * piece.x + piece.vz * piece.z) / radius
            if (outward > 0) {
              piece.vx -= 1.3 * outward * piece.x / radius
              piece.vz -= 1.3 * outward * piece.z / radius
            }
          }
          if (piece.y > -0.78) {
            piece.rx += (flutter * 2 + lift) * step
            piece.ry += Math.cos(t * 4 + piece.phase) * step * 2
            piece.rz += piece.vy * step * 2
          } else {
            piece.rx += (Math.PI / 2 - piece.rx) * Math.min(1, step * 8)
            piece.ry *= Math.exp(-step * 8)
          }
        })
      }
      uniforms.uTime.value = time.current
      pieces.forEach((piece, index) => {
        dummy.position.set(piece.x, piece.y, piece.z)
        dummy.rotation.set(piece.rx, piece.ry, piece.rz)
        dummy.scale.set(piece.size, piece.size * 1.6, 1)
        dummy.updateMatrix()
        mesh.current.setMatrixAt(index, dummy.matrix)
      })
      mesh.current.instanceMatrix.needsUpdate = true
    })
    return <instancedMesh key={count} ref={mesh} args={[undefined, undefined, count]} frustumCulled={false}>
      <planeGeometry args={[1, 1]} />
      <shaderMaterial vertexShader={vertexShader} fragmentShader={fragmentShader} uniforms={uniforms} side={DoubleSide} vertexColors />
    </instancedMesh>
  }

  function WoodenStopper() {
    const texture = useMemo(() => {
      const canvas = document.createElement('canvas')
      canvas.width = 512
      canvas.height = 256
      const pen = canvas.getContext('2d')
      pen.fillStyle = '#bc8957'
      pen.fillRect(0, 0, 512, 256)
      for (let line = 0; line < 80; line++) {
        pen.beginPath()
        for (let x = 0; x <= 512; x += 4) {
          const y = line * 3.4 + Math.sin(x * 0.018 + line * 0.8) * 3
          if (x === 0) pen.moveTo(x, y)
          else pen.lineTo(x, y)
        }
        pen.strokeStyle = line % 3 === 0 ? '#81552b55' : '#efd0a34d'
        pen.lineWidth = line % 4 === 0 ? 1.8 : 0.7
        pen.stroke()
      }
      const result = new CanvasTexture(canvas)
      result.colorSpace = SRGBColorSpace
      return result
    }, [])
    useEffect(() => () => texture.dispose(), [texture])
    return <mesh position={[0, 0.99, 0]}>
      <cylinderGeometry args={[0.52, 0.47, 0.24, 64]} />
      <meshStandardMaterial map={texture} roughness={0.8} metalness={0} />
    </mesh>
  }

  function StudioLight() {
    const texture = useMemo(() => {
      const canvas = document.createElement('canvas')
      canvas.width = 1024
      canvas.height = 512
      const pen = canvas.getContext('2d')
      pen.fillStyle = '#b9afa0'
      pen.fillRect(0, 0, 1024, 512)
      const softbox = pen.createLinearGradient(0, 0, 0, 512)
      softbox.addColorStop(0, '#b7a994')
      softbox.addColorStop(0.4, '#ffffff')
      softbox.addColorStop(1, '#d3c1a7')
      pen.fillStyle = softbox
      pen.fillRect(180, 60, 90, 340)
      pen.fillRect(730, 100, 40, 300)
      pen.fillStyle = '#fff5e5'
      pen.fillRect(420, 20, 290, 45)
      const result = new CanvasTexture(canvas)
      result.mapping = EquirectangularReflectionMapping
      result.colorSpace = SRGBColorSpace
      return result
    }, [])
    useEffect(() => () => texture.dispose(), [texture])
    return <primitive object={texture} attach="environment" />
  }

  function Jar({ moving, burst }) {
    const group = useRef(null)
    const points = useMemo(() => {
      const curve = new SplineCurve([
        [0.78, -0.88], [0.97, -0.72], [1.12, -0.3],
        [1.13, 0.15], [0.94, 0.52], [0.59, 0.76], [0.54, 0.94],
      ].map(point => new Vector2(...point)))
      return [new Vector2(0, -0.88), ...curve.getPoints(48)]
    }, [])
    useFrame(({ pointer }) => {
      if (moving) group.current.rotation.y = pointer.x * 0.18
    })
    return <group ref={group} rotation={[0, -0.15, 0]}>
      <Coriandoli moving={moving} burst={burst} />
      <mesh><latheGeometry args={[points, 96]} />
        <meshPhysicalMaterial color="#fffaf0" transmission={1} thickness={jar.glass * 2} ior={1.48} roughness={0.015} metalness={0} side={DoubleSide} clearcoat={1} envMapIntensity={1.1} />
      </mesh>
      <WoodenStopper />
    </group>
  }

  export default function Scene() {
    const burst = useRef(8)
    const [paused, setPaused] = useState(false)
    const [visible, setVisible] = useState(true)
    const [reduced, setReduced] = useState(false)
    useEffect(() => {
      const media = matchMedia('(prefers-reduced-motion: reduce)')
      const update = () => setReduced(media.matches)
      update()
      media.addEventListener('change', update)
      const target = window.frameElement || document.documentElement
      const observer = new IntersectionObserver(entries => setVisible(entries[0].isIntersecting))
      observer.observe(target)
      return () => { observer.disconnect(); media.removeEventListener('change', update) }
    }, [])
    function blow() {
      burst.current = 12
      setPaused(false)
    }
    return <main>
      <div className="caption"><button onClick={() => setPaused(!paused)} aria-pressed={paused}>{paused ? 'Resume' : 'Pause'}</button></div>
      <div className="scene" role="button" tabIndex={0} aria-label="Blow confetti upward"
        onClick={blow} onKeyDown={event => {
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); blow() }
        }}>
        <Canvas camera={{ position: [1.5, 1.1, 5.8], fov: 36 }} dpr={[1, 1.5]} frameloop={visible && !paused && !reduced ? 'always' : 'demand'} fallback={<p>WebGL is needed to view the glass jar.</p>}>
          <color attach="background" args={['#f3eee6']} />
          <ambientLight intensity={1.6} />
          <directionalLight position={[3, 5, 4]} intensity={2.5} color="#fff4e2" />
          <pointLight position={[-3, 1, 2]} intensity={6} color="#ffd9a8" />
          <StudioLight />
          <Jar moving={!paused && !reduced} burst={burst} />
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.96, 0]}>
            <circleGeometry args={[1.2, 64]} /><meshBasicMaterial color="#a99b88" transparent opacity={0.16} />
          </mesh>
        </Canvas>
      </div>
      <footer><span>Click to blow confetti</span></footer>
    </main>
  }
  `,
  'styles.css': source`\
  * { box-sizing: border-box; }
  body { margin: 0; background: #f3eee6; color: #786b5c; font: 11px ui-monospace, monospace; }
  main { height: 360px; position: relative; }
  .scene { height: 100%; cursor: pointer; }
  .scene:focus-visible { outline: 2px solid #a27d55; outline-offset: -4px; }
  .caption, footer { position: absolute; left: 22px; right: 22px; display: flex; align-items: center; justify-content: space-between; gap: 12px; z-index: 1; pointer-events: none; }
  .caption { top: 18px; justify-content: flex-end; font-size: 9px; letter-spacing: 0.14em; }
  footer { bottom: 20px; justify-content: flex-end; font-size: 9px; }
  button { pointer-events: auto; color: #78634d; background: #ffffff55; border: 1px solid #cfc3b2; border-radius: 4px; padding: 6px 10px; font: inherit; cursor: pointer; }
  button:hover { background: #ffffffaa; }
  button:focus-visible { outline: 2px solid #a27d55; outline-offset: 3px; }
  @media (max-width: 480px) { main { height: 360px; } .caption, footer { left: 14px; right: 14px; } footer { font-size: 8px; } }
  `,
}
