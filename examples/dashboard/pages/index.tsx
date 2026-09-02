import { ArrowRight, CircleCheck, Clock3, FolderKanban } from 'lucide-react'
import { ProjectCard } from '../components/project-card'
import { Shell } from '../components/shell'
import { useProjects } from '../lib/projects'
import '../styles.css'

export default function Overview() {
  const projects = useProjects()
  const onTrack = projects.filter(project => project.status === 'On track').length
  const stats = [
    { icon: FolderKanban, label: 'Active projects', value: projects.length || '—' },
    { icon: CircleCheck, label: 'On track', value: projects.length ? onTrack : '—' },
    {
      icon: Clock3,
      label: 'Average progress',
      value: projects.length
        ? `${Math.round(projects.reduce((sum, project) => sum + project.progress, 0) / projects.length)}%`
        : '—',
    },
  ]

  return (
    <Shell page="/">
      <div className="flex flex-wrap items-end justify-between gap-5 border-b-2 border-stone-950 pb-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em]">Monday, September 2</p>
          <h1 className="mt-3 text-4xl font-black leading-none tracking-[-0.04em] sm:text-5xl">Good morning, Alex.</h1>
          <p className="mt-3 text-sm text-stone-700">Here is what your team is moving today.</p>
        </div>
        <a className="flex items-center gap-2 border-2 border-stone-950 bg-stone-950 px-4 py-3 text-xs font-bold uppercase tracking-wider text-white" href="/projects">
          View all projects <ArrowRight size={16} />
        </a>
      </div>

      <section className="mt-5 grid gap-3 sm:grid-cols-3">
        {stats.map(({ icon: Icon, label, value }) => (
          <article className="border-2 border-stone-950 bg-white p-4 shadow-[3px_3px_0_#1c1917]" key={label}>
            <div className="flex items-start justify-between">
              <p className="text-xs font-bold uppercase tracking-wider">{label}</p>
              <Icon size={18} />
            </div>
            <p className="mt-7 text-3xl font-black tracking-tight">{value}</p>
          </article>
        ))}
      </section>

      <section className="mt-8">
        <h2 className="text-xs font-black uppercase tracking-[0.16em]">Recent projects</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {projects.slice(0, 4).map(project => <ProjectCard key={project.id} project={project} />)}
        </div>
      </section>
    </Shell>
  )
}
