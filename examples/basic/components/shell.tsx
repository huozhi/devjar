import type { ReactNode } from 'react'

export function Shell({ page, children }: { page: 'home' | 'about', children: ReactNode }) {
  const link = (active: boolean) => `border-2 border-neutral-950 px-3 py-2 text-xs font-bold uppercase tracking-wider ${
    active ? 'bg-neutral-950 text-white' : 'bg-white text-neutral-950 hover:bg-[#d9ff54]'
  }`

  return (
    <div className="min-h-screen bg-[#f1efe7] text-neutral-950">
      <header>
        <nav className="mx-auto flex max-w-4xl items-center justify-between px-4 pt-6 sm:px-6">
          <a href="/" className="text-lg font-black uppercase tracking-tight text-neutral-950">Field / Notes</a>
          <div className="flex items-center gap-2">
            <a href="/" className={link(page === 'home')}>Writing</a>
            <a href="/about" className={link(page === 'about')}>About</a>
          </div>
        </nav>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">{children}</main>
      <footer className="mx-auto max-w-4xl px-4 pb-8 sm:px-6">
        <div className="border-t-2 border-neutral-950 pt-4 text-xs font-bold uppercase tracking-wider">
          A small blog built with Devjar.
        </div>
      </footer>
    </div>
  )
}
