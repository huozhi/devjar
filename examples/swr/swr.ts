import useSWR from 'swr'
import useSWRMutation from 'swr/mutation'
import useSWRSubscription from 'swr/subscription'

export function useTasks() {
  return useSWR('/tasks')
}

export function useTaskUpdate(saveTask) {
  const mutation = useSWRMutation('/tasks', saveTask)
  return {
    ...mutation,
    update: task => mutation.trigger(task, {
      optimisticData: tasks => tasks.map(
        item => item.id === task.id ? task : item
      ),
      rollbackOnError: true, // Try false, then reject a save.
      populateCache: true,
      revalidate: false,
    }),
  }
}

export function useActivity(connect) {
  return useSWRSubscription('/activity', (_, { next }) => {
    return connect(event => {
      next(null, previous =>
        [event, ...(previous || [])].slice(0, 3)
      )
    }) // connect returns the unsubscribe function.
  })
}
