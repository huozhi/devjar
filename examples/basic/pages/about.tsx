import { Cloud, FileCode2, Gauge, Route } from 'lucide-react'
import { Shell } from '../components/shell'
import '../styles.css'

export default function About() {
  const features = [
    [Route, 'Pages by convention', 'Folders and filenames become routes without a router configuration.'],
    [Cloud, 'Packages from CDN', 'Import browser-ready npm packages without creating a local dependency tree.'],
    [Gauge, 'Fast local transforms', 'Oxc compiles TypeScript and JSX in the local development server.'],
    [FileCode2, 'Just source files', 'Keep prototypes readable, portable, and easy to hand to another developer.'],
  ] as const

  return (
    <Shell page="about">
      <section className="max-w-3xl">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-300">Why Devjar</p>
        <h1 className="mt-4 text-5xl font-semibold tracking-tight text-white">A small place for ideas to become interfaces.</h1>
        <p className="mt-6 text-lg leading-8 text-slate-400">Devjar sits between a code snippet and a full framework—structured enough for multi-page prototypes, light enough to throw away.</p>
      </section>
      <section className="mt-12 grid gap-4 md:grid-cols-2">
        {features.map(([Icon, title, description]) => (
          <article key={title} className="group rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition hover:-translate-y-1 hover:border-cyan-300/20 hover:bg-white/[0.05]">
            <span className="inline-flex rounded-xl bg-violet-400/10 p-3 text-violet-300 transition group-hover:bg-cyan-300/10 group-hover:text-cyan-200"><Icon size={22} /></span>
            <h2 className="mt-5 text-lg font-semibold text-white">{title}</h2>
            <p className="mt-2 leading-7 text-slate-400">{description}</p>
          </article>
        ))}
      </section>
      <a href="/" className="mt-10 inline-flex text-sm font-semibold text-cyan-300 hover:text-cyan-200">← Back to dashboard</a>
    </Shell>
  )
}
