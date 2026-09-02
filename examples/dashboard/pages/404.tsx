import { Shell } from '../components/shell'
import '../styles.css'

export default function NotFound() {
  return (
    <Shell page="">
      <p className="text-sm font-medium text-lime-700">404</p>
      <h1 className="mt-2 text-4xl font-semibold tracking-tight">That page wandered off.</h1>
      <a className="mt-6 inline-block text-sm font-medium underline underline-offset-4" href="/">Return to overview</a>
    </Shell>
  )
}
