import type { ReactNode } from 'react'

export function Shell({ page, children }: { page: 'home' | 'about', children: ReactNode }) {
  const link = (active: boolean) => `text-sm ${
    active ? 'font-medium text-neutral-950' : 'text-neutral-500 hover:text-neutral-950'
  }`

  return (
    <div className="min-h-screen bg-stone-50 text-neutral-900">
      <header className="border-b border-neutral-200">
        <nav className="mx-auto flex max-w-3xl items-center justify-between px-6 py-6">
          <a href="/" className="font-serif text-xl font-semibold tracking-tight">Field Notes</a>
          <div className="flex items-center gap-6">
            <a href="/" className={link(page === 'home')}>Writing</a>
            <a href="/about" className={link(page === 'about')}>About</a>
          </div>
        </nav>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-16">{children}</main>
      <footer className="mx-auto max-w-3xl border-t border-neutral-200 px-6 py-8 text-sm text-neutral-500">
        A small blog built with Devjar.
      </footer>
    </div>
  )
}
