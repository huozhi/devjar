import type { ReactNode } from 'react'
import { Box, Github, Sparkles } from 'lucide-react'

export function Shell({ page, children }: { page: 'home' | 'about', children: ReactNode }) {
  const link = (active: boolean) => `rounded-lg px-3 py-2 text-sm transition ${
    active ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-white'
  }`

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-cyan-300 selection:text-slate-950">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-40 -top-40 h-96 w-96 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="absolute -right-40 top-40 h-96 w-96 rounded-full bg-violet-500/10 blur-3xl" />
      </div>
      <header className="relative border-b border-white/10 bg-slate-950/70 backdrop-blur-xl">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <a href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="rounded-xl bg-gradient-to-br from-cyan-300 to-violet-400 p-2 text-slate-950"><Box size={18} /></span>
            Devjar
          </a>
          <div className="flex items-center gap-1">
            <a href="/" className={link(page === 'home')}>Dashboard</a>
            <a href="/about" className={link(page === 'about')}>About</a>
            <a href="https://github.com/huozhi/devjar" target="_blank" className="ml-2 rounded-lg p-2 text-slate-400 transition hover:bg-white/5 hover:text-white" aria-label="GitHub">
              <Github size={18} />
            </a>
          </div>
        </nav>
      </header>
      <main className="relative mx-auto max-w-6xl px-6 py-12">{children}</main>
      <footer className="relative mx-auto flex max-w-6xl items-center gap-2 px-6 pb-10 text-sm text-slate-500">
        <Sparkles size={15} /> Built from a folder, powered by the browser.
      </footer>
    </div>
  )
}
