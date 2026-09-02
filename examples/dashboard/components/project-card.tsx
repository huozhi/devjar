import { ArrowUpRight } from 'lucide-react'
import type { Project } from '../lib/projects'

export function ProjectCard({ project }: { project: Project }) {
  return (
    <article className="border-2 border-stone-950 bg-white p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-stone-500">{project.owner}</p>
          <h2 className="mt-1 text-lg font-black tracking-tight">{project.name}</h2>
        </div>
        <ArrowUpRight className="text-stone-400" size={18} />
      </div>
      <div className="mt-5 h-3 border border-stone-950 bg-stone-100">
        <div className="h-full bg-[#b6e800]" style={{ width: `${project.progress}%` }} />
      </div>
      <div className="mt-2 flex justify-between text-xs font-bold uppercase tracking-wider">
        <span>{project.status}</span>
        <span>{project.progress}%</span>
      </div>
    </article>
  )
}
