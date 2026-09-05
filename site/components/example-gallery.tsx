import { Codesandbox } from './codesandbox'
import { demoFiles } from '../lib/demo-files'
import { drumFiles, shuffleDrumPattern } from '../lib/examples/drums'
import { swrFiles } from '../lib/examples/swr'
import { shaderFiles, shuffleShaderColor } from '../lib/examples/shader'
import { jarFiles } from '../lib/examples/jar'
import './example-gallery.css'

const examples = [
  { id: 'drums', files: drumFiles, focusFile: 'patterns/pocket.ts', label: 'Drum machine', editorAction: { label: 'Shuffle beat', generate: shuffleDrumPattern, playback: true } },
  { id: 'shader', files: shaderFiles, focusFile: 'vgpu.ts', label: 'Shader playground', editorAction: { label: 'Shuffle color', generate: shuffleShaderColor, playback: false } },
  { id: 'swr', files: swrFiles, focusFile: 'swr.ts', label: 'SWR playground', editorAction: undefined },
  { id: 'jar', files: jarFiles, focusFile: 'confetti.ts', label: 'Confetti shader · React Three Fiber', editorAction: undefined },
]
export function ExampleGallery() {
  return (
    <>
      <Codesandbox files={demoFiles} focusFile={undefined} editorAction={undefined} />
      <section className="example-gallery" aria-label="More live examples">
        <div className="examples-intro">
          <h2>Gallery</h2>
          <p>Tweak the code, see what happens in the previews.</p>
        </div>
        {examples.map((example, index) => (
          <section key={example.id} id={example.id} className={index % 2 === 0 ? 'example-row example-row--editor-first' : 'example-row'} aria-label={example.label}>
            <h3 className="example-row-heading">{example.label}</h3>
            <Codesandbox files={example.files} focusFile={example.focusFile} editorAction={example.editorAction} />
          </section>
        ))}
      </section>
    </>
  )
}
