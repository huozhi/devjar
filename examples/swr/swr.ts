// Refresh the checklist automatically. Try 2000 (milliseconds).
export const taskOptions = {
  refreshInterval: 0,
  revalidateOnFocus: false,
}

export const saveOptions = {
  // false: wait for the save before updating the checklist.
  optimistic: true,
  // Undo the change if a save fails.
  rollbackOnError: true,
}

// How many live messages to keep. Try 1 or 5.
export const activityLimit = 3
