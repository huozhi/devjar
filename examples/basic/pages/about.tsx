import { Shell } from '../components/shell'
import '../styles.css'

export default function About() {
  return (
    <Shell page="about">
      <article className="border-2 border-neutral-950 bg-white p-6 sm:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.16em]">About this site</p>
        <h1 className="mt-4 max-w-2xl text-4xl font-black leading-none tracking-[-0.04em] sm:text-5xl">A simple place to publish notes.</h1>
        <div className="mt-7 max-w-2xl space-y-4 border-l-4 border-[#b6e800] pl-5 text-base leading-7 text-neutral-800">
          <p>Field Notes is a small example of a multi-page Devjar project. It uses ordinary TSX files, a shared component, and Tailwind utility classes.</p>
          <p>The source stays intentionally modest. There is enough structure to feel like a real website without turning the example into a framework demonstration.</p>
          <p>Devjar transforms the files locally and loads browser packages from a CDN, so the folder can remain small and portable.</p>
        </div>
        <a href="/" className="mt-8 inline-block border-2 border-neutral-950 bg-neutral-950 px-4 py-3 text-xs font-bold uppercase tracking-wider text-white">← Back to writing</a>
      </article>
    </Shell>
  )
}
