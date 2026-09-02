import { ProjectCard } from '../components/project-card'
import { Shell } from '../components/shell'
import { useProjects } from '../lib/projects'
import '../styles.css'

export default function Projects() {
  const projects = useProjects()
  return (
    <Shell page="/projects">
      <div className="border-b-2 border-stone-950 pb-6">
        <p className="text-xs font-bold uppercase tracking-[0.16em]">Portfolio</p>
        <h1 className="mt-3 text-5xl font-black leading-none tracking-[-0.04em]">Projects</h1>
        <p className="mt-3 text-sm text-stone-700">A live view loaded from a static Devjar API route.</p>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {projects.map(project => <ProjectCard key={project.id} project={project} />)}
      </div>
    </Shell>
  )
}
