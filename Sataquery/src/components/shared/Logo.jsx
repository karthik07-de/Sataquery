/**
 * SatQuery AI Logo
 * 
 * Inline SVG logo matching the reference image:
 * - Dark rounded square background
 * - Satellite / cross-hatch icon in blue
 * - Orbital ring around it
 * No external asset dependency — always renders correctly.
 */
export default function Logo({ px = 28, className = '' }) {
  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`flex-shrink-0 ${className}`}
      style={{ minWidth: px, minHeight: px }}
      aria-label="SatQuery AI logo"
    >
      {/* Background rounded rect */}
      <rect width="40" height="40" rx="8" fill="#111827" />
      <rect width="40" height="40" rx="8" fill="none" stroke="#3b82f6" strokeWidth="1.5" />

      {/* Orbital ellipse */}
      <ellipse
        cx="20" cy="20" rx="16" ry="7"
        stroke="#3b82f6" strokeWidth="1.2"
        fill="none" opacity="0.7"
        transform="rotate(-35 20 20)"
      />

      {/* Satellite body — horizontal bar */}
      <rect x="13" y="18.5" width="14" height="3" rx="1.5" fill="#3b82f6" />

      {/* Satellite solar panels */}
      <rect x="7" y="17" width="6" height="6" rx="1" fill="#3b82f6" opacity="0.8" />
      <rect x="27" y="17" width="6" height="6" rx="1" fill="#3b82f6" opacity="0.8" />

      {/* Panel detail lines left */}
      <line x1="10" y1="17" x2="10" y2="23" stroke="#1d4ed8" strokeWidth="0.6" />
      <line x1="7" y1="20" x2="13" y2="20" stroke="#1d4ed8" strokeWidth="0.6" />

      {/* Panel detail lines right */}
      <line x1="30" y1="17" x2="30" y2="23" stroke="#1d4ed8" strokeWidth="0.6" />
      <line x1="27" y1="20" x2="33" y2="20" stroke="#1d4ed8" strokeWidth="0.6" />

      {/* Central hub */}
      <circle cx="20" cy="20" r="2.5" fill="#60a5fa" />
      <circle cx="20" cy="20" r="1.2" fill="#1e40af" />

      {/* Antenna */}
      <line x1="20" y1="17.5" x2="20" y2="13" stroke="#3b82f6" strokeWidth="1" />
      <circle cx="20" cy="12.5" r="1" fill="#60a5fa" />

      {/* Signal dots */}
      <circle cx="8" cy="10" r="1" fill="#4edea3" opacity="0.9" />
      <circle cx="32" cy="11" r="0.8" fill="#c2c6d6" opacity="0.6" />
    </svg>
  )
}
