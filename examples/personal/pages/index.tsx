import content from '../content.json'
import { Layout } from '../components/layout'

export default function Home() {
  return (
    <Layout page="Home">
      <main>
        <header className="resume-header">
          <h1>{content.name}</h1>
          <p className="role">{content.role}</p>
          <div className="contact"><span>{content.location}</span><a href={`mailto:${content.email}`}>{content.email}</a></div>
          <p className="intro">{content.intro}</p>
        </header>
        <section aria-labelledby="experience-heading">
          <h2 id="experience-heading">Experience</h2>
          {content.experience.map(job => (
            <article className="resume-row" key={job.company}>
              <p className="period">{job.period}</p>
              <div><h3>{job.role}</h3><p className="company">{job.company}</p><p>{job.description}</p></div>
            </article>
          ))}
        </section>
        <section aria-labelledby="projects-heading">
          <h2 id="projects-heading">Selected projects</h2>
          {content.projects.map(project => (
            <article className="project" key={project.title}><h3>{project.title}</h3><p>{project.description}</p></article>
          ))}
        </section>
        <section aria-labelledby="education-heading"><h2 id="education-heading">Education</h2><p>{content.education}</p></section>
      </main>
    </Layout>
  )
}
