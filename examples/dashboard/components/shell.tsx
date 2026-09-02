import type { ReactNode } from 'react'
import { FolderKanban, LayoutDashboard, Settings } from 'lucide-react'

const links = [
  { href: '/', label: 'Overview', icon: LayoutDashboard },
  { href: '/projects', label: 'Projects', icon: FolderKanban },
  { href: '/settings', label: 'Settings', icon: Settings },
]

export function Shell({ page, children }: { page: string, children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#efeee8] text-stone-950">
      <header className="border-b-2 border-stone-950 bg-[#d9ff54]">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
          <a className="flex items-center gap-3 font-black uppercase tracking-tight text-stone-950" href="/">
            <img alt="Northstar" className="size-7 border-2 border-stone-950" src="/mark.svg" />
            Northstar / Ops
          </a>
          <nav className="flex items-center gap-2">
            {links.map(({ href, label, icon: Icon }) => (
              <a
                className={`flex items-center gap-2 border-2 border-stone-950 px-2.5 py-2 text-xs font-bold uppercase tracking-wider ${page === href ? 'bg-stone-950 text-white' : 'bg-[#d9ff54] text-stone-950 hover:bg-white'}`}
                href={href}
                key={href}
              >
                <Icon size={16} />
                <span className="hidden sm:inline">{label}</span>
              </a>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-7 sm:px-6 sm:py-9">{children}</main>
    </div>
  )
}
