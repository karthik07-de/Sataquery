/**
 * MapControls3D
 *
 * Floating map controls for SatQuery's Google Earth-style map.
 * Replaces and extends the old MapControls component.
 *
 * Standard controls (all modes):
 *   Zoom in / Zoom out / My location / Reset north / Fullscreen
 *
 * 3D-specific controls (shown when viewMode === '3d'):
 *   Tilt toggle / Rotate left / Rotate right / Compass rose
 *
 * Props:
 *   mapState       — object from useMapState()
 *   onZoomIn       — () => void
 *   onZoomOut      — () => void
 *   onLocate       — () => void  (current GPS location)
 *   onResetNorth   — () => void  (heading → 0)
 *   onFullscreen   — () => void
 *   isFullscreen   — boolean
 *   className      — string
 */

import { useCallback } from 'react'
import { VIEW_MODES } from '../../hooks/useMapState'

/* ── Small icon button ── */
function CtrlBtn({ icon, title, onClick, active = false, accent = false, disabled = false }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className={[
        'w-8 h-8 rounded-lg flex items-center justify-center transition-colors',
        'focus:outline-none focus-visible:ring-1 focus-visible:ring-[#adc6ff]/60',
        disabled
          ? 'opacity-30 cursor-not-allowed'
          : active
            ? 'bg-[#adc6ff]/20 text-[#adc6ff] border border-[#adc6ff]/30'
            : accent
              ? 'glass-panel text-[#4edea3] hover:bg-[#4edea3]/10'
              : 'glass-panel text-[#c2c6d6] hover:bg-white/10',
      ].join(' ')}
    >
      <span className="material-symbols-outlined text-[16px]">{icon}</span>
    </button>
  )
}

/* ── Compass rose — rotates to show current heading ── */
function Compass({ heading = 0, onClick }) {
  return (
    <button
      onClick={onClick}
      title="Reset north"
      aria-label={`Heading ${Math.round(heading)}°. Click to reset north.`}
      className="w-8 h-8 glass-panel rounded-lg flex items-center justify-center
                 hover:bg-white/10 transition-colors focus:outline-none
                 focus-visible:ring-1 focus-visible:ring-[#adc6ff]/60"
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        style={{ transform: `rotate(${-heading}deg)`, transition: 'transform 0.3s ease' }}
        aria-hidden="true"
      >
        {/* N arrow — red (north) */}
        <polygon points="12,3 14.5,12 12,10.5 9.5,12" fill="#ffb4ab" />
        {/* S arrow — muted */}
        <polygon points="12,21 14.5,12 12,13.5 9.5,12" fill="rgba(255,255,255,0.25)" />
        {/* Center dot */}
        <circle cx="12" cy="12" r="1.5" fill="rgba(255,255,255,0.6)" />
      </svg>
    </button>
  )
}

export default function MapControls3D({
  mapState,
  onZoomIn,
  onZoomOut,
  onLocate,
  onResetNorth,
  onFullscreen,
  isFullscreen = false,
  className = '',
}) {
  const { viewMode, tilt, heading } = mapState
  const is3D = viewMode === VIEW_MODES.THREE_D
  const isSV = viewMode === VIEW_MODES.PANORAMA

  /* ── Tilt toggle: 0 ↔ 45 ── */
  const handleTiltToggle = useCallback(() => {
    const map = mapState.mapInstanceRef.current
    if (!map) return
    const next = mapState.tilt > 0 ? 0 : 45
    mapState.updateCamera(next, mapState.heading)
    map.setTilt?.(next)
  }, [mapState])

  /* ── Rotate left / right ── */
  const handleRotate = useCallback((delta) => {
    const map = mapState.mapInstanceRef.current
    if (!map) return
    const next = ((mapState.heading + delta) % 360 + 360) % 360
    mapState.updateCamera(mapState.tilt, next)
    map.setHeading?.(next)
  }, [mapState])

  /* Street View hides map controls — only fullscreen remains */
  if (isSV) {
    return (
      <div className={`flex flex-col gap-2 ${className}`}>
        <CtrlBtn
          icon={isFullscreen ? 'fullscreen_exit' : 'fullscreen'}
          title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          onClick={onFullscreen}
        />
      </div>
    )
  }

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {/* ── Standard controls ── */}
      <CtrlBtn icon="add"         title="Zoom in"     onClick={onZoomIn} />
      <CtrlBtn icon="remove"      title="Zoom out"    onClick={onZoomOut} />

      <div className="w-px h-2.5 bg-white/10 mx-auto" aria-hidden />

      <Compass heading={heading} onClick={onResetNorth} />

      <div className="w-px h-2.5 bg-white/10 mx-auto" aria-hidden />

      <CtrlBtn
        icon="my_location"
        title="My location"
        onClick={onLocate}
        accent
      />

      <CtrlBtn
        icon={isFullscreen ? 'fullscreen_exit' : 'fullscreen'}
        title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        onClick={onFullscreen}
      />

      {/* ── 3D-specific controls ── */}
      {is3D && (
        <>
          <div className="w-px h-2.5 bg-white/10 mx-auto" aria-hidden />

          {/* Tilt toggle */}
          <CtrlBtn
            icon="vertical_align_center"
            title={tilt > 0 ? 'Reset to top-down view' : 'Enable 45° tilt'}
            onClick={handleTiltToggle}
            active={tilt > 0}
          />

          {/* Rotate left */}
          <CtrlBtn
            icon="rotate_left"
            title="Rotate left 45°"
            onClick={() => handleRotate(-45)}
          />

          {/* Rotate right */}
          <CtrlBtn
            icon="rotate_right"
            title="Rotate right 45°"
            onClick={() => handleRotate(45)}
          />
        </>
      )}
    </div>
  )
}
