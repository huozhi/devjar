import { ArrowUpRight } from 'lucide-react'
import type { Project } from '../lib/projects'

export function ProjectCard({ project }: { project: Project }) {
  return (
    <article className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-stone-500">{project.owner}</p>
          <h2 className="mt-1 text-lg font-semibold">{project.name}</h2>
        </div>
        <ArrowUpRight className="text-stone-400" size={18} />
      </div>
      <div className="mt-6 h-2 overflow-hidden rounded-full bg-stone-100">
        <div className="h-full rounded-full bg-lime-500" style={{ width: `${project.progress}%` }} />
      </div>
      <div className="mt-3 flex justify-between text-sm">
        <span className="text-stone-500">{project.status}</span>
        <span className="font-medium">{project.progress}%</span>
      </div>
    </article>
  )
}
