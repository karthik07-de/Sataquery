import { useState } from 'react'

export default function Toggle({ defaultOn = true, onChange }) {
  const [on, setOn] = useState(defaultOn)
  function handle() {
    const next = !on
    setOn(next)
    onChange?.(next)
  }
  return (
    <div
      role="switch"
      aria-checked={on}
      tabIndex={0}
      onClick={handle}
      onKeyDown={e => e.key === ' ' && handle()}
      className={`toggle-track${on ? '' : ' off'}`}
    >
      <div className="toggle-thumb" />
    </div>
  )
}
