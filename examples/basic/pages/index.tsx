import { Activity, Clock3, Layers3 } from 'lucide-react'
import { Card } from '../components/card'
import { Shell } from '../components/shell'
import '../styles.css'

export default function Home() {
  return (
    <Shell page="home">
      <section className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <span className="inline-flex items-center rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-medium text-cyan-200">Prototype environment online</span>
          <h1 className="mt-5 text-5xl font-semibold tracking-tight text-white sm:text-6xl">
            Ship the idea,<br /><span className="bg-gradient-to-r from-cyan-300 to-violet-400 bg-clip-text text-transparent">skip the setup.</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-8 text-slate-400">File-based pages, instant updates, and CDN dependencies in one tiny development server.</p>
        </div>
        <a href="/about" className="inline-flex items-center justify-center rounded-xl bg-white px-5 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-white/10 transition hover:-translate-y-0.5 hover:bg-cyan-100">Explore the runtime →</a>
      </section>

      <section className="mt-12 grid gap-4 md:grid-cols-3">
        <Card icon={Activity} label="Refresh latency" value="42 ms" detail="↓ 18% from last session" />
        <Card icon={Layers3} label="Loaded modules" value="12" detail="All packages from CDN" />
        <Card icon={Clock3} label="Setup time" value="0 min" detail="No node_modules required" />
      </section>

      <section className="mt-6 grid gap-6 rounded-2xl border border-white/10 bg-white/[0.03] p-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div>
          <p className="text-sm font-medium text-slate-400">Recent activity</p>
          <div className="mt-5 space-y-4">
            {['pages/index.tsx rendered', 'lucide-react resolved from CDN', 'styles.css updated'].map((item, index) => (
              <div className="flex items-center gap-3" key={item}>
                <span className={`h-2 w-2 rounded-full ${index === 0 ? 'bg-emerald-300' : 'bg-slate-600'}`} />
                <span className="text-sm text-slate-300">{item}</span>
                <span className="ml-auto text-xs text-slate-600">{index === 0 ? 'now' : `${index * 4}m`}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-white/10 bg-slate-950 p-5 font-mono text-sm text-slate-400">
          <p><span className="text-violet-300">$</span> npx devjar</p>
          <p className="mt-3 text-emerald-300">✓ Ready on localhost:3000</p>
          <p className="mt-1 text-slate-600">Watching pages and components…</p>
        </div>
      </section>
    </Shell>
  )
}
