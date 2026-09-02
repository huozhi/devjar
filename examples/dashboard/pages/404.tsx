import { Shell } from '../components/shell'
import '../styles.css'

export default function NotFound() {
  return (
    <Shell page="">
      <div className="max-w-2xl border-2 border-stone-950 bg-white p-7 shadow-[5px_5px_0_#1c1917]">
        <p className="text-xs font-black uppercase tracking-[0.16em]">Error / 404</p>
        <h1 className="mt-4 text-4xl font-black leading-none tracking-[-0.04em]">That page wandered off.</h1>
        <a className="mt-7 inline-block border-2 border-stone-950 bg-stone-950 px-4 py-3 text-xs font-bold uppercase tracking-wider text-white" href="/">Return to overview</a>
      </div>
    </Shell>
  )
}
