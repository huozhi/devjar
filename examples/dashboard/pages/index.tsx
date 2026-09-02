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
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-lime-700">Monday, September 2</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight">Good morning, Alex.</h1>
          <p className="mt-3 text-stone-500">Here is what your team is moving today.</p>
        </div>
        <a className="flex items-center gap-2 rounded-xl bg-stone-900 px-4 py-3 text-sm font-medium text-white" href="/projects">
          View all projects <ArrowRight size={16} />
        </a>
      </div>

      <section className="mt-10 grid gap-4 sm:grid-cols-3">
        {stats.map(({ icon: Icon, label, value }) => (
          <article className="rounded-2xl border border-stone-200 bg-white p-5" key={label}>
            <Icon className="text-stone-400" size={20} />
            <p className="mt-6 text-sm text-stone-500">{label}</p>
            <p className="mt-1 text-3xl font-semibold">{value}</p>
          </article>
        ))}
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">Recent projects</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {projects.slice(0, 4).map(project => <ProjectCard key={project.id} project={project} />)}
        </div>
      </section>
    </Shell>
  )
}
