/**
 * MapLegend
 *
 * Floating panel that shows the active SatQuery AI overlay legend.
 * Appears only when there are active overlays on the map.
 *
 * Displays:
 *   - Analysis type label
 *   - Color key for overlay types
 *   - Quick stats (detection count, area, coverage)
 *   - Clear button
 *
 * Props:
 *   overlays     — array of overlay descriptors (same as SatMap shape)
 *   result       — backend analysis result object (optional, for stats)
 *   onClear      — () => void
 *   className    — string
 */

const ANALYSIS_LABELS = {
  water_detection:      'Water Detection',
  vegetation_analysis:  'Vegetation Analysis',
  built_up_detection:   'Built-up Areas',
  building_detection:   'Building Detection',
  change_detection:     'Change Detection',
  landcover:            'Land Cover',
  feature_highlighting: 'Feature Highlighting',
}

const ANALYSIS_ICONS = {
  water_detection:      'water_drop',
  vegetation_analysis:  'forest',
  built_up_detection:   'location_city',
  building_detection:   'home_work',
  change_detection:     'compare',
  landcover:            'layers',
  feature_highlighting: 'highlight',
}

export default function MapLegend({ overlays = [], result = null, onClear, className = '' }) {
  if (!overlays.length) return null

  /* Derive unique colors/labels from the overlay array */
  const uniqueColors = [...new Map(
    overlays
      .filter(o => o.color)
      .map(o => [o.color, o.tooltip || o.label || 'Feature'])
  ).entries()]

  const task  = result?.task || ''
  const stats = result?.statistics || {}
  const label = ANALYSIS_LABELS[task] || 'AI Analysis'
  const icon  = ANALYSIS_ICONS[task]  || 'auto_awesome'

  return (
    <div
      className={`glass-panel rounded-xl overflow-hidden w-52 ${className}`}
      role="complementary"
      aria-label="Map overlay legend"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 pt-2.5 pb-2 border-b border-white/8">
        <div className="flex items-center gap-1.5">
          <span className="material-symbols-outlined text-[13px] text-[#adc6ff]">{icon}</span>
          <span className="font-mono text-[10px] text-[#adc6ff] font-bold">{label}</span>
        </div>
        {onClear && (
          <button
            onClick={onClear}
            title="Clear overlays"
            aria-label="Clear map overlays"
            className="material-symbols-outlined text-[14px] text-[#c2c6d6]/40
                       hover:text-[#ffb4ab] transition-colors focus:outline-none"
          >
            close
          </button>
        )}
      </div>

      {/* Color legend */}
      {uniqueColors.length > 0 && (
        <div className="px-3 py-2 flex flex-col gap-1.5 border-b border-white/8">
          {uniqueColors.slice(0, 6).map(([color, tooltip]) => (
            <div key={color} className="flex items-center gap-2">
              <span
                className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                style={{ background: color, opacity: 0.85 }}
              />
              <span className="font-mono text-[9px] text-[#c2c6d6]/80 truncate">
                {tooltip}
              </span>
            </div>
          ))}
          {uniqueColors.length > 6 && (
            <span className="font-mono text-[9px] text-[#c2c6d6]/40">
              +{uniqueColors.length - 6} more
            </span>
          )}
        </div>
      )}

      {/* Quick stats */}
      <div className="px-3 py-2 flex flex-col gap-1">
        <div className="flex justify-between items-center">
          <span className="font-mono text-[9px] text-[#c2c6d6]/50">Features</span>
          <span className="font-mono text-[10px] text-[#e2e2e8]">
            {stats.detection_count ?? overlays.length}
          </span>
        </div>

        {stats.total_area_m2 != null && (
          <div className="flex justify-between items-center">
            <span className="font-mono text-[9px] text-[#c2c6d6]/50">Area</span>
            <span className="font-mono text-[10px] text-[#e2e2e8]">
              {(stats.total_area_m2 / 1e6).toFixed(3)} km²
            </span>
          </div>
        )}

        {stats.coverage_percent != null && (
          <div className="flex justify-between items-center">
            <span className="font-mono text-[9px] text-[#c2c6d6]/50">Coverage</span>
            <span className="font-mono text-[10px] text-[#4edea3]">
              {stats.coverage_percent}%
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
