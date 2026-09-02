import { Shell } from '../components/shell'
import '../styles.css'

export default function About() {
  return (
    <Shell page="about">
      <article className="max-w-2xl">
        <p className="text-sm text-neutral-500">About this site</p>
        <h1 className="mt-3 font-serif text-4xl font-semibold tracking-tight">A simple place to publish notes.</h1>
        <div className="mt-8 space-y-5 text-lg leading-8 text-neutral-700">
          <p>Field Notes is a small example of a multi-page Devjar project. It uses ordinary TSX files, a shared component, and Tailwind utility classes.</p>
          <p>The source stays intentionally modest. There is enough structure to feel like a real website without turning the example into a framework demonstration.</p>
          <p>Devjar transforms the files locally and loads browser packages from a CDN, so the folder can remain small and portable.</p>
        </div>
        <a href="/" className="mt-10 inline-block text-sm font-medium underline decoration-neutral-300 underline-offset-4 hover:decoration-neutral-700">← Back to writing</a>
      </article>
    </Shell>
  )
}
