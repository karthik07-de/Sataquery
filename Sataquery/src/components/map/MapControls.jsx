export default function MapControls({ onZoomIn, onZoomOut, onLocate, onLayers }) {
  const btn =
    'w-8 h-8 glass-panel rounded-lg flex items-center justify-center hover:bg-white/10 transition-colors cursor-pointer'

  return (
    <div className="absolute top-4 right-4 flex flex-col gap-2 z-[500]">
      <button onClick={onZoomIn}  className={btn} aria-label="Zoom in">
        <span className="material-symbols-outlined text-[16px] text-[#c2c6d6]">add</span>
      </button>
      <button onClick={onZoomOut} className={btn} aria-label="Zoom out">
        <span className="material-symbols-outlined text-[16px] text-[#c2c6d6]">remove</span>
      </button>
      <div className="w-px h-3 bg-white/10 mx-auto" />
      <button onClick={onLocate}  className={btn} aria-label="My location">
        <span className="material-symbols-outlined text-[16px] text-[#c2c6d6]">my_location</span>
      </button>
      <button onClick={onLayers}  className={btn} aria-label="Layer toggle">
        <span className="material-symbols-outlined text-[16px] text-[#c2c6d6]">layers</span>
      </button>
    </div>
  )
}
