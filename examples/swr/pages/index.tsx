import { useMemo, useState, useSyncExternalStore } from 'react'
import { SWRConfig } from 'swr'
import { useTasks, useTaskUpdate, useActivity } from '../hooks'
import { demo, observe, snapshot } from '../demo'
import '../styles.css'

function Progress() {
  const { data } = useTasks()
  const done = data?.filter(task => task.done).length || 0
  return <div className="progress">
    <strong>{data ? done + '/' + data.length : '…'} <span>complete</span></strong>
    <span className="caption">Shared SWR cache</span>
    <div className="meter"><i style={{ width: (data ? done / data.length * 100 : 0) + '%' }} /></div>
  </div>
}

function Tasks() {
  const { data, error } = useTasks()
  const { update, isMutating } = useTaskUpdate(demo.save)
  const [notice, setNotice] = useState('Click any task. The counter updates immediately.')
  async function save(task) {
    setNotice('Saving… the optimistic update is already visible.')
    try { await update({ ...task, done: !task.done }); setNotice('Saved. The server confirmed your change.') }
    catch { setNotice('Save rejected. Did the task roll back? Try changing rollbackOnError.') }
  }
  return <>
    <div className="tasks" aria-busy={!data}>
      {!data && <p>{error ? 'Could not load tasks.' : 'Loading tasks…'}</p>}
      {data?.map(task => <button className="task" key={task.id} role="checkbox" aria-checked={task.done} disabled={isMutating} onClick={() => save(task)}>
        <span className="check" aria-hidden="true">{task.done ? '✓' : ''}</span><span>{task.title}</span>
      </button>)}
    </div>
    <p className="notice" role="status">{notice}</p>
  </>
}

function ActivityFeed() {
  const { data } = useActivity(demo.connect)
  return <>
    <p className="live-badge"><span aria-hidden="true">●</span><span className="latest" key={data?.[0]?.id}>{data?.[0]?.text || 'Connecting…'}</span></p>
    <div className="events">{data?.slice(1).map(event => <div className="event" key={event.id}><span>{event.text}</span><time>{event.time}</time></div>)}</div>
  </>
}
function Dashboard() {
  const state = useSyncExternalStore(observe, snapshot, snapshot)
  const [live, setLive] = useState(true)
  return <main>
    <header><h2>Launch checklist</h2><span className={state.pending ? 'saving' : 'saved'}>{state.pending ? 'Saving…' : 'Ready'}</span></header>
    <section aria-labelledby="optimistic-title">
      <h3 className="feature-title" id="optimistic-title">Optimistic updates</h3>
      <Progress />
      <Tasks />
    </section>
    <div className="save-controls"><h3>Real-time subscription</h3><div className="stream-controls"><button className="send-event" aria-label="Send event" title="Send event" disabled={!live || state.paused} onClick={demo.send}>
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 3h12a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H8l-5 3V4a1 1 0 0 1 1-1Z" /><path d="M6 7h8M6 10h5" /></svg>
      </button><button className="stream-playback" aria-label={state.paused ? 'Play activity' : 'Pause activity'} aria-pressed={!state.paused} onClick={demo.togglePlayback}>
      <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">{state.paused ? <path d="M3 1.5 10 6 3 10.5Z" /> : <path d="M2 1h3v10H2zM7 1h3v10H7z" />}</svg>
      {state.paused ? 'Play' : 'Pause'}
    </button>
      <button className="stream-connection" role="switch" aria-label="Message subscription" aria-checked={live} title={live ? 'Turn off subscription' : 'Turn on subscription'} onClick={() => setLive(!live)}>
        <svg width="22" height="14" viewBox="0 0 22 14" fill="none" aria-hidden="true">
          <rect x="1" y="1" width="20" height="12" rx="3" stroke="currentColor" strokeWidth="1.5" />
          <circle cx={live ? 16 : 6} cy="7" r="3" fill="currentColor" />
        </svg>
      </button>
    </div></div>
    <section className="activity" data-connected={live} aria-labelledby="subscription-title">
      <div className="activity-heading"><h3 id="subscription-title">Messages</h3></div>
      {live ? <ActivityFeed /> : <p className="disconnected">Activity is disconnected.</p>}
    </section>
    <p className="hint">Local simulated activity stream.</p>
  </main>
}
export default function App() {
  const config = useMemo(() => ({ provider: () => new Map(), fetcher: demo.read, revalidateOnFocus: false }), [])
  return <SWRConfig value={config}><Dashboard /></SWRConfig>
}
