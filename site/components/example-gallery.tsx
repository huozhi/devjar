import { Codesandbox } from './codesandbox'
import { demoFiles, demoContentPresets, demoContentJson } from '../lib/demo-files'
import { drumFiles, shuffleDrumPattern } from '../lib/examples/drums'
import { shaderFiles, shuffleShaderColor } from '../lib/examples/shader'
import { jarFiles } from '../lib/examples/jar'
import './example-gallery.css'

const contentScroll = { intervalMs: undefined, file: 'content.json', values: demoContentPresets.map(demoContentJson), labels: ['Features', 'Getting started', 'Build & share'] }
const themeScroll = {
  intervalMs: 5000,
  file: 'vgpu.ts',
  values: [
    { speed: 0.35, scale: 2.4, warp: 1.2, hue: 0.15, bands: 3 },
    { speed: 0.25, scale: 1.8, warp: 0.7, hue: 0.55, bands: 5 },
    { speed: 0.45, scale: 3.0, warp: 1.5, hue: 0.85, bands: 2 },
  ].map(config => Object.entries(config).reduce(
    (code, [key, value]) => code.replace(new RegExp(`(${key}: )[\\d.]+`), `$1${value}`),
    shaderFiles['vgpu.ts'],
  )),
  labels: ['Warm', 'Cool', 'Violet'],
}

const shaderAction = { label: 'Shuffle color', generate: shuffleShaderColor, playback: false }

const examples = [
  { id: 'drums', files: drumFiles, focusFile: 'patterns/pocket.ts', label: 'Drum machine', editorAction: { label: 'Shuffle beat', generate: shuffleDrumPattern, playback: true } },
  { id: 'template', files: demoFiles, focusFile: 'content.json', label: 'CMS example', editorAction: undefined },
  { id: 'jar', files: jarFiles, focusFile: 'confetti.frag', label: 'Confetti shader · React Three Fiber', editorAction: undefined },
]
export function ExampleGallery() {
  return (
    <>
      <div id="shader" className="hero-playground scroll-demo">
        <div className="scroll-demo-content">
          <div className="demo-intro"><span>VPGU playground</span><span>Watch the code change live</span></div>
          <Codesandbox files={shaderFiles} focusFile="vgpu.ts" editorAction={shaderAction} scrollDemo={themeScroll} />
        </div>
      </div>
      <section className="example-gallery" aria-label="More live examples">
        <div className="examples-intro">
          <h2>Gallery</h2>
          <p>See the code change as you scroll. Make it your own in the editor.</p>
        </div>
        {examples.map((example, index) => (
          <section key={example.id} id={example.id} className={(index % 2 === 0 ? 'example-row example-row--editor-first' : 'example-row') + (example.id === 'template' ? ' scroll-demo' : '')} aria-label={example.label}>
            <div className={example.id === 'template' ? 'scroll-demo-content' : undefined}>
            <h3 className="example-row-heading">{example.label}</h3>
            <Codesandbox files={example.files} focusFile={example.focusFile} editorAction={example.editorAction} scrollDemo={example.id === 'template' ? contentScroll : undefined} />
            </div>
          </section>
        ))}
      </section>
    </>
  )
}
