import { source } from '../demo-files'

export const jarFiles = {
  'jar.ts': source`\
  export const jar = {
    title: 'devjar',
    command: 'npx devjar dev',
    color: '#8aa9cf',
    speed: 0.35, // 0 to hold still.
    glass: 0.07, // Try 0.03 or 0.15.
  }
  `,
  'pages/index.tsx': source`\
  import { useEffect, useMemo, useRef, useState } from 'react'
  import { Canvas, useFrame } from '@react-three/fiber'
  import { CanvasTexture, DoubleSide, SRGBColorSpace, SplineCurve, Vector2 } from 'three'
  import { jar } from '../jar'
  import '../styles.css'

  function Terminal() {
    const texture = useMemo(() => {
      const canvas = document.createElement('canvas')
      canvas.width = 768
      canvas.height = 480
      const pen = canvas.getContext('2d')
      pen.fillStyle = '#111821'
      pen.fillRect(0, 0, 768, 480)
      pen.fillStyle = '#eef3fa'
      pen.font = 'bold 76px monospace'
      pen.fillText(jar.title.slice(0, 12), 54, 156)
      pen.font = '36px monospace'
      pen.fillStyle = jar.color
      pen.fillText('$ ' + jar.command.slice(0, 26), 54, 256)
      pen.fillRect(56, 326, 22, 38)
      const result = new CanvasTexture(canvas)
      result.colorSpace = SRGBColorSpace
      return result
    }, [jar.title, jar.command, jar.color])
    useEffect(() => () => texture.dispose(), [texture])
    return <group position={[0, -0.16, 0]}>
      <mesh><boxGeometry args={[1.68, 1.08, 0.07]} /><meshStandardMaterial color="#354254" metalness={0.7} roughness={0.25} /></mesh>
      <mesh position={[0, 0, 0.041]}><planeGeometry args={[1.6, 1]} /><meshBasicMaterial map={texture} toneMapped={false} /></mesh>
    </group>
  }

  function Jar({ moving }) {
    const group = useRef(null)
    const points = useMemo(() => {
      const curve = new SplineCurve([
        [0.78, -0.88], [0.97, -0.72], [1.12, -0.3],
        [1.13, 0.15], [0.94, 0.52], [0.59, 0.76], [0.54, 0.94],
      ].map(point => new Vector2(...point)))
      return [new Vector2(0, -0.88), ...curve.getPoints(48)]
    }, [])
    useFrame(({ clock, pointer }) => {
      const time = clock.getElapsedTime()
      group.current.rotation.y = moving ? Math.sin(time * jar.speed) * 0.3 + pointer.x * 0.18 : 0
      group.current.position.y = moving ? Math.sin(time * jar.speed * 2) * 0.04 : 0
    })
    return <group ref={group} rotation={[0, -0.15, 0]}>
      <Terminal />
      <mesh><latheGeometry args={[points, 96]} />
        <meshPhysicalMaterial color="#d9e6f5" transparent opacity={jar.glass} roughness={0.12} metalness={0.15} side={DoubleSide} depthWrite={false} clearcoat={1} />
      </mesh>
      <mesh position={[0, 0.94, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.54, 0.035, 12, 96]} />
        <meshStandardMaterial color="#b4c4d7" metalness={0.65} roughness={0.22} transparent opacity={0.7} />
      </mesh>
      <mesh position={[0, 0.94, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.54, 96]} />
        <meshPhysicalMaterial color="#d9e6f5" transparent opacity={jar.glass} roughness={0.12} side={DoubleSide} depthWrite={false} />
      </mesh>
      {[-0.88, 0.88].map(x => <mesh key={x} position={[x, 0, 0.48]}>
        <boxGeometry args={[0.018, 0.85, 0.01]} /><meshBasicMaterial color="#e0ebfa" transparent opacity={0.4} />
      </mesh>)}
    </group>
  }

  export default function Scene() {
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
    return <main>
      <div className="caption"><span>AN IDEA, BOTTLED.</span><button onClick={() => setPaused(!paused)} aria-pressed={paused}>{paused ? 'Resume' : 'Pause'}</button></div>
      <div className="scene" role="img" aria-label="A glass jar holding a devjar terminal">
        <Canvas camera={{ position: [1.5, 1.1, 5.8], fov: 36 }} dpr={[1, 1.5]} frameloop={visible && !paused && !reduced ? 'always' : 'demand'} fallback={<p>WebGL is needed to view the glass jar.</p>}>
          <color attach="background" args={['#151b24']} />
          <ambientLight intensity={1.6} />
          <directionalLight position={[3, 5, 4]} intensity={4} color="#e1eaff" />
          <pointLight position={[-3, 1, 2]} intensity={12} color={jar.color} />
          <Jar moving={!paused && !reduced} />
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.96, 0]}>
            <circleGeometry args={[1.2, 64]} /><meshBasicMaterial color="#0d121a" transparent opacity={0.25} />
          </mesh>
        </Canvas>
      </div>
      <footer><span>devjar / live in 3D</span><span>Move your pointer · edit the code</span></footer>
    </main>
  }
  `,
  'styles.css': source`\
  * { box-sizing: border-box; }
  body { margin: 0; background: #151b24; color: #a3b2c5; font: 11px ui-monospace, monospace; }
  main { height: 360px; position: relative; }
  .scene { height: 100%; }
  .caption, footer { position: absolute; left: 22px; right: 22px; display: flex; align-items: center; justify-content: space-between; gap: 12px; z-index: 1; pointer-events: none; }
  .caption { top: 18px; font-size: 9px; letter-spacing: 0.14em; }
  footer { bottom: 20px; font-size: 9px; }
  button { pointer-events: auto; color: #c7d3e3; background: #ffffff09; border: 1px solid #ffffff20; border-radius: 4px; padding: 6px 10px; font: inherit; cursor: pointer; }
  button:hover { background: #ffffff18; }
  button:focus-visible { outline: 2px solid #8aa9cf; outline-offset: 3px; }
  @media (max-width: 480px) { main { height: 360px; } .caption, footer { left: 14px; right: 14px; } footer { font-size: 8px; } }
  `,
}
