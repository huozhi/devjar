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
      <section className="max-w-2xl">
        <p className="text-sm text-neutral-500">Notes on software and small tools</p>
        <h1 className="mt-3 font-serif text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">Writing things down while building them.</h1>
        <p className="mt-5 text-lg leading-8 text-neutral-600">A quiet collection of observations from making software, prototypes, and tools for the web.</p>
      </section>

      <section className="mt-14 divide-y divide-neutral-200 border-y border-neutral-200">
        {posts.map(post => (
          <article className="py-8" key={post.title}>
            <p className="text-sm text-neutral-500">{post.date}</p>
            <h2 className="mt-2 font-serif text-2xl font-semibold tracking-tight"><a href="/about" className="hover:text-neutral-600">{post.title}</a></h2>
            <p className="mt-3 max-w-2xl leading-7 text-neutral-600">{post.excerpt}</p>
            <a href="/about" className="mt-4 inline-block text-sm font-medium underline decoration-neutral-300 underline-offset-4 hover:decoration-neutral-700">Read note</a>
          </article>
        ))}
      </section>
    </Shell>
  )
}
