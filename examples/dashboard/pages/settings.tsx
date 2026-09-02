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
    <label className="flex cursor-pointer items-center justify-between gap-6 border-b-2 border-stone-950 p-4 last:border-0">
      <span>
        <span className="block font-black">{label}</span>
        <span className="mt-1 block text-sm text-stone-600">{description}</span>
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
      <div className="border-b-2 border-stone-950 pb-6">
        <p className="text-xs font-bold uppercase tracking-[0.16em]">Workspace</p>
        <h1 className="mt-3 text-5xl font-black leading-none tracking-[-0.04em]">Settings</h1>
      </div>
      <div className="mt-5 max-w-2xl border-2 border-stone-950 bg-white">
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
