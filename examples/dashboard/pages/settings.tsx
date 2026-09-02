import { useState } from 'react'
import { Shell } from '../components/shell'
import '../styles.css'

function Setting({
  label,
  description,
  checked,
  onChange,
}: {
  label: string
  description: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-6 border-b border-stone-100 p-5 last:border-0">
      <span>
        <span className="block font-medium">{label}</span>
        <span className="mt-1 block text-sm text-stone-500">{description}</span>
      </span>
      <input checked={checked} onChange={event => onChange(event.target.checked)} type="checkbox" />
    </label>
  )
}

export default function Settings() {
  const [weeklyDigest, setWeeklyDigest] = useState(true)
  const [compactView, setCompactView] = useState(false)

  return (
    <Shell page="/settings">
      <p className="text-sm font-medium text-lime-700">Workspace</p>
      <h1 className="mt-2 text-4xl font-semibold tracking-tight">Settings</h1>
      <div className="mt-8 max-w-2xl overflow-hidden rounded-2xl border border-stone-200 bg-white">
        <Setting
          checked={weeklyDigest}
          description="Receive a summary every Monday morning."
          label="Weekly digest"
          onChange={setWeeklyDigest}
        />
        <Setting
          checked={compactView}
          description="Fit more project information on screen."
          label="Compact view"
          onChange={setCompactView}
        />
      </div>
    </Shell>
  )
}
