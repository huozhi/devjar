import { useEffect, useState } from 'react'

export type Project = {
  id: number
  name: string
  owner: string
  progress: number
  status: 'On track' | 'At risk' | 'Planning'
}

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([])

  useEffect(() => {
    fetch('/api/projects.json')
      .then(response => response.json())
      .then(setProjects)
  }, [])

  return projects
}
