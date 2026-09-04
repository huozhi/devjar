// Local demo transport. No network service or credentials required.
let tasks = [
  { id: 1, title: 'Ship the new homepage', done: false },
  { id: 2, title: 'Polish mobile navigation', done: true },
  { id: 3, title: 'Check keyboard shortcuts', done: false },
]
let state = { failNext: false, paused: false, connections: 0, reads: 0, pending: false }
const listeners = new Set()
const streams = new Set()
let sequence = 0
const messages = ['Maya is reviewing the homepage', 'Leo is testing mobile navigation', 'Ari is checking keyboard shortcuts']
const publish = patch => { state = { ...state, ...patch }; listeners.forEach(fn => fn()) }
const emit = text => {
  if (state.paused) return
  const event = { id: ++sequence, text, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) }
  streams.forEach(fn => fn(event))
}
export const observe = fn => { listeners.add(fn); return () => listeners.delete(fn) }
export const snapshot = () => state
export const demo = {
  read: async () => {
    publish({ reads: state.reads + 1 })
    await new Promise(resolve => setTimeout(resolve, 700))
    return structuredClone(tasks)
  },
  save: async (_, { arg }) => {
    const fail = state.failNext
    publish({ failNext: false, pending: true })
    try {
      await new Promise(resolve => setTimeout(resolve, 1100))
      if (fail) { emit('Your save was rejected'); throw new Error('Save rejected') }
      tasks = tasks.map(task => task.id === arg.id ? { ...arg } : task)
      emit(arg.done ? 'You completed a task' : 'You reopened a task')
      return structuredClone(tasks)
    } finally { publish({ pending: false }) }
  },
  connect: receive => {
    streams.add(receive)
    publish({ connections: streams.size })
    receive({ id: ++sequence, text: 'Live activity connected', time: 'now' })
    const interval = setInterval(() => emit(messages[sequence % messages.length]), 4000)
    return () => {
      clearInterval(interval)
      streams.delete(receive)
      publish({ connections: streams.size })
    }
  },
  send: () => emit(messages[sequence % messages.length]),
  togglePlayback: () => publish({ paused: !state.paused }),
  fail: () => publish({ failNext: !state.failNext }),
}
