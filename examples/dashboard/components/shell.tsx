import type { ReactNode } from 'react'
import { FolderKanban, LayoutDashboard, Settings } from 'lucide-react'

const links = [
  { href: '/', label: 'Overview', icon: LayoutDashboard },
  { href: '/projects', label: 'Projects', icon: FolderKanban },
  { href: '/settings', label: 'Settings', icon: Settings },
]

export function Shell({ page, children }: { page: string, children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f4f5f2] text-stone-950">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <a className="flex items-center gap-3 font-semibold" href="/">
            <img alt="Northstar" className="size-8" src="/mark.svg" />
            Northstar
          </a>
          <nav className="flex items-center gap-1">
            {links.map(({ href, label, icon: Icon }) => (
              <a
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${page === href ? 'bg-stone-900 text-white' : 'text-stone-500 hover:bg-stone-100 hover:text-stone-950'}`}
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
      <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>
    </div>
  )
}
