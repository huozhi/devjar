export function Card({ title, children }: { title: string, children: React.ReactNode }) {
  return <section><h1>{title}</h1><p>{children}</p><a href="/about">About</a></section>
}
