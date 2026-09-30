/**
 * MapStatusBar
 *
 * Thin bar along the bottom of the map showing:
 *   Coordinates (lat/lng), zoom level, heading (3D mode),
 *   map type label, and imagery attribution note.
 *
 * Props:
 *   mapState    — object from useMapState()
 *   cursorCoords — { lat, lng } | null  (from onMouseMove)
 *   className   — string
 */

import { VIEW_MODES } from '../../hooks/useMapState'

const MODE_LABELS = {
  [VIEW_MODES.MAP]:       'Road Map',
  [VIEW_MODES.SATELLITE]: 'Satellite',
  [VIEW_MODES.THREE_D]:   '3D Satellite',
  [VIEW_MODES.PANORAMA]:  '360° Street View',
}

function fmt(n, d = 5) {
  return n != null ? n.toFixed(d) : '—'
}

export default function MapStatusBar({ mapState, cursorCoords, className = '' }) {
  const { lat, lng, zoom, heading, tilt, viewMode } = mapState
  const display = cursorCoords || { lat, lng }
  const is3D    = viewMode === VIEW_MODES.THREE_D

  return (
    <div
      className={`glass-panel flex items-center gap-4 px-4 py-1.5 rounded-lg
                  font-mono text-[10px] text-[#c2c6d6]/70 ${className}`}
      role="status"
      aria-live="polite"
      aria-label="Map coordinates"
    >
      {/* Coordinates */}
      <div className="flex items-center gap-1.5">
        <span className="text-[#c2c6d6]/40">LAT</span>
        <span className="text-[#e2e2e8]">
          {fmt(display.lat)}°&nbsp;{display.lat >= 0 ? 'N' : 'S'}
        </span>
      </div>

      <div className="w-px h-3 bg-white/10" aria-hidden />

      <div className="flex items-center gap-1.5">
        <span className="text-[#c2c6d6]/40">LNG</span>
        <span className="text-[#e2e2e8]">
          {fmt(display.lng)}°&nbsp;{display.lng >= 0 ? 'E' : 'W'}
        </span>
      </div>

      <div className="w-px h-3 bg-white/10" aria-hidden />

      {/* Zoom */}
      <div className="flex items-center gap-1.5">
        <span className="text-[#c2c6d6]/40">Z</span>
        <span className="text-[#e2e2e8]">{zoom}</span>
      </div>

      {/* Heading — only in 3D mode */}
      {is3D && (
        <>
          <div className="w-px h-3 bg-white/10" aria-hidden />
          <div className="flex items-center gap-1.5">
            <span className="text-[#c2c6d6]/40">HDG</span>
            <span className="text-[#e2e2e8]">{Math.round(heading)}°</span>
          </div>
          <div className="w-px h-3 bg-white/10" aria-hidden />
          <div className="flex items-center gap-1.5">
            <span className="text-[#c2c6d6]/40">TILT</span>
            <span className="text-[#e2e2e8]">{Math.round(tilt)}°</span>
          </div>
        </>
      )}

      {/* Mode label */}
      <div className="w-px h-3 bg-white/10 hidden sm:block" aria-hidden />
      <div className="hidden sm:flex items-center gap-1.5">
        <span className="material-symbols-outlined text-[11px] text-[#adc6ff]">
          {viewMode === VIEW_MODES.MAP       ? 'map'
           : viewMode === VIEW_MODES.PANORAMA ? '360'
           : 'satellite_alt'}
        </span>
        <span className="text-[#adc6ff]">{MODE_LABELS[viewMode] || 'Satellite'}</span>
      </div>
    </div>
  )
}
