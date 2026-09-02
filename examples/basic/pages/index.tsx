import { Shell } from '../components/shell'
import '../styles.css'

export default function Home() {
  const posts = [
    {
      title: 'Start with the smallest useful version',
      date: 'August 18, 2026',
      excerpt: 'A few notes on reducing an idea until the interesting part is easy to see.',
    },
    {
      title: 'Software made from ordinary files',
      date: 'August 7, 2026',
      excerpt: 'Why simple folders and readable conventions remain a good interface for tools.',
    },
    {
      title: 'The value of disposable prototypes',
      date: 'July 29, 2026',
      excerpt: 'The best prototype is often the one you are comfortable replacing tomorrow.',
    },
  ]

  return (
    <Shell page="home">
      <section className="border-2 border-neutral-950 bg-[#d9ff54] p-6 sm:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.16em]">Notes on software and small tools</p>
        <h1 className="mt-4 max-w-2xl text-4xl font-black leading-[0.95] tracking-[-0.04em] sm:text-6xl">Writing things down while building them.</h1>
        <p className="mt-5 max-w-xl text-base font-medium leading-7">A compact collection of observations from making software, prototypes, and tools for the web.</p>
      </section>

      <section className="mt-5 border-2 border-neutral-950 bg-white">
        {posts.map(post => (
          <article className="border-b-2 border-neutral-950 p-5 last:border-b-0 sm:grid sm:grid-cols-[8rem_1fr] sm:gap-6" key={post.title}>
            <p className="text-xs font-bold uppercase leading-5 tracking-wider">{post.date}</p>
            <div>
              <h2 className="text-xl font-black leading-tight tracking-tight"><a className="text-neutral-950" href="/about">{post.title}</a></h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-neutral-700">{post.excerpt}</p>
              <a href="/about" className="mt-3 inline-block text-xs font-bold uppercase tracking-wider text-neutral-950 underline decoration-2 underline-offset-4">Read note →</a>
            </div>
          </article>
        ))}
      </section>
    </Shell>
  )
}
