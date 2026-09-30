import { useEffect, useState } from 'react'

const STEPS = [
  'Query understood',
  'Image validated',
  'Image preprocessing',
  'AI model analyzing',
  'Detection / segmentation',
  'Geospatial processing',
  'Generating result',
]

export default function ProcessingSteps({ running = false, onComplete }) {
  const [current, setCurrent] = useState(-1)

  useEffect(() => {
    if (!running) return
    let i = 0
    const id = setInterval(() => {
      setCurrent(i)
      i++
      if (i >= STEPS.length) {
        clearInterval(id)
        onComplete?.()
      }
    }, 900)
    return () => clearInterval(id)
  }, [running, onComplete])

  if (!running && current === -1) return null

  return (
    <div className="flex flex-col gap-2 p-4 bg-[#111318] border border-white/10 rounded-xl animate-fade-in-up">
      <div className="font-mono text-[10px] text-[#c2c6d6]/60 uppercase tracking-widest mb-1">
        Processing…
      </div>
      {STEPS.map((step, i) => {
        const done    = i < current
        const active  = i === current
        return (
          <div key={step} className="flex items-center gap-3">
            <div className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 ${
              done    ? 'bg-[#4edea3]/20 border border-[#4edea3]' :
              active  ? 'bg-[#adc6ff]/20 border border-[#adc6ff]' :
              'bg-white/5 border border-white/10'
            }`}>
              {done   && <span className="material-symbols-outlined text-[10px] text-[#4edea3]">check</span>}
              {active && <div className="w-1.5 h-1.5 bg-[#adc6ff] rounded-full animate-pulse" />}
            </div>
            <span className={`font-mono text-[11px] ${
              done ? 'text-[#4edea3]' : active ? 'text-[#adc6ff]' : 'text-[#c2c6d6]/40'
            }`}>
              {step}
            </span>
          </div>
        )
      })}
    </div>
  )
}
