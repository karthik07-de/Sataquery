/**
 * MapViewSwitcher
 *
 * Compact floating panel that lets users switch between the four
 * SatQuery map modes: Map, Satellite, 3D, 360°.
 *
 * Design principles:
 *   - Floats over the map, not beside it
 *   - Selected mode is visually unambiguous
 *   - Professional, minimal — no gradients or glow effects
 *   - Uses existing SatQuery design tokens
 *
 * Props:
 *   viewMode    — current mode string (from useMapState)
 *   onSelect    — (mode: string) => void
 *   className   — optional extra classes for positioning
 */

import { VIEW_MODES } from '../../hooks/useMapState'

const MODES = [
  {
    id:    VIEW_MODES.MAP,
    label: 'Map',
    icon:  'map',
    title: 'Road map view',
  },
  {
    id:    VIEW_MODES.SATELLITE,
    label: 'Satellite',
    icon:  'satellite_alt',
    title: 'Satellite imagery',
  },
  {
    id:    VIEW_MODES.THREE_D,
    label: '3D',
    icon:  'globe',
    title: '3D terrain view — tilt and rotate the camera',
  },
  {
    id:    VIEW_MODES.PANORAMA,
    label: '360°',
    icon:  '360',
    title: 'Street View panorama',
  },
]

export default function MapViewSwitcher({ viewMode, onSelect, className = '' }) {
  return (
    <div
      className={`flex flex-col overflow-hidden rounded-xl border border-white/10 bg-[#0c0e12]/90 backdrop-blur-md shadow-xl ${className}`}
      role="radiogroup"
      aria-label="Map view mode"
    >
      {/* Header label */}
      <div className="px-3 pt-2.5 pb-1.5 border-b border-white/8">
        <span className="font-mono text-[8px] tracking-widest text-[#c2c6d6]/40 uppercase">
          View
        </span>
      </div>

      {/* Mode buttons */}
      {MODES.map((mode, idx) => {
        const active = viewMode === mode.id
        return (
          <button
            key={mode.id}
            role="radio"
            aria-checked={active}
            title={mode.title}
            onClick={() => onSelect(mode.id)}
            className={[
              'group flex items-center gap-2.5 px-3 py-2 text-left transition-colors',
              'focus:outline-none focus-visible:ring-1 focus-visible:ring-[#adc6ff]/60',
              idx !== MODES.length - 1 ? 'border-b border-white/[0.05]' : '',
              active
                ? 'bg-[#adc6ff]/10 text-[#adc6ff]'
                : 'text-[#8c909f] hover:bg-white/[0.05] hover:text-[#c2c6d6]',
            ].join(' ')}
          >
            {/* Icon */}
            <span
              className={[
                'material-symbols-outlined text-[15px] flex-shrink-0 transition-colors',
                active ? 'text-[#adc6ff]' : 'text-[#8c909f] group-hover:text-[#c2c6d6]',
              ].join(' ')}
            >
              {mode.icon}
            </span>

            {/* Label */}
            <span className="font-mono text-[11px] flex-1 leading-none">
              {mode.label}
            </span>

            {/* Active indicator — right-side dot */}
            <span
              className={[
                'w-1.5 h-1.5 rounded-full flex-shrink-0 transition-opacity',
                active ? 'bg-[#adc6ff] opacity-100' : 'opacity-0',
              ].join(' ')}
            />
          </button>
        )
      })}
    </div>
  )
}
