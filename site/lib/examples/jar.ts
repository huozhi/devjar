import { source } from '../demo-files'

export const jarFiles = {
  'jar.json': source`\
  {
    "throw": 3.2,
    "gravity": 9,
    "glass": 0.22
  }
  `,
  'cards.json': source`\
  [
    { "design": "code", "color": "#eee2ca", "width": 0.54, "height": 0.76, "x": -0.24, "z": -0.12, "tilt": 0.18 },
    { "design": "lines", "color": "#f3e8d4", "width": 0.58, "height": 0.84, "x": 0.32, "z": -0.08, "tilt": -0.16 },
    { "design": "dots", "color": "#f4ead8", "width": 0.46, "height": 0.52, "x": -0.43, "z": 0.27, "tilt": 0.12 },
    { "design": "line", "color": "#272b28", "width": 0.34, "height": 0.56, "x": 0.12, "z": 0.32, "tilt": -0.06 }
  ]
  `,
  'pages/index.tsx': source`\
  import { useEffect, useMemo, useRef, useState } from 'react'
  import { Canvas, useFrame } from '@react-three/fiber'
  import { CanvasTexture, DoubleSide, Euler, Quaternion, Vector3, EquirectangularReflectionMapping, SRGBColorSpace, SplineCurve, Vector2 } from 'three'
  import jar from '../jar.json'
  import cards from '../cards.json'
  import '../styles.css'

  function cardTexture(card) {
    const canvas = document.createElement('canvas')
    canvas.width = 256
    canvas.height = Math.round(256 * card.height / card.width)
    const pen = canvas.getContext('2d')
    const { width, height } = canvas
    pen.fillStyle = card.color
    pen.fillRect(0, 0, width, height)
    // A little paper grain, without downloading an image.
    for (let i = 0; i < 6000; i++) {
      pen.fillStyle = i % 2 ? '#ffffff0b' : '#30271909'
      pen.fillRect((i * 73.31) % width, (i * 37.17) % height, 1, 2)
    }
    pen.strokeStyle = '#8c7c5a44'
    pen.lineWidth = 3
    pen.strokeRect(2, 2, width - 4, height - 4)
    pen.fillStyle = '#282c28'
    if (card.design === 'code') {
      pen.font = '76px monospace'
      pen.textAlign = 'center'
      pen.fillText('</>', width / 2, height * 0.4)
    } else if (card.design === 'lines') {
      pen.fillStyle = '#9c95866b'
      for (let i = 0; i < 5; i++) pen.fillRect(35, 65 + i * 31, i === 4 ? 102 : 178, 7)
    } else if (card.design === 'dots') {
      for (let y = 45; y < height - 25; y += 28) {
        for (let x = 39; x < width - 25; x += 28) {
          pen.beginPath(); pen.arc(x, y, 2.4, 0, Math.PI * 2); pen.fill()
        }
      }
    } else {
      pen.fillStyle = '#a5d4dd'
      pen.fillRect(width / 2 - 2, height * 0.22, 3, height * 0.57)
    }
    const texture = new CanvasTexture(canvas)
    texture.colorSpace = SRGBColorSpace
    return texture
  }

  function Cards({ moving, burst }) {
    const group = useRef(null)
    const lastBurst = useRef(burst.current)
    const textures = useMemo(() => cards.map(cardTexture), [cards])
    useEffect(() => () => textures.forEach(texture => texture.dispose()), [textures])
    const pieces = useMemo(() => cards.map((card, index) => ({
      ...card, base: -0.81 + index * 0.004,
      y: -0.81 + index * 0.004 + Math.cos(card.tilt) * card.height / 2 + Math.abs(Math.sin(card.tilt)) * card.width / 2,
      vx: 0, vy: 0, vz: 0, spin: 0,
      rotation: new Quaternion().setFromEuler(new Euler(0, 0, card.tilt)),
      landing: null, tossed: false, phase: index * 2.4,
    })), [cards])
    const vectors = useMemo(() => ({ x: new Vector3(), y: new Vector3(), normal: new Vector3(), up: new Vector3(), turn: new Quaternion(), euler: new Euler() }), [])
    function halfHeight(piece) {
      vectors.x.set(1, 0, 0).applyQuaternion(piece.rotation)
      vectors.y.set(0, 1, 0).applyQuaternion(piece.rotation)
      return Math.abs(vectors.x.y) * piece.width / 2 + Math.abs(vectors.y.y) * piece.height / 2
    }
    useFrame((_, delta) => {
      const dt = moving ? Math.min(delta, 0.04) : 0
      if (lastBurst.current !== burst.current) {
        lastBurst.current = burst.current
        pieces.forEach((piece, index) => {
          piece.vy = Math.max(0, Number(jar.throw) || 0) * (0.85 + index * 0.06)
          piece.vx = Math.cos(piece.phase + burst.current) * 0.65
          piece.vz = Math.sin(piece.phase + burst.current) * 0.4
          piece.spin = (index % 2 ? -1 : 1) * 1.5
          piece.landing = null
          piece.tossed = true
        })
      }
      pieces.forEach((piece, index) => {
        piece.vy -= Math.max(0.1, Number(jar.gravity) || 9) * dt
        piece.x += piece.vx * dt
        piece.y += piece.vy * dt
        piece.z += piece.vz * dt
        if (!piece.landing) {
          vectors.euler.set(piece.spin * dt * 0.35, piece.spin * dt, piece.spin * dt * 0.45)
          piece.rotation.multiply(vectors.turn.setFromEuler(vectors.euler))
        }
        // Collision height follows the card's actual orientation.
        const extent = halfHeight(piece)
        const ceiling = 0.64 - extent
        if (piece.y > ceiling) { piece.y = ceiling; piece.vy = -Math.abs(piece.vy) * 0.15 }
        const radius = 0.8 - piece.width / 2
        const distance = Math.hypot(piece.x, piece.z)
        if (distance > radius) {
          piece.x *= radius / distance; piece.z *= radius / distance
          piece.vx *= -0.3; piece.vz *= -0.3
        }
        const floor = piece.base + extent
        if (piece.y <= floor) {
          piece.y = floor
          piece.vy = Math.abs(piece.vy) > 0.5 ? -piece.vy * 0.08 : 0
          piece.vx *= Math.exp(-dt * 8)
          piece.vz *= Math.exp(-dt * 8)
          if (piece.tossed) {
            // Tip onto the nearest face; never unwind Euler angles to the starting pose.
            if (!piece.landing) {
              vectors.normal.set(0, 0, 1).applyQuaternion(piece.rotation)
              vectors.up.set(0, vectors.normal.y < 0 ? -1 : 1, 0)
              piece.landing = new Quaternion().setFromUnitVectors(vectors.normal, vectors.up).multiply(piece.rotation)
              piece.spin = 0
            }
            piece.rotation.slerp(piece.landing, 1 - Math.exp(-dt * 6))
            piece.y = piece.base + halfHeight(piece)
          }
        }
        const mesh = group.current.children[index]
        mesh.position.set(piece.x, piece.y, piece.z)
        mesh.quaternion.copy(piece.rotation)
      })
    })
    return <group ref={group}>
      {pieces.map((card, index) => <mesh key={index}>
        <planeGeometry args={[card.width, card.height]} />
        <meshStandardMaterial map={textures[index]} roughness={0.95} side={DoubleSide} />
      </mesh>)}
    </group>
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
        [0.78, -0.88], [0.96, -0.78], [0.99, -0.3],
        [0.99, 0.22], [0.91, 0.55], [0.59, 0.76], [0.54, 0.94],
      ].map(point => new Vector2(...point)))
      return [new Vector2(0, -0.88), ...curve.getPoints(48)]
    }, [])
    useFrame(({ pointer }) => {
      if (moving) group.current.rotation.y = pointer.x * 0.18
    })
    return <group ref={group} rotation={[0, -0.15, 0]}>
      <Cards moving={moving} burst={burst} />
      <mesh><latheGeometry args={[points, 96]} />
        <meshPhysicalMaterial color="#c5cdc8" transparent opacity={jar.glass} depthWrite={false} roughness={0.03} metalness={0.15} clearcoat={1} envMapIntensity={1} />
      </mesh>
      <mesh position={[0, -0.8, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.89, 0.035, 12, 96]} />
        <meshPhysicalMaterial color="#e8e4d8" transparent opacity={0.45} roughness={0.05} metalness={0.25} />
      </mesh>
      <mesh position={[0, 0.86, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.55, 0.025, 12, 64]} />
        <meshPhysicalMaterial color="#e8e4d8" transparent opacity={0.5} roughness={0.05} metalness={0.25} />
      </mesh>
      <WoodenStopper />
    </group>
  }

  export default function Scene() {
    const burst = useRef(0)
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
    function toss() {
      burst.current += 1
    }
    return <main>
      <div className="scene" role="button" tabIndex={0} aria-label="Toss the cards"
        onClick={toss} onKeyDown={event => {
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toss() }
        }}>
        <Canvas camera={{ position: [0.55, 0.65, 4.6], fov: 36 }} dpr={[1, 1.5]} frameloop={visible && !reduced ? 'always' : 'demand'} fallback={<p>WebGL is needed to view the glass jar.</p>}>
          <color attach="background" args={['#f3eee6']} />
          <ambientLight intensity={0.9} />
          <directionalLight position={[3, 5, 4]} intensity={1.8} color="#fff4e2" />
          <pointLight position={[-3, 1, 2]} intensity={3} color="#ffd9a8" />
          <StudioLight />
          <Jar moving={!reduced} burst={burst} />
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.96, 0]}>
            <circleGeometry args={[1.2, 64]} /><meshBasicMaterial color="#a99b88" transparent opacity={0.16} />
          </mesh>
        </Canvas>
      </div>
      <footer><span>Click to toss the cards</span></footer>
    </main>
  }
  `,
  'styles.css': source`\
  * { box-sizing: border-box; }
  body { margin: 0; background: #f3eee6; color: #786b5c; font: 11px ui-monospace, monospace; }
  main { height: 360px; position: relative; }
  .scene { height: 100%; cursor: pointer; }
  .scene:focus-visible { outline: 2px solid #a27d55; outline-offset: -4px; }
  footer { position: absolute; left: 22px; right: 22px; display: flex; align-items: center; justify-content: space-between; gap: 12px; z-index: 1; pointer-events: none; }
  footer { bottom: 20px; justify-content: flex-end; font-size: 9px; }
  @media (max-width: 480px) { main { height: 360px; } footer { left: 14px; right: 14px; } footer { font-size: 8px; } }
  `,
}
