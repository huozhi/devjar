import useSWR from 'swr'
import useSWRMutation from 'swr/mutation'
import useSWRSubscription from 'swr/subscription'
import { taskOptions, saveOptions, activityLimit } from './swr'

export function useTasks() {
  return useSWR('/tasks', taskOptions)
}

export function useTaskUpdate(saveTask) {
  const mutation = useSWRMutation('/tasks', saveTask)
  return {
    ...mutation,
    update: task => mutation.trigger(task, {
      optimisticData: saveOptions.optimistic ? tasks => tasks.map(
        item => item.id === task.id ? task : item
      ) : undefined,
      rollbackOnError: saveOptions.rollbackOnError,
      populateCache: true,
      revalidate: false,
    }),
  }
}

export function useActivity(connect) {
  return useSWRSubscription('/activity', (_, { next }) => {
    return connect(event => {
      next(null, previous =>
        [event, ...(previous || [])].slice(0, activityLimit)
      )
    }) // connect returns the unsubscribe function.
  })
}
