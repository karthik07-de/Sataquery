export default function StatBar({ value = 0, variant = 'default', className = '' }) {
  const fillClass =
    variant === 'red'   ? 'stat-bar-fill-red' :
    variant === 'green' ? 'stat-bar-fill-green' :
    'stat-bar-fill'
  return (
    <div className={`stat-bar ${className}`}>
      <div className={fillClass} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  )
}
