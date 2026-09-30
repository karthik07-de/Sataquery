import { useRef, useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import Navbar from '../components/shared/Navbar'
import SatMap from '../components/map/SatMap'
import Cesium3DGlobe from '../components/map/Cesium3DGlobe'
import MapViewSwitcher from '../components/map/MapViewSwitcher'
import MapControls3D from '../components/map/MapControls3D'
import MapStatusBar from '../components/map/MapStatusBar'
import MapLegend from '../components/map/MapLegend'
import LocationSearch from '../components/map/LocationSearch'
import Toggle from '../components/shared/Toggle'
import StatBar from '../components/shared/StatBar'
import AiChat from '../components/shared/AiChat'
import { useMapState, VIEW_MODES } from '../hooks/useMapState'
import { getActiveOverlays } from '../services/analysisOverlayApi'
import { layersApi } from '../services/layersApi'

const VIEW_MODES_TABS = ['Original', 'Detection Mask', 'Annotations', 'Coordinates']
const RIGHT_TABS      = ['FEATURE', 'STATS', 'CONFID', 'EXPORT']

const LAYER_PRESETS = [
  { label: 'Rotterdam, Netherlands', center: [51.92, 4.48],   zoom: 12 },
  { label: 'Tokyo, Japan',           center: [35.68, 139.69], zoom: 11 },
  { label: 'London, UK',             center: [51.51, -0.13],  zoom: 11 },
  { label: 'Dubai, UAE',             center: [25.20, 55.27],  zoom: 11 },
  { label: 'Bengaluru, India',       center: [12.97, 77.59],  zoom: 12 },
]

export default function Layers() {
  /* ── Map state ── */
  const mapState = useMapState({
    lat: 51.92, lng: 4.48, zoom: 12,
    viewMode: VIEW_MODES.SATELLITE,
    selectedLocation: { label: 'Rotterdam, Netherlands', lat: 51.92, lng: 4.48, zoom: 12 },
  })

  /* ── Cursor coords ── */
  const [cursorCoords, setCursorCoords] = useState(null)

  /* ── Fullscreen ── */
  const mapContainerRef = useRef(null)
  const [isFullscreen, setIsFullscreen] = useState(false)

  useEffect(() => {
    function onChange() { setIsFullscreen(!!document.fullscreenElement) }
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  function handleFullscreen() {
    const el = mapContainerRef.current
    if (!el) return
    if (!document.fullscreenElement) el.requestFullscreen?.().catch(() => {})
    else document.exitFullscreen?.()
  }

  /* ── Layer / analysis state ── */
  const [viewModeTab,    setViewModeTab]    = useState('Original')
  const [rightTab,       setRightTab]       = useState('FEATURE')
  const [overlays,       setOverlays]       = useState([])
  const [overlaySummary, setOverlaySummary] = useState(null)
  const [entities,       setEntities]       = useState([])
  const [layerList,      setLayerList]      = useState([])   // raw backend layer records
  const [layersLoading,  setLayersLoading]  = useState(true)
  const [layersError,    setLayersError]    = useState(null)

  // Derived from the analysis summary — no separate state needed
  const stats       = overlaySummary?.coverage ? Object.entries(overlaySummary.coverage) : []
  const confidences = overlaySummary?.confidence ? Object.entries(overlaySummary.confidence) : []

  /* ── Load active overlays + backend layer list ── */
  useEffect(() => {
    setLayersLoading(true)
    setLayersError(null)

    // Run both requests in parallel
    Promise.allSettled([
      getActiveOverlays(),
      layersApi.listActive(),
    ]).then(([overlayResult, layerResult]) => {
      // Overlays (visual map data)
      if (overlayResult.status === 'fulfilled' && overlayResult.value?.overlays?.length > 0) {
        const data = overlayResult.value
        setOverlays(data.overlays)
        setOverlaySummary(data.summary || null)
        if (data.summary?.detections) {
          setEntities(
            Object.entries(data.summary.detections).map(([label, count]) => ({
              label, count: count.toString(), isPlaceholder: false,
            }))
          )
        }
      }

      // Layer list (metadata panel)
      if (layerResult.status === 'fulfilled') {
        setLayerList(layerResult.value || [])
      } else {
        setLayersError('Could not load layer metadata.')
      }
    }).finally(() => setLayersLoading(false))
  }, [])

  /* ── Location select ── */
  function handleLocationSelect(loc) {
    mapState.goTo(loc)
    setOverlays([])
    setOverlaySummary(null)
    setEntities([])
  }

  /* ── Reset north ── */
  function handleResetNorth() {
    const map = mapState.mapInstanceRef.current
    if (!map) return
    if (map.setHeading) {
      map.setHeading(0)
    }
    mapState.updateCamera(mapState.tilt, 0)
  }

  /* ── My location ── */
  function handleLocate() {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      pos => mapState.goTo({
        label: 'My Location',
        center: [pos.coords.latitude, pos.coords.longitude],
        zoom: 14,
      }),
      () => {}
    )
  }

  const isSV = false  // panorama handled separately in Dashboard
  const is3D = mapState.viewMode === VIEW_MODES.THREE_D

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[#0b0c10]">
      <Navbar />

      <div className="flex flex-1 overflow-hidden">

        {/* ── Left Sidebar ── */}
        <aside className="w-[220px] min-w-[220px] border-r border-white/10 bg-[#0c0e12]
                          flex flex-col overflow-hidden flex-shrink-0">
          <div className="p-3">
            <Link to="/missions"
              className="flex items-center justify-center gap-2 w-full py-2
                bg-[#adc6ff]/10 hover:bg-[#adc6ff]/20 border border-[#adc6ff]/20
                rounded-lg font-mono text-xs text-[#adc6ff] transition-colors">
              <span className="material-symbols-outlined text-[16px]">add</span>
              New Analysis
            </Link>
          </div>

          {[
            { icon: 'chat_bubble', label: 'Neural Chat', to: '/dashboard' },
            { icon: 'history',     label: 'History',     to: '/missions' },
            { icon: 'layers',      label: 'Layers',      to: '/layers',   active: true },
            { icon: 'bar_chart',   label: 'Analytics',   to: '/analytics' },
            { icon: 'folder',      label: 'Projects',    to: '/projects' },
          ].map(item => (
            <Link key={item.label} to={item.to}
              className={`mx-2 flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px]
                transition-colors ${
                item.active
                  ? 'bg-[#adc6ff]/12 text-[#adc6ff]'
                  : 'text-[#c2c6d6] hover:bg-white/[0.06] hover:text-[#e2e2e8]'
              }`}>
              <span className="material-symbols-outlined text-[18px]">{item.icon}</span>
              {item.label}
            </Link>
          ))}

          {/* Layer toggles */}
          <div className="px-4 mt-4 flex-1 overflow-y-auto scroll-thin">
            <div className="font-mono text-[9px] text-[#c2c6d6]/60 uppercase tracking-widest mb-3">
              Active Viewport Layers
            </div>

            {layersLoading && (
              <div className="flex items-center gap-2 py-2">
                <span className="w-3 h-3 border-2 border-[#adc6ff]/20 border-t-[#adc6ff] rounded-full animate-spin-slow flex-shrink-0" />
                <span className="font-mono text-[9px] text-[#c2c6d6]/50">Loading layers…</span>
              </div>
            )}

            {layersError && !layersLoading && (
              <div className="font-mono text-[9px] text-[#ffb4ab]/70 py-2">{layersError}</div>
            )}

            {/* Real layers from backend */}
            {!layersLoading && layerList.length > 0 && (
              <div className="flex flex-col gap-3 mb-3">
                {layerList.map(layer => {
                  const colorMap = {
                    detection_mask: '#4edea3',
                    polygon:        '#adc6ff',
                    bounding_box:   '#ffb95f',
                    heatmap:        '#ffb4ab',
                    imagery:        '#c2c6d6',
                  }
                  const color = colorMap[layer.layer_type] || '#c2c6d6'
                  const label = layer.feature
                    ? layer.feature.replace(/_/g, ' ')
                    : layer.layer_type.replace(/_/g, ' ')
                  return (
                    <div key={layer.layer_id} className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                        <span className="text-xs text-[#e2e2e8] truncate capitalize">{label}</span>
                      </div>
                      <Toggle defaultOn />
                    </div>
                  )
                })}
              </div>
            )}

            {/* Fallback static layers when no analysis exists yet */}
            {!layersLoading && layerList.length === 0 && (
              <div className="flex flex-col gap-3">
                {[
                  { label: 'Base Imagery (RGB)', color: '#4edea3', defaultOn: true  },
                  { label: 'Thermal IR',         color: '#ffb95f', defaultOn: false },
                  { label: 'SAR Overlay',        color: '#adc6ff', defaultOn: true  },
                  { label: 'Detection Mask',     color: '#c2c6d6', defaultOn: true  },
                ].map(l => (
                  <div key={l.label} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{ background: l.color }} />
                      <span className="text-xs text-[#e2e2e8]">{l.label}</span>
                    </div>
                    <Toggle defaultOn={l.defaultOn} />
                  </div>
                ))}
                <p className="font-mono text-[9px] text-[#c2c6d6]/40 leading-relaxed mt-1">
                  Run an analysis on the Dashboard to populate real layers here.
                </p>
              </div>
            )}
          </div>
        </aside>

        {/* ── Map ── */}
        <main ref={mapContainerRef} className="flex-1 relative overflow-hidden">

          {/* View mode tab bar */}
          {!isSV && (
            <div className="absolute top-0 left-0 right-0 z-[500] flex
                            bg-[#111318]/90 backdrop-blur-sm border-b border-white/10 overflow-x-auto">
              {VIEW_MODES_TABS.map(m => (
                <button key={m} onClick={() => setViewModeTab(m)}
                  className={`px-4 py-2 font-mono text-[10px] whitespace-nowrap border-b-2
                    flex items-center gap-1.5 transition-colors ${
                    viewModeTab === m
                      ? 'text-[#adc6ff] border-[#adc6ff]'
                      : 'text-[#8c909f] border-transparent hover:text-[#c2c6d6]'
                  }`}>
                  <span className="material-symbols-outlined text-[12px]">
                    {m === 'Original'        ? 'photo'
                     : m === 'Detection Mask' ? 'blur_on'
                     : m === 'Annotations'    ? 'gesture'
                     : 'grid_on'}
                  </span>
                  {m}
                </button>
              ))}
            </div>
          )}

          {/* Map component: SatMap for map/satellite, Cesium3DGlobe for 3D, PanoramaViewer for 360° */}
          {is3D ? (
            <Cesium3DGlobe
              mapState={mapState}
              overlays={overlays}
              onMouseMove={setCursorCoords}
            />
          ) : (
            <SatMap
              center={[mapState.lat, mapState.lng]}
              zoom={mapState.zoom}
              viewMode={mapState.viewMode}
              overlays={overlays}
              onMapReady={mapState.setMapInstance}
              onMouseMove={setCursorCoords}
              className="absolute inset-0"
            />
          )}

          {!isSV && (
            <>
              {/* Location search */}
              <div className="absolute top-12 left-4 z-[500]">
                <LocationSearch
                  onSelect={handleLocationSelect}
                  presets={LAYER_PRESETS}
                />
              </div>

              {/* View mode switcher */}
              <MapViewSwitcher
                viewMode={mapState.viewMode}
                onSelect={mapState.setViewMode}
                className="absolute top-12 right-14 z-[500]"
              />

              {/* Map controls */}
              <MapControls3D
                mapState={mapState}
                onZoomIn={() => {
                  const map = mapState.mapInstanceRef.current
                  if (map) map.setZoom((map.getZoom() || 12) + 1)
                }}
                onZoomOut={() => {
                  const map = mapState.mapInstanceRef.current
                  if (map) map.setZoom(Math.max(1, (map.getZoom() || 12) - 1))
                }}
                onLocate={handleLocate}
                onResetNorth={handleResetNorth}
                onFullscreen={handleFullscreen}
                isFullscreen={isFullscreen}
                className="absolute top-12 right-4 z-[500]"
              />

              {/* Overlay legend */}
              {overlays.length > 0 && (
                <MapLegend
                  overlays={overlays}
                  result={overlaySummary ? { statistics: overlaySummary } : null}
                  onClear={() => { setOverlays([]); setOverlaySummary(null); setEntities([]) }}
                  className="absolute bottom-16 left-4 z-[500]"
                />
              )}

              {/* Status bar */}
              <MapStatusBar
                mapState={mapState}
                cursorCoords={cursorCoords}
                className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[500]"
              />
            </>
          )}
        </main>

        {/* ── Right panel ── */}
        <aside className="w-72 border-l border-white/10 bg-[#0c0e12] flex flex-col
                          overflow-hidden flex-shrink-0">
          <div className="p-4 border-b border-white/10">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="material-symbols-outlined text-[14px] text-[#4edea3]">bar_chart</span>
              <span className="font-mono text-xs font-bold text-[#4edea3]">Live Analysis</span>
            </div>
            <div className="font-mono text-[9px] text-[#c2c6d6]/60">Real-time telemetry</div>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-white/10 overflow-x-auto">
            {RIGHT_TABS.map(t => (
              <button key={t} onClick={() => setRightTab(t)}
                className={`px-3 py-2 font-mono text-[10px] whitespace-nowrap border-b-2
                  flex items-center gap-1 transition-colors ${
                  rightTab === t
                    ? 'text-[#adc6ff] border-[#adc6ff]'
                    : 'text-[#8c909f] border-transparent hover:text-[#c2c6d6]'
                }`}>
                <span className="material-symbols-outlined text-[11px]">
                  {t === 'FEATURE' ? 'radar'
                   : t === 'STATS'   ? 'area_chart'
                   : t === 'CONFID'  ? 'shield'
                   : 'download'}
                </span>
                {t}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto scroll-thin p-4 flex flex-col gap-4">

            {/* ── FEATURE ── */}
            {rightTab === 'FEATURE' && (
              <>
                <div className="bg-[#111318] border border-white/10 rounded-xl p-3 flex flex-col gap-2">
                  <div className="flex justify-between items-center">
                    <span className="font-mono text-[10px] text-[#c2c6d6] flex items-center gap-1">
                      <span className="material-symbols-outlined text-[12px] text-[#adc6ff]">blur_on</span>
                      AI Mask Intensity
                    </span>
                    <span className="font-mono text-[10px] text-[#adc6ff] font-bold">
                      {overlaySummary?.maskIntensity != null
                        ? overlaySummary.maskIntensity + '%'
                        : '—'}
                    </span>
                  </div>
                  {overlaySummary?.maskIntensity != null
                    ? <StatBar value={overlaySummary.maskIntensity} />
                    : <div className="flex items-center gap-2 py-2">
                        <div className="flex-1 h-1.5 rounded-full bg-white/5" />
                        <span className="font-mono text-[9px] text-[#c2c6d6]/50">No analysis data</span>
                      </div>
                  }
                  <div className="flex justify-between font-mono text-[9px] text-[#c2c6d6]/50">
                    <span>MIN</span><span>MAX</span>
                  </div>
                </div>

                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      entities.length > 0 ? 'bg-[#4edea3] animate-pulse-dot' : 'bg-[#c2c6d6]/30'
                    }`} />
                    <span className="font-mono text-[9px] text-[#c2c6d6]/70 uppercase tracking-widest">
                      Detected Entities
                    </span>
                  </div>
                  {entities.length > 0 ? (
                    <div className="grid grid-cols-2 gap-2">
                      {entities.map(e => (
                        <div key={e.label}
                          className="bg-[#111318] border border-white/10 rounded-lg p-3">
                          <div className="text-xl font-bold text-[#e2e2e8]">{e.count}</div>
                          <div className="font-mono text-[9px] text-[#c2c6d6] mt-0.5">{e.label}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2 py-6 text-center">
                      <div className="w-10 h-10 rounded-lg bg-[#adc6ff]/10 border border-[#adc6ff]/20
                        flex items-center justify-center">
                        <span className="material-symbols-outlined text-[20px] text-[#adc6ff]/60">radar</span>
                      </div>
                      <p className="font-mono text-xs text-[#c2c6d6]/60">No detections yet</p>
                      <p className="font-mono text-[10px] text-[#c2c6d6]/40">
                        Upload and analyze an image to see results
                      </p>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* ── STATS ── */}
            {rightTab === 'STATS' && (
              <div className="bg-[#111318] border border-white/10 rounded-xl p-3 flex flex-col gap-2">
                <div className="font-mono text-[10px] text-[#c2c6d6] mb-1">Coverage Statistics</div>
                {stats.length > 0 ? (
                  stats.map(([k, v]) => (
                    <div key={k}
                      className="flex justify-between text-xs font-mono py-1 border-b border-white/5 last:border-0">
                      <span className="text-[#c2c6d6]">{k}</span>
                      <span className="text-[#e2e2e8]">{v}</span>
                    </div>
                  ))
                ) : (
                  <div className="flex flex-col items-center gap-2 py-6 text-center">
                    <div className="w-10 h-10 rounded-lg bg-[#adc6ff]/10 border border-[#adc6ff]/20
                      flex items-center justify-center">
                      <span className="material-symbols-outlined text-[20px] text-[#adc6ff]/60">area_chart</span>
                    </div>
                    <p className="font-mono text-xs text-[#c2c6d6]/60">No statistics yet</p>
                    <p className="font-mono text-[10px] text-[#c2c6d6]/40">
                      Statistics appear after analysis completes
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* ── CONFID ── */}
            {rightTab === 'CONFID' && (
              <div className="bg-[#111318] border border-white/10 rounded-xl p-3 flex flex-col gap-3">
                <div className="font-mono text-[10px] text-[#c2c6d6] mb-1">Per-class Confidence</div>
                {confidences.length > 0 ? (
                  confidences.map(([k, v]) => (
                    <div key={k}>
                      <div className="flex justify-between font-mono text-[9px] mb-1">
                        <span className="text-[#c2c6d6]">{k}</span>
                        <span className="text-[#e2e2e8]">{v}%</span>
                      </div>
                      <StatBar value={v} />
                    </div>
                  ))
                ) : (
                  <div className="flex flex-col items-center gap-2 py-6 text-center">
                    <div className="w-10 h-10 rounded-lg bg-[#adc6ff]/10 border border-[#adc6ff]/20
                      flex items-center justify-center">
                      <span className="material-symbols-outlined text-[20px] text-[#adc6ff]/60">shield</span>
                    </div>
                    <p className="font-mono text-xs text-[#c2c6d6]/60">No confidence data yet</p>
                    <p className="font-mono text-[10px] text-[#c2c6d6]/40">
                      Confidence scores appear after analysis
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* ── EXPORT ── */}
            {rightTab === 'EXPORT' && (
              <div className="flex flex-col gap-2">
                {[
                  { icon: 'description', color: '#adc6ff', label: 'GeoJSON',  sub: 'Vector polygons' },
                  { icon: 'image',       color: '#ffb95f', label: 'GeoTIFF',  sub: 'Annotated raster' },
                  { icon: 'table_chart', color: '#4edea3', label: 'CSV Report', sub: 'Tabular data' },
                ].map(({ icon, color, label, sub }) => (
                  <button key={label}
                    className="w-full flex items-center gap-3 px-3 py-2.5 bg-[#111318]
                      border border-white/10 rounded-xl hover:border-[#adc6ff]/30
                      transition-colors text-left cursor-pointer">
                    <span className="material-symbols-outlined text-[16px]" style={{ color }}>{icon}</span>
                    <div>
                      <div className="font-mono text-xs text-[#e2e2e8]">{label}</div>
                      <div className="font-mono text-[9px] text-[#c2c6d6]/60">{sub}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* AI Chat */}
          <AiChat
            pageHint="Layers"
            title="Ask about this image"
            compact
            className="border-t border-white/10 rounded-none flex-shrink-0"
          />
        </aside>
      </div>
    </div>
  )
}
