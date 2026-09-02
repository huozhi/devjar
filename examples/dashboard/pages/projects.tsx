import { ProjectCard } from '../components/project-card'
import { Shell } from '../components/shell'
import { useProjects } from '../lib/projects'
import '../styles.css'

export default function Projects() {
  const projects = useProjects()
  return (
    <Shell page="/projects">
      <p className="text-sm font-medium text-lime-700">Portfolio</p>
      <h1 className="mt-2 text-4xl font-semibold tracking-tight">Projects</h1>
      <p className="mt-3 text-stone-500">A live view loaded from a static Devjar API route.</p>
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {projects.map(project => <ProjectCard key={project.id} project={project} />)}
      </div>
    </Shell>
  )
}
