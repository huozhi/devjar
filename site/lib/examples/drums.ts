import { source } from '../demo-files'

export const drumFiles = {
  'pages/index.tsx': source`\
  import { useEffect, useRef, useState } from 'react'
  import { useDrumMachine } from '../lib/audio'
  import { tracks } from '../lib/patterns'
  import pocket from '../patterns/pocket'
  import '../styles.css'
  
  export default function DrumMachine() {
    const [pattern, setPattern] = useState(pocket)
    const [bpm, setBpm] = useState(112)
    const scope = useRef(null)
    useEffect(() => { setPattern(pocket) }, [pocket])
    const { playing, step, toggle, audition, error } = useDrumMachine({
      pattern, bpm, swing: 0, volume: 65, scope,
    })
  
    useEffect(() => {
      window.parent.postMessage({ type: 'devjar:playback', playing }, window.parent.location.origin)
    }, [playing])
    useEffect(() => {
      const control = event => {
        if (event.source === window.parent && event.data?.type === 'devjar:toggle-playback') toggle()
      }
      window.addEventListener('message', control)
      return () => window.removeEventListener('message', control)
    }, [toggle])

    function edit(row, column) {
      setPattern(current => current.map((notes, index) => index !== row ? notes
        : notes.map((note, beat) => beat === column ? 1 - note : note)))
    }
  
    return (
      <main className="room">
        <div className="machine">
          <header>
            <h1>pocket<span>/</span><small>01</small></h1>
            <div className="transport">
              <button className={'play ' + (playing ? 'running' : '')} onClick={toggle}
                aria-label={playing ? 'Stop playback' : 'Play beat'} aria-pressed={playing}>
                {playing ? '■ STOP' : '▶ PLAY'}
              </button>
              <label className="tempo"><span><output>{bpm}</output> BPM</span>
                <input aria-label="Tempo" type="range" min="60" max="180" value={bpm}
                  onChange={e => setBpm(Number(e.target.value))} />
              </label>
              <canvas ref={scope} width="360" height="64" aria-label="Audio waveform" />
            </div>
          </header>
          <div className="sequence-scroll" role="region" aria-label="16-step sequencer" tabIndex={0}>
            <div className="sequence">
              <div className="step-ruler"><span />
                {Array.from({ length: 16 }, (_, index) => <span key={index}
                  className={step === index ? 'current' : ''}>{String(index + 1).padStart(2, '0')}</span>)}
              </div>
              {tracks.map((track, row) => (
                <div className="track" key={track.name} style={{ '--track-color': track.color }}>
                  <button className="voice" onClick={() => audition(row)} aria-label={'Audition ' + track.name}>
                    <i />{track.name}
                  </button>
                  {pattern[row].map((note, column) => (
                    <button key={column} aria-label={track.name + ' step ' + (column + 1)} aria-pressed={!!note}
                      className={'pad' + (note ? ' active' : '') + (step === column ? ' current' : '')}
                      onClick={() => edit(row, column)}><span /></button>
                  ))}
                </div>
              ))}
            </div>
          </div>
          <footer><span>{error || 'Press play. Edit the pattern. Find your groove.'}</span><span>4 VOICES · 16 STEPS</span></footer>
        </div>
      </main>
    )
  }
  `,
  'patterns/pocket.ts': source`\
  // 1 = hit, 0 = rest. Each group is one beat.
  // Rows: kick, snare, hi-hat, clap.
  export default [
      [1,0,0,0, 0,0,1,0, 1,0,0,0, 0,0,0,0],
      [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
      [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,1],
      [0,0,0,0, 0,0,0,0, 0,0,0,0, 1,0,0,0],
  ]
  `,
  'lib/patterns.ts': source`\
  // Each row is one voice. Each number is a sixteenth note. 1 = hit, 0 = rest.
  export const tracks = [
    { name: 'Kick', color: '#f58a50' },
    { name: 'Snare', color: '#dabe83' },
    { name: 'Hi-hat', color: '#a8b5b0' },
    { name: 'Clap', color: '#a69ac5' },
  ]
  
  `,
  'lib/audio.ts': source`\
  import { useEffect, useRef, useState } from 'react'
  
  // Audio is scheduled ahead against the audio clock, never React render timing.
  function createInstrument() {
    const context = new AudioContext()
    const output = context.createGain()
    const analyser = context.createAnalyser()
    analyser.fftSize = 512
    output.connect(analyser)
    analyser.connect(context.destination)
    const sources = new Set()
    const noise = context.createBuffer(1, context.sampleRate, context.sampleRate)
    const data = noise.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  
    function tone(time, frequency, endFrequency, length, level) {
      const oscillator = context.createOscillator()
      const envelope = context.createGain()
      oscillator.frequency.setValueAtTime(frequency, time)
      oscillator.frequency.exponentialRampToValueAtTime(endFrequency, time + length)
      envelope.gain.setValueAtTime(level, time)
      envelope.gain.exponentialRampToValueAtTime(0.001, time + length)
      oscillator.connect(envelope)
      envelope.connect(output)
      sources.add(oscillator)
      oscillator.start(time)
      oscillator.stop(time + length)
      oscillator.onended = () => { sources.delete(oscillator); oscillator.disconnect(); envelope.disconnect() }
    }
  
    function hiss(time, frequency, length, level) {
      const source = context.createBufferSource()
      const filter = context.createBiquadFilter()
      const envelope = context.createGain()
      source.buffer = noise
      filter.type = 'highpass'
      filter.frequency.value = frequency
      envelope.gain.setValueAtTime(level, time)
      envelope.gain.exponentialRampToValueAtTime(0.001, time + length)
      source.connect(filter)
      filter.connect(envelope)
      envelope.connect(output)
      sources.add(source)
      source.start(time)
      source.stop(time + length)
      source.onended = () => { sources.delete(source); source.disconnect(); filter.disconnect(); envelope.disconnect() }
    }
  
    function hit(voice, time) {
      if (voice === 0) tone(time, 150, 42, 0.35, 0.8)
      if (voice === 1) { tone(time, 190, 85, 0.12, 0.22); hiss(time, 1100, 0.16, 0.4) }
      if (voice === 2) hiss(time, 7500, 0.055, 0.22)
      if (voice === 3) {
        for (let i = 0; i < 3; i++) hiss(time + i * 0.012, 1600, i === 2 ? 0.12 : 0.02, 0.25)
      }
    }
    function stop() {
      for (const source of sources) source.stop()
      sources.clear()
    }
    return { context, output, analyser, hit, stop }
  }
  
  export function useDrumMachine({ pattern, bpm, swing, volume, scope }) {
    const [playing, setPlaying] = useState(false)
    const [step, setStep] = useState(-1)
    const [error, setError] = useState('')
    const engine = useRef(null)
    const latest = useRef({ pattern, bpm, swing })
    const alive = useRef(true)
    const starting = useRef(false)
    useEffect(() => { latest.current = { pattern, bpm, swing } }, [pattern, bpm, swing])
    useEffect(() => {
      if (engine.current) engine.current.output.gain.setTargetAtTime(volume / 100 * 0.65, engine.current.context.currentTime, 0.01)
    }, [volume])
    useEffect(() => {
      alive.current = true
      return () => {
        alive.current = false
        // Fast Refresh immediately reconnects effects. Close only on unmount.
        queueMicrotask(() => {
          if (!alive.current) { engine.current?.context.close(); engine.current = null }
        })
      }
    }, [])
  
    async function ready() {
      if (!engine.current) engine.current = createInstrument()
      const instrument = engine.current
      await instrument.context.resume()
      instrument.output.gain.setValueAtTime(volume / 100 * 0.65, instrument.context.currentTime)
      return instrument
    }
  
    async function toggle() {
      if (playing) { setPlaying(false); return }
      if (starting.current) return
      starting.current = true
      try {
        await ready()
        if (alive.current) { setError(''); setPlaying(true) }
      } catch { if (alive.current) setError('Audio could not start. Try pressing play again.') }
      finally { starting.current = false }
    }
  
    async function audition(voice) {
      if (document.hidden) return
      try {
        const instrument = await ready()
        if (alive.current) instrument.hit(voice, instrument.context.currentTime)
      } catch { if (alive.current) setError('Audio could not start. Try pressing play again.') }
    }
  
    useEffect(() => {
      if (!playing) { setStep(-1); return }
      const instrument = engine.current
      instrument.output.gain.setValueAtTime(volume / 100 * 0.65, instrument.context.currentTime)
      let nextTime = instrument.context.currentTime + 0.04
      let nextStep = 0
      let frame, timer, visibilityVersion = 0
      let active = true
      const queue = []
      const samples = new Uint8Array(instrument.analyser.frequencyBinCount)
  
      function schedule() {
        const now = instrument.context.currentTime
        // Skip a backlog if the tab was backgrounded.
        if (nextTime < now) nextTime = now + 0.04
        while (nextTime < now + 0.1) {
          const settings = latest.current
          settings.pattern.forEach((notes, voice) => {
            if (notes[nextStep]) instrument.hit(voice, nextTime)
          })
          queue.push({ time: nextTime, step: nextStep })
          const sixteenth = 60 / settings.bpm / 4
          nextTime += sixteenth * (1 + (nextStep % 2 === 0 ? 1 : -1) * settings.swing / 100)
          nextStep = (nextStep + 1) % 16
        }
      }
      function draw() {
        while (queue.length && queue[0].time <= instrument.context.currentTime) setStep(queue.shift().step)
        const canvas = scope.current
        if (canvas) {
          const pen = canvas.getContext('2d')
          instrument.analyser.getByteTimeDomainData(samples)
          pen.clearRect(0, 0, canvas.width, canvas.height)
          pen.strokeStyle = '#f58a50'
          pen.lineWidth = 2
          pen.beginPath()
          samples.forEach((value, index) => {
            const x = index / (samples.length - 1) * canvas.width
            const y = value / 128 * canvas.height / 2
            if (index === 0) pen.moveTo(x, y)
            else pen.lineTo(x, y)
          })
          pen.stroke()
        }
        frame = requestAnimationFrame(draw)
      }
      async function visibilityChanged() {
        const version = ++visibilityVersion
        clearInterval(timer)
        cancelAnimationFrame(frame)
        try {
          if (document.hidden) {
            await instrument.context.suspend()
            return
          }
          await instrument.context.resume()
          if (!active || document.hidden || version !== visibilityVersion) return
          schedule()
          timer = setInterval(schedule, 25)
          frame = requestAnimationFrame(draw)
        } catch {
          if (active && version === visibilityVersion) {
            setError('Audio could not resume. Try pressing play again.')
            setPlaying(false)
          }
        }
      }
      document.addEventListener('visibilitychange', visibilityChanged)
      visibilityChanged()
      return () => {
        active = false
        document.removeEventListener('visibilitychange', visibilityChanged)
        clearInterval(timer)
        cancelAnimationFrame(frame)
        // Cancel queued notes so a quick restart cannot replay them.
        instrument.stop()
        if (instrument.context.state !== 'closed') instrument.output.gain.setTargetAtTime(0, instrument.context.currentTime, 0.008)
        scope.current?.getContext('2d')?.clearRect(0, 0, 360, 64)
      }
    }, [playing, scope])
  
    return { playing, step, toggle, audition, error }
  }
  `,
  'styles.css': source`\
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Arial, sans-serif; background: #e7e5df; color: #e9e6dc; }
  button, input { font: inherit; } button { cursor: pointer; }
  .room { max-width: 1000px; padding: 24px 18px; margin: auto; }
  .machine { background: #262725; border: 1px solid #353630; border-radius: 9px; padding: 20px; box-shadow: 0 3px 0 #141512, 0 8px 20px #191c171a; }
  header { display: flex; justify-content: space-between; align-items: center; gap: 20px; padding-bottom: 20px; }
  h1 { font-size: 30px; line-height: 1; letter-spacing: -.07em; margin: 0; }
  h1 > span { color: #f58a50; margin: 0 5px; font-weight: 400; } h1 small { font-size: 19px; font-weight: 400; }
  .transport { display: flex; gap: 18px; align-items: center; }
  .play { min-width: 70px; height: 34px; border: 0; border-radius: 4px; background: #f58a50; color: #222621; font: bold 10px monospace; box-shadow: 0 2px 0 #a8492e; }
  .play:hover { background: #ffa371; }.play.running { background: #dedbce; box-shadow: 0 2px 0 #8a8c7e; }
  .tempo { width: 108px; font: 8px monospace; color: #aaa99a; }.tempo span { display: block; } output { font-size: 15px; color: #eee9da; }
  input { accent-color: #f58a50; width: 100%; height: 10px; margin: 6px 0 0; cursor: pointer; }
  canvas { display: block; width: 90px; height: 32px; background: #1d211b; border: 1px solid #3a3e32; border-radius: 3px; }
  .sequence-scroll { overflow-x: auto; scrollbar-color: #656659 #262725; padding: 3px 0; }
  .sequence { min-width: 550px; }.step-ruler, .track { display: grid; grid-template-columns: 55px repeat(16, minmax(0, 1fr)); gap: 5px; }
  .step-ruler { margin-bottom: 8px; color: #86887a; font: 7px monospace; text-align: center; }.step-ruler .current { color: #ffc797; }
  .track { margin-bottom: 7px; }
  .voice { position: sticky; left: 0; z-index: 2; display: flex; align-items: center; gap: 6px; padding: 0; color: #dadbcb; border: 0; background: #262725; font-size: 9px; }
  .voice i { width: 2px; height: 16px; background: var(--track-color); }.voice:hover { color: var(--track-color); }
  .pad { position: relative; min-height: 32px; border: 1px solid #44473b; border-radius: 3px; background: #373a31; box-shadow: 0 2px 0 #181d16; padding: 0; }
  .pad:nth-child(8n + 6), .pad:nth-child(8n + 7), .pad:nth-child(8n + 8), .pad:nth-child(8n + 9) { background: #414237; }
  .pad span { position: absolute; width: 6px; height: 2px; background: #565b4a; top: 6px; left: calc(50% - 3px); }
  .pad.active { background: var(--track-color); border-color: var(--track-color); }.pad.active span { background: #ffffff80; }
  .pad:hover { filter: brightness(1.2); }.pad.current { outline: 1px solid #e9e9d2; outline-offset: 2px; }
  footer { display: flex; justify-content: space-between; gap: 12px; border-top: 1px solid #41423a; padding-top: 12px; margin-top: 10px; font-size: 9px; color: #aaa99a; } footer span:last-child { font: 7px monospace; white-space: nowrap; }
  button:focus-visible, input:focus-visible, .sequence-scroll:focus-visible { outline: 2px solid #ffd3a5; outline-offset: 3px; }
  @media (max-width: 600px) {
    .room { padding: 10px 8px; }.machine { padding: 12px 10px; } header { flex-wrap: wrap; gap: 12px; }
    .transport { flex: 1; justify-content: flex-end; gap: 12px; } canvas, footer span:last-child { display: none; }
    h1 { font-size: 26px; }.tempo { width: 90px; }.sequence-scroll { padding-bottom: 9px; }
  }
  `,
}

export function shuffleDrumPattern(currentCode: string) {
  const kick = Array.from({ length: 16 }, (_, step) => Number(step === 0 || Math.random() < (step % 4 === 0 ? 0.65 : 0.12)))
  const snare = Array.from({ length: 16 }, (_, step) => Number(step === 4 || step === 12 || (step === 15 && Math.random() < 0.25)))
  const hats = Array.from({ length: 16 }, (_, step) => Number(Math.random() < (step % 2 === 0 ? 0.9 : 0.3)))
  const clap = Array.from({ length: 16 }, (_, step) => Number((step === 4 || step === 12) && Math.random() < 0.6))
  const rows = [kick, snare, hats, clap]
  const print = () => '// 1 = hit, 0 = rest. Each group is one beat.\n'
    + '// Rows: kick, snare, hi-hat, clap.\nexport default [\n'
    + rows.map(row => '  [' + [0, 4, 8, 12].map(start => row.slice(start, start + 4).join(',')).join(', ') + '],').join('\n')
    + '\n]'
  if (print() === currentCode) hats[15] = 1 - hats[15]
  return print()
}
