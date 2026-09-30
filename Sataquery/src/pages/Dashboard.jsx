import { useState, useEffect, useRef } from 'react'
import Navbar from '../components/shared/Navbar'
import Sidebar from '../components/shared/Sidebar'
import SatMap from '../components/map/SatMap'
import Cesium3DGlobe from '../components/map/Cesium3DGlobe'
import PanoramaViewer from '../components/map/PanoramaViewer'
import MapViewSwitcher from '../components/map/MapViewSwitcher'
import MapControls3D from '../components/map/MapControls3D'
import MapStatusBar from '../components/map/MapStatusBar'
import MapLegend from '../components/map/MapLegend'
import LocationSearch from '../components/map/LocationSearch'
import StatBar from '../components/shared/StatBar'
import Toggle from '../components/shared/Toggle'
import ProcessingSteps from '../components/shared/ProcessingSteps'
import { useMapState, VIEW_MODES } from '../hooks/useMapState'
import { imageryApi } from '../services/imageryApi'
import { analysisApi } from '../services/analysisApi'
import { queryApi } from '../services/queryApi'
import { projectApi } from '../services/projectApi'
import { geodataApi } from '../services/geodataApi'
import { geojsonToOverlays, buildSummary } from '../services/analysisOverlayApi'

/* ── Preset locations ── */
const PRESETS = [
  { label: 'Bengaluru, India',        center: [12.97,  77.59],  zoom: 12 },
  { label: 'Mumbai, India',           center: [19.08,  72.88],  zoom: 12 },
  { label: 'Delhi, India',            center: [28.61,  77.21],  zoom: 11 },
  { label: 'Tokyo, Japan',            center: [35.68, 139.69],  zoom: 11 },
  { label: 'London, UK',              center: [51.51,  -0.13],  zoom: 11 },
  { label: 'New York, USA',           center: [40.71, -74.01],  zoom: 11 },
  { label: 'Dubai, UAE',              center: [25.20,  55.27],  zoom: 11 },
  { label: 'Rotterdam, Netherlands',  center: [51.92,   4.48],  zoom: 12 },
  { label: 'Amazon Rainforest',       center: [-3.47, -62.21],  zoom:  7 },
  { label: 'Sahara Desert',           center: [23.0,   12.0],   zoom:  6 },
]

const TABS = ['detection', 'area', 'confidence', 'export']

const ANALYSIS_COLORS = {
  water_detection:      '#4edea3',
  vegetation_analysis:  '#6fdc8c',
  built_up_detection:   '#ffb95f',
  building_detection:   '#adc6ff',
  change_detection:     '#ffb4ab',
  landcover:            '#ffb95f',
  feature_highlighting: '#adc6ff',
}


export default function Dashboard() {
  /* ── Map state ── */
  const mapState = useMapState({
    lat: 35.68, lng: 139.69, zoom: 11,
    viewMode: VIEW_MODES.SATELLITE,
    selectedLocation: { label: 'Tokyo, Japan', lat: 35.68, lng: 139.69, zoom: 11 },
  })

  /* ── UI state ── */
  const [cursorCoords,          setCursorCoords]          = useState(null)
  const [isFullscreen,          setIsFullscreen]          = useState(false)
  const [activeTab,             setActiveTab]             = useState('detection')
  const [overlays,              setOverlays]              = useState([])
  const [uploadedImage,         setUploadedImage]         = useState(null)
  const [queryText,             setQueryText]             = useState('')
  const [processing,            setProcessing]            = useState(false)
  const [processingStage,       setProcessingStage]       = useState('')
  const [result,                setResult]                = useState(null)
  const [analysisStatus,        setAnalysisStatus]        = useState(null)
  const [error,                 setError]                 = useState('')
  const [imageError,            setImageError]            = useState('')
  const [selectedAnalysisType,  setSelectedAnalysisType]  = useState('feature_highlighting')
  const [currentProject,        setCurrentProject]        = useState('')
  const [layerToggles,          setLayerToggles]          = useState({
    water: true, vegetation: true, builtup: true,
    roads: true, buildings: true, zones: true, location: true,
  })

  const mapContainerRef = useRef(null)

  /* ── Derived view flags ── */
  const is3D      = mapState.viewMode === VIEW_MODES.THREE_D
  const isPanorama= mapState.viewMode === VIEW_MODES.PANORAMA

  /* ── Load projects ── */
  useEffect(() => {
    projectApi.list()
      .then(data => {
        const ps = data.projects || []
        if (ps.length > 0 && !currentProject) setCurrentProject(ps[0].id)
      })
      .catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Fullscreen ── */
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

  /* ── Location select (from search bar or preset) ── */
  function handleLocationSelect(loc) {
    mapState.goTo(loc)
    setOverlays([])
    setResult(null)
    setAnalysisStatus(null)
    setError('')
    try {
      const existing = JSON.parse(localStorage.getItem('satquery:context') || '{}')
      localStorage.setItem('satquery:context', JSON.stringify({
        ...existing,
        latitude: loc.center[0], longitude: loc.center[1],
        location_label: loc.label,
      }))
    } catch { /* ignore cleanup errors */ }

    // If this location came from a geodata result it carries overlays — render them
    if (loc.overlays?.length > 0) {
      setOverlays(loc.overlays)
    }
    if (loc.summary) {
      setResult(prev => prev ?? { _geodataSummary: loc.summary })
    }
  }

  /* ── Zoom controls ── */
  function handleZoomIn() {
    const map = mapState.mapInstanceRef.current
    if (map?.setZoom) map.setZoom((map.getZoom?.() || 11) + 1)
    else mapState.update({ zoom: Math.min(20, mapState.zoom + 1) })
  }
  function handleZoomOut() {
    const map = mapState.mapInstanceRef.current
    if (map?.setZoom) map.setZoom(Math.max(1, (map.getZoom?.() || 11) - 1))
    else mapState.update({ zoom: Math.max(1, mapState.zoom - 1) })
  }

  /* ── Geolocation ── */
  function handleLocate() {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      pos => mapState.goTo({ label: 'My Location', center: [pos.coords.latitude, pos.coords.longitude], zoom: 14 }),
      () => {},
    )
  }

  function handleResetNorth() {
    const map = mapState.mapInstanceRef.current
    if (map?.setHeading) map.setHeading(0)
    mapState.updateCamera(mapState.tilt, 0)
  }

  /* ── Image upload ── */
  async function handleFileUpload(file) {
    if (!file) return
    setImageError('')
    setProcessingStage('Uploading image…')
    setProcessing(true)
    try {
      const data = await imageryApi.upload(file)
      setUploadedImage({
        image_id: data.image_id, filename: data.filename, url: data.url,
        is_georeferenced: data.is_georeferenced, width: data.width, height: data.height,
        center: data.center, bounds: data.bounds, crs: data.crs, id: data.image_id,
      })
      await new Promise(resolve => {
        try {
          const reader = new FileReader()
          reader.onload = () => {
            try {
              const existing = JSON.parse(localStorage.getItem('satquery:context') || '{}')
              localStorage.setItem('satquery:context', JSON.stringify({
                ...existing, image_id: data.image_id, image_filename: data.filename,
                image_base64: reader.result, image_mime: file.type || 'image/png',
              }))
            } catch { /* ignore cleanup errors */ }
            resolve()
          }
          reader.onerror = () => resolve()
          reader.readAsDataURL(file)
        } catch { resolve() }
      })
    } catch (err) {
      setImageError(err.message || 'Image upload failed.')
      setUploadedImage(null)
    } finally { setProcessing(false); setProcessingStage('') }
  }

  /* ── Run analysis ── */
  async function runAnalysis() {
    const imageId = uploadedImage?.image_id
    if (!imageId) { setError('Upload an image first.'); return }
    setError(''); setProcessingStage('Submitting analysis…'); setProcessing(true)
    setResult(null); setOverlays([]); setAnalysisStatus(null)
    let analysisId = null
    try {
      const run = await analysisApi.runAnalysis({ imageId, analysisType: selectedAnalysisType, projectId: currentProject || undefined })
      analysisId = run.analysis_id
      setAnalysisStatus({ analysis_id: run.analysis_id, status: run.status, progress: 0 })
      setProcessingStage('Analysis queued…')
    } catch (err) {
      setError(err.message || 'Failed to start analysis.')
      setProcessing(false); setProcessingStage(''); return
    }
    try {
      const final = await analysisApi.pollUntilComplete(analysisId, ({ status, progress }) => {
        setAnalysisStatus({ analysis_id: analysisId, status, progress })
        if (status === 'processing') setProcessingStage('Processing… Running AI analysis…')
        else if (status === 'queued') setProcessingStage('Analysis queued…')
      })
      setResult(final); setProcessingStage('Analysis complete.')
      _saveAnalysisContext(final)
      if (final?.visual_evidence?.geojson) {
        fetch(final.visual_evidence.geojson).then(r => r.json()).then(geojson => {
          setOverlays(geojsonToOverlays(geojson, ANALYSIS_COLORS[selectedAnalysisType] || '#4edea3', selectedAnalysisType))
        }).catch(() => {})
      }
    } catch (err) {
      setError(err.message || 'Analysis failed.')
      setProcessingStage('')
    } finally { setProcessing(false) }
  }

  /* ── Natural-language query ── */
  async function handleQuerySubmit(e) {
    e.preventDefault()
    if (!queryText.trim()) return
    setError(''); setProcessingStage('Understanding query…'); setProcessing(true)
    setResult(null); setAnalysisStatus(null)

    // ── Step 1: Try geodata (location + OSM features) in parallel with AI analysis ──
    // Fire off the geodata request immediately — it's fast and independent of image upload.
    const geodataPromise = geodataApi.queryAndParse(queryText).catch(() => null)

    try {
      const res = await queryApi.submit({
        query: queryText, imageId: uploadedImage?.image_id,
        location: mapState.selectedLocation?.label || '', projectId: currentProject || undefined,
      })
      setAnalysisStatus({ analysis_id: res.analysis_id, status: res.status, progress: 0, task: res.task })
      setProcessingStage('Query parsed — analysis queued.')
      setQueryText('')

      // ── Step 2: Resolve geodata result and fly map / set OSM overlays ──
      const geodata = await geodataPromise
      if (geodata) {
        mapState.goTo(geodata.location)
        setOverlays(geodata.overlays)
        try {
          const existing = JSON.parse(localStorage.getItem('satquery:context') || '{}')
          localStorage.setItem('satquery:context', JSON.stringify({
            ...existing,
            latitude:       geodata.location.center[0],
            longitude:      geodata.location.center[1],
            location_label: geodata.location.label,
          }))
        } catch { /* ignore */ }
      }

      // ── Step 3: Poll AI analysis to completion and merge overlays ──
      try {
        const final = await analysisApi.pollUntilComplete(res.analysis_id, ({ status, progress }) => {
          setAnalysisStatus({ analysis_id: res.analysis_id, status, progress })
        })
        setResult(final); setProcessingStage('Analysis complete.')
        _saveAnalysisContext(final)
        if (final?.visual_evidence?.geojson) {
          fetch(final.visual_evidence.geojson).then(r => r.json()).then(geojson => {
            setOverlays(geojsonToOverlays(geojson, ANALYSIS_COLORS[final.task] || '#4edea3', ''))
          }).catch(() => {})
        }
      } catch (pollErr) { setError(pollErr.message || 'Analysis failed.') }
    } catch (err) {
      // If analysis queue fails, still show geodata result if available
      const geodata = await geodataPromise
      if (geodata) {
        mapState.goTo(geodata.location)
        setOverlays(geodata.overlays)
        setProcessingStage('Location found.')
      } else {
        setError(err.message || 'Query failed.')
      }
    }
    finally { setProcessing(false) }
  }

  function _saveAnalysisContext(final) {
    try {
      const existing = JSON.parse(localStorage.getItem('satquery:context') || '{}')
      localStorage.setItem('satquery:context', JSON.stringify({
        ...existing, analysis_type: final.task, analysis_id: final.id,
        detection_count: final.statistics?.detection_count ?? (final.detections?.length ?? 0),
        total_area_m2: final.statistics?.total_area_m2 ?? null,
        coverage_percent: final.statistics?.coverage_percent ?? null,
        confidence: final.confidence ?? null, method: final.method ?? null,
      }))
    } catch { /* ignore cleanup errors */ }
  }

  function clearResult() {
    setResult(null); setOverlays([]); setAnalysisStatus(null)
    setError(''); setUploadedImage(null); setImageError(''); setQueryText('')
  }

  function toggleLayer(key) {
    setLayerToggles(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const summary    = result ? buildSummary(result) : null
  const statusText = result ? 'COMPLETED' : analysisStatus ? analysisStatus.status.toUpperCase() : null

  /* ── Render map content based on viewMode ── */
  function renderMapArea() {
    if (is3D) {
      return (
        <Cesium3DGlobe
          mapState={mapState}
          overlays={overlays}
          onMouseMove={setCursorCoords}
          className="absolute inset-0"
        />
      )
    }
    if (isPanorama) {
      return (
        <PanoramaViewer
          location={mapState.selectedLocation}
          onExit={() => mapState.setViewMode(VIEW_MODES.SATELLITE)}
          className="absolute inset-0"
        />
      )
    }
    // MAP or SATELLITE — both use SatMap with different tile layers
    return (
      <SatMap
        center={[mapState.lat, mapState.lng]}
        zoom={mapState.zoom}
        viewMode={mapState.viewMode}
        overlays={overlays}
        onMapReady={mapState.setMapInstance}
        onMouseMove={setCursorCoords}
        className="absolute inset-0"
      />
    )
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[#0b0c10]">
      <Navbar />

      <div className="flex flex-1 overflow-hidden">
        {/* ── Sidebar ── */}
        <Sidebar activeKey="Neural Chat" />

        {/* ── Main map area ── */}
        <main ref={mapContainerRef} className="flex-1 relative overflow-hidden">

          {/* ── Map / 3D / Panorama ── */}
          {renderMapArea()}

          {/* ── Overlaid controls (hidden in panorama — it has its own chrome) ── */}
          {!isPanorama && (
            <>
              {/* Location search — top-left */}
              <div className="absolute top-4 left-4 z-[500]">
                <LocationSearch onSelect={handleLocationSelect} presets={PRESETS} />
              </div>

              {/* View mode switcher — right side */}
              <MapViewSwitcher
                viewMode={mapState.viewMode}
                onSelect={mapState.setViewMode}
                className="absolute top-4 right-14 z-[500]"
              />

              {/* Map controls — far right */}
              <MapControls3D
                mapState={mapState}
                onZoomIn={handleZoomIn}
                onZoomOut={handleZoomOut}
                onLocate={handleLocate}
                onResetNorth={handleResetNorth}
                onFullscreen={handleFullscreen}
                isFullscreen={isFullscreen}
                className="absolute top-4 right-4 z-[500]"
              />

              {/* Upload button — top-left below the location search bar */}
              <div className="absolute top-[3.75rem] left-4 z-[500] flex flex-col gap-2 items-start">
                {!uploadedImage ? (
                  <label className="flex items-center gap-2 bg-[#111318]/95 backdrop-blur-sm text-[#adc6ff]
                    border border-[#adc6ff]/40 px-4 py-2.5 rounded-xl font-mono text-xs font-bold
                    hover:bg-[#1a1c20] hover:border-[#adc6ff] transition-all cursor-pointer shadow-xl select-none">
                    <span className="material-symbols-outlined text-[16px]">upload_file</span>
                    Upload Satellite Image
                    <input type="file" accept="image/png,image/jpeg,image/tiff"
                      onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); e.target.value = '' }}
                      className="hidden" />
                  </label>
                ) : (
                  <div className="flex items-center gap-2 bg-[#111318]/95 backdrop-blur-sm
                    border border-[#4edea3]/30 rounded-xl px-4 py-2.5 shadow-xl">
                    <span className="material-symbols-outlined text-[16px] text-[#4edea3]">image</span>
                    <span className="font-mono text-xs text-[#c2c6d6] max-w-[160px] truncate">{uploadedImage.filename}</span>
                    {uploadedImage.is_georeferenced
                      ? <span className="text-[9px] font-mono bg-[#4edea3]/15 text-[#4edea3] px-1.5 py-0.5 rounded">GEO</span>
                      : <span className="text-[9px] font-mono bg-white/5 text-[#c2c6d6]/40 px-1.5 py-0.5 rounded">IMAGE</span>
                    }
                    <button onClick={clearResult}
                      className="material-symbols-outlined text-[15px] text-[#c2c6d6]/40 hover:text-[#ffb4ab] transition-colors ml-1">
                      close
                    </button>
                  </div>
                )}
                {imageError && (
                  <div className="bg-[#ffb4ab]/10 border border-[#ffb4ab]/30 rounded-lg px-3 py-2
                    text-xs text-[#ffb4ab] font-mono max-w-[220px]">{imageError}</div>
                )}
              </div>

              {/* Map overlay legend */}
              {overlays.length > 0 && (
                <MapLegend overlays={overlays} result={result} onClear={clearResult}
                  className="absolute bottom-28 left-4 z-[500]" />
              )}

              {/* SatQuery Insight badge */}
              <div className="absolute bottom-20 left-4 z-[500] glass-panel rounded-xl p-4 max-w-xs">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="material-symbols-outlined text-[14px] text-[#adc6ff]">bolt</span>
                  <span className="font-mono text-[10px] text-[#adc6ff] font-bold">SatQuery Insight</span>
                </div>
                <p className="text-xs text-[#c2c6d6] leading-relaxed">
                  {result
                    ? (summary?.summary || 'Analysis complete. Check detections on the right panel.')
                    : processing
                      ? 'Scanning satellite imagery and running AI analysis…'
                      : 'Select a location and upload an image, or ask a question below.'}
                </p>
              </div>

              {/* Analysis status */}
              {analysisStatus && !result && (
                <div className="absolute top-20 left-4 z-[500] glass-panel rounded-xl p-3 max-w-xs text-xs font-mono">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[#c2c6d6]">Analysis status</span>
                    <span className={statusText === 'QUEUED' ? 'text-[#ffb95f]' : statusText === 'PROCESSING' ? 'text-[#adc6ff]' : 'text-[#ffb4ab]'}>
                      {statusText}
                    </span>
                  </div>
                  {analysisStatus.progress != null && (
                    <div className="stat-bar mt-2">
                      <div className="stat-bar-fill" style={{ width: `${analysisStatus.progress}%` }} />
                    </div>
                  )}
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="absolute top-20 left-4 z-[500] glass-panel rounded-xl p-3
                  max-w-xs text-xs text-[#ffb4ab] font-mono border border-[#ffb4ab]/30">{error}</div>
              )}

              {/* Processing steps */}
              {processing && (
                <div className="absolute top-20 left-4 z-[500] flex flex-col gap-3">
                  <div className="glass-panel rounded-xl p-3 max-w-xs text-xs font-mono text-[#c2c6d6]">{processingStage}</div>
                  <ProcessingSteps running={processing} />
                </div>
              )}

              {/* Status bar — coordinate readout */}
              <MapStatusBar
                mapState={mapState}
                cursorCoords={cursorCoords}
                className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[500]"
              />

              {/* Query bar */}
              <div className="absolute bottom-4 left-4 right-4 z-[500]">
                <form onSubmit={handleQuerySubmit}
                  className="glass-panel rounded-xl flex items-center gap-3 px-4 py-3 shadow-2xl max-w-xl mx-auto">
                  <span className="font-mono text-[#adc6ff] text-lg flex-shrink-0">&gt;</span>
                  <input
                    value={queryText} onChange={e => setQueryText(e.target.value)}
                    placeholder="Ask anything… e.g. 'Show water bodies' or 'Analyze this area'"
                    className="flex-1 bg-transparent border-none text-sm text-[#e2e2e8] font-mono
                      placeholder:text-[#c2c6d6]/35 focus:ring-0 focus:outline-none min-w-0"
                  />
                  <button type="submit" disabled={processing}
                    className="bg-[#adc6ff]/15 text-[#adc6ff] border border-[#adc6ff]/30 px-4 py-1.5
                      rounded font-mono text-xs hover:bg-[#adc6ff]/25 transition-colors
                      disabled:opacity-50 flex items-center gap-1.5 flex-shrink-0">
                    {processing
                      ? <span className="w-3 h-3 border-2 border-[#adc6ff]/30 border-t-[#adc6ff] rounded-full animate-spin-slow" />
                      : <span className="material-symbols-outlined text-[15px]">send</span>
                    }
                    EXECUTE
                  </button>
                </form>
              </div>
            </>
          )}
        </main>

        {/* ── Right panel — Live Analysis ── */}
        <aside className="w-72 border-l border-white/10 bg-[#0c0e12] flex flex-col overflow-hidden flex-shrink-0">
          {/* Header */}
          <div className="p-4 border-b border-white/10">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="material-symbols-outlined text-[16px] text-[#4edea3]">bar_chart</span>
              <span className="font-mono text-xs font-bold text-[#4edea3]">Live Analysis</span>
            </div>
            <div className="font-mono text-[9px] text-[#c2c6d6]/60">Real-time telemetry</div>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-white/10 px-1 overflow-x-auto">
            {TABS.map(t => (
              <button key={t} onClick={() => setActiveTab(t)}
                className={`px-3 py-2 font-mono text-[10px] whitespace-nowrap border-b-2 transition-colors capitalize ${
                  activeTab === t ? 'text-[#adc6ff] border-[#adc6ff]' : 'text-[#8c909f] border-transparent hover:text-[#c2c6d6]'
                }`}>
                {t}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto scroll-thin p-4 flex flex-col gap-4">

            {/* ────────────────────────────────────────
                DETECTION TAB
            ──────────────────────────────────────── */}
            {activeTab === 'detection' && (
              <>
                {/* ── Idle state — nothing uploaded or running ── */}
                {!result && !processing && (
                  <div className="flex flex-col gap-3">

                    {/* Location context pill */}
                    {mapState.selectedLocation && (
                      <div className="flex items-center gap-2 px-3 py-2 bg-[#111318] border border-white/8 rounded-lg">
                        <span className="material-symbols-outlined text-[13px] text-[#adc6ff]">location_on</span>
                        <span className="font-mono text-[9px] text-[#c2c6d6]/80 truncate">
                          {mapState.selectedLocation.label}
                        </span>
                      </div>
                    )}

                    {/* Awaiting-image prompt */}
                    {!uploadedImage && (
                      <div className="flex flex-col items-center gap-3 py-8 px-2">
                        {/* Animated radar ring */}
                        <div className="relative w-14 h-14 flex items-center justify-center">
                          <div className="absolute inset-0 rounded-full border border-[#adc6ff]/10" />
                          <div className="absolute inset-1 rounded-full border border-[#adc6ff]/15" />
                          <div className="absolute inset-3 rounded-full border border-[#adc6ff]/20" />
                          <span className="material-symbols-outlined text-[22px] text-[#adc6ff]/50">satellite_alt</span>
                        </div>
                        <div className="text-center">
                          <p className="font-mono text-[11px] text-[#c2c6d6]/70 font-bold mb-1">
                            No image loaded
                          </p>
                          <p className="font-mono text-[9px] text-[#c2c6d6]/40 leading-relaxed">
                            Upload a satellite image using<br />
                            the button on the map to begin<br />
                            AI analysis.
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Image loaded — ready to run */}
                    {uploadedImage && (
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2 px-3 py-2.5 bg-[#4edea3]/8
                          border border-[#4edea3]/20 rounded-lg">
                          <span className="material-symbols-outlined text-[15px] text-[#4edea3]">check_circle</span>
                          <div className="min-w-0">
                            <p className="font-mono text-[10px] text-[#4edea3] font-bold">Image ready</p>
                            <p className="font-mono text-[9px] text-[#c2c6d6]/50 truncate">
                              {uploadedImage.filename}
                            </p>
                          </div>
                        </div>
                        <p className="font-mono text-[9px] text-[#c2c6d6]/40 text-center pt-1">
                          Select an analysis type below and<br />click <span className="text-[#adc6ff]">Run Analysis</span>.
                        </p>
                      </div>
                    )}

                    {/* What the AI can detect — collapsed informational list */}
                    <div className="border border-white/8 rounded-xl overflow-hidden">
                      <div className="px-3 py-2 border-b border-white/8 flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[11px] text-[#c2c6d6]/40">info</span>
                        <span className="font-mono text-[8px] text-[#c2c6d6]/40 uppercase tracking-widest">
                          Detectable features
                        </span>
                      </div>
                      {[
                        { icon: 'water_drop',     color: '#4edea3', label: 'Water Bodies',  sub: 'Rivers · Lakes · Reservoirs' },
                        { icon: 'forest',          color: '#6fdc8c', label: 'Vegetation',    sub: 'Forest · Crops · Sparse veg' },
                        { icon: 'location_city',   color: '#adc6ff', label: 'Built-up Areas', sub: 'Buildings · Roads · Urban' },
                        { icon: 'compare',         color: '#ffb4ab', label: 'Change',        sub: 'Before / after detection' },
                      ].map((item, i, arr) => (
                        <div
                          key={item.label}
                          className={`flex items-center gap-2.5 px-3 py-2 bg-[#0c0e12]/60
                            ${i < arr.length - 1 ? 'border-b border-white/5' : ''}`}
                        >
                          <span
                            className="material-symbols-outlined text-[14px] flex-shrink-0"
                            style={{ color: item.color }}
                          >
                            {item.icon}
                          </span>
                          <div className="min-w-0">
                            <p className="font-mono text-[10px] text-[#c2c6d6]/80">{item.label}</p>
                            <p className="font-mono text-[8px] text-[#c2c6d6]/35">{item.sub}</p>
                          </div>
                        </div>
                      ))}
                    </div>

                  </div>
                )}

                {processing && (
                  <div className="flex flex-col gap-3">
                    <div className="font-mono text-[9px] text-[#adc6ff]/70 uppercase tracking-widest">Running Analysis</div>
                    {['Preprocessing image', 'Running AI model', 'Extracting features', 'Generating overlays'].map((step, i) => (
                      <div key={step} className="flex items-center gap-2 bg-[#111318] border border-white/10 rounded-lg px-3 py-2">
                        <span className={`w-1.5 h-1.5 rounded-full ${i === 1 ? 'bg-[#adc6ff] animate-pulse' : i === 0 ? 'bg-[#4edea3]' : 'bg-white/20'}`} />
                        <span className="font-mono text-[9px] text-[#c2c6d6]">{step}</span>
                      </div>
                    ))}
                  </div>
                )}

                {result && (
                  <>
                    <div className="bg-[#4edea3]/8 border border-[#4edea3]/20 rounded-xl p-3 flex items-center gap-2">
                      <span className="material-symbols-outlined text-[16px] text-[#4edea3]">check_circle</span>
                      <div>
                        <div className="font-mono text-[10px] text-[#4edea3] font-bold">Analysis Complete</div>
                        <div className="font-mono text-[9px] text-[#c2c6d6]/60">{result.task?.replace(/_/g, ' ')}</div>
                      </div>
                    </div>
                    <div className="bg-[#111318] border border-white/10 rounded-xl p-3 flex flex-col gap-2">
                      <div className="flex justify-between items-center">
                        <span className="font-mono text-[10px] text-[#c2c6d6]">Detections</span>
                        <span className="material-symbols-outlined text-[14px] text-[#4edea3]">radar</span>
                      </div>
                      <div className="text-2xl font-bold text-[#e2e2e8]">
                        {summary?.count ?? 0}
                        <span className="text-sm font-normal text-[#4edea3] ml-1">found</span>
                      </div>
                      <div className="font-mono text-[9px] text-[#c2c6d6]/50">{summary?.summary || '—'}</div>
                    </div>
                    <div className="bg-[#111318] border border-white/10 rounded-xl p-3 flex flex-col gap-2">
                      <div className="flex justify-between">
                        <span className="font-mono text-[10px] text-[#c2c6d6]">Model Confidence</span>
                        <span className="font-mono text-[10px] text-[#adc6ff] font-bold">
                          {summary?.confidence != null ? `${(summary.confidence * 100).toFixed(1)}%` : '—'}
                        </span>
                      </div>
                      <StatBar value={summary?.confidence != null ? summary.confidence * 100 : 0} />
                    </div>
                    <div className="bg-[#111318] border border-white/10 rounded-xl p-3 flex items-center justify-between">
                      <span className="font-mono text-[10px] text-[#c2c6d6]">Visual Overlays</span>
                      <Toggle defaultOn={true} />
                    </div>
                    {uploadedImage && (
                      <button onClick={runAnalysis} disabled={processing}
                        className="w-full flex items-center justify-center gap-2 py-2.5
                          bg-[#adc6ff]/15 border border-[#adc6ff]/30 rounded-xl
                          font-mono text-xs text-[#adc6ff] hover:bg-[#adc6ff]/25 transition-colors disabled:opacity-50">
                        <span className="material-symbols-outlined text-[15px]">refresh</span>
                        Re-run Analysis
                      </button>
                    )}
                  </>
                )}

                {/* Analysis type selector */}
                <div className="bg-[#111318] border border-white/10 rounded-xl p-3">
                  <div className="font-mono text-[10px] text-[#c2c6d6] mb-2">Analysis Type</div>
                  <select
                    value={selectedAnalysisType}
                    onChange={e => setSelectedAnalysisType(e.target.value)}
                    className="w-full bg-[#0c0e12] text-[#c2c6d6] border border-white/10 rounded
                      px-2 py-1.5 font-mono text-xs focus:ring-0 focus:outline-none">
                    {Object.entries(analysisApi.ANALYSIS_TYPES || {
                      feature_highlighting: 'Feature Highlighting',
                      water_detection: 'Water Detection',
                      vegetation_analysis: 'Vegetation Analysis',
                      built_up_detection: 'Built-up Detection',
                      building_detection: 'Building Detection',
                      change_detection: 'Change Detection',
                      landcover: 'Land Cover',
                    }).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </div>

                {uploadedImage && !result && (
                  <button onClick={runAnalysis} disabled={processing}
                    className="w-full flex items-center justify-center gap-2 py-2.5
                      bg-[#adc6ff]/15 border border-[#adc6ff]/30 rounded-xl
                      font-mono text-xs text-[#adc6ff] hover:bg-[#adc6ff]/25 transition-colors disabled:opacity-50">
                    {processing
                      ? <span className="w-3 h-3 border-2 border-[#adc6ff]/30 border-t-[#adc6ff] rounded-full animate-spin-slow" />
                      : <span className="material-symbols-outlined text-[15px]">play_arrow</span>
                    }
                    Run Analysis
                  </button>
                )}
              </>
            )}

            {/* ────────────────────────────────────────
                AREA TAB
            ──────────────────────────────────────── */}
            {activeTab === 'area' && (
              <div className="flex flex-col gap-3">
                {result && summary ? (
                  <>
                    <div className="bg-[#111318] border border-white/10 rounded-xl p-3 flex flex-col gap-2">
                      <div className="font-mono text-[10px] text-[#c2c6d6] mb-1">Detected Area</div>
                      <div className="text-3xl font-bold text-[#e2e2e8]">
                        {summary.totalAreaM2 != null ? (summary.totalAreaM2 / 1e6).toFixed(3) : '0.000'}
                        <span className="text-sm font-normal text-[#c2c6d6] ml-1">km²</span>
                      </div>
                      <StatBar value={summary.coveragePercent ?? 0} />
                    </div>
                    <div className="bg-[#111318] border border-white/10 rounded-xl p-3 flex flex-col gap-2">
                      <div className="font-mono text-[10px] text-[#c2c6d6] mb-1">Area Breakdown</div>
                      {[
                        ['Detections', summary.count, ANALYSIS_COLORS[selectedAnalysisType]],
                        summary.totalAreaM2 != null && ['Area (m²)', summary.totalAreaM2?.toLocaleString(), '#c2c6d6'],
                        summary.coveragePercent != null && ['Coverage', `${summary.coveragePercent}%`, '#adc6ff'],
                        summary.method && ['Method', summary.method, '#c2c6d6'],
                      ].filter(Boolean).map(([label, value, color]) => (
                        <div key={label} className="flex justify-between text-xs font-mono py-1 border-b border-white/5">
                          <span className="text-[#c2c6d6]">{label}</span>
                          <span style={{ color }}>{value}</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="bg-[#111318] border border-white/10 rounded-xl p-4 text-center">
                    <span className="material-symbols-outlined text-[28px] text-[#c2c6d6]/20 block mb-2">area_chart</span>
                    <p className="font-mono text-[9px] text-[#c2c6d6]/50">No area data yet. Run analysis first.</p>
                  </div>
                )}
              </div>
            )}

            {/* ────────────────────────────────────────
                CONFIDENCE TAB
            ──────────────────────────────────────── */}
            {activeTab === 'confidence' && (
              <div className="flex flex-col gap-3">
                {result && summary?.confidence != null ? (
                  <div className="bg-[#111318] border border-white/10 rounded-xl p-3 flex flex-col gap-3">
                    <div className="font-mono text-[10px] text-[#c2c6d6]">Model Confidence</div>
                    <div className="text-3xl font-bold text-[#adc6ff]">
                      {(summary.confidence * 100).toFixed(1)}%
                    </div>
                    <StatBar value={summary.confidence * 100} />
                    <div className="font-mono text-[9px] text-[#c2c6d6]/50">{result.method || 'AI model inference'}</div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3 py-8 px-2">
                    <span className="material-symbols-outlined text-[32px] text-[#c2c6d6]/15">
                      query_stats
                    </span>
                    <p className="font-mono text-[9px] text-[#c2c6d6]/40 text-center leading-relaxed">
                      Confidence scores appear here<br />after you run an analysis.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* ────────────────────────────────────────
                EXPORT TAB
            ──────────────────────────────────────── */}
            {activeTab === 'export' && (
              <div className="flex flex-col gap-2">
                {result ? (
                  [
                    { icon: 'description', color: '#adc6ff', label: 'GeoJSON',    sub: 'Vector polygons',   available: !!result.visual_evidence?.geojson },
                    { icon: 'image',       color: '#ffb95f', label: 'Mask PNG',   sub: 'Segmentation mask', available: !!result.visual_evidence?.mask },
                    { icon: 'table_chart', color: '#4edea3', label: 'Statistics', sub: 'Tabular data',      available: true },
                    { icon: 'article',     color: '#ffb95f', label: 'Annotated',  sub: 'Annotated image',   available: !!result.visual_evidence?.annotated_image },
                  ].map(({ icon, color, label, sub, available }) => (
                    <button key={label} disabled={!available}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 bg-[#111318] border rounded-xl text-left transition-colors ${
                        available ? 'border-white/15 hover:border-white/25 cursor-pointer' : 'border-white/5 opacity-40 cursor-not-allowed'
                      }`}>
                      <span className="material-symbols-outlined text-[16px]" style={{ color }}>{icon}</span>
                      <div>
                        <div className="font-mono text-[10px] text-[#e2e2e8]">{label}</div>
                        <div className="font-mono text-[9px] text-[#c2c6d6]/50">{sub}</div>
                      </div>
                      {available && <span className="material-symbols-outlined text-[14px] text-[#c2c6d6]/40 ml-auto">download</span>}
                    </button>
                  ))
                ) : (
                  <div className="bg-[#111318] border border-white/10 rounded-xl p-4 text-center">
                    <span className="material-symbols-outlined text-[28px] text-[#c2c6d6]/20 block mb-2">download</span>
                    <p className="font-mono text-[9px] text-[#c2c6d6]/50">Run analysis to unlock export options.</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Layer toggles panel ── */}
          <div className="border-t border-white/10 p-3 flex flex-col gap-2 flex-shrink-0">
            <div className="font-mono text-[8px] text-[#c2c6d6]/40 uppercase tracking-widest mb-1">Layer Visibility</div>
            {[
              { key: 'water',      color: '#4edea3', label: 'Water Bodies' },
              { key: 'vegetation', color: '#6fdc8c', label: 'Vegetation' },
              { key: 'builtup',    color: '#ffb95f', label: 'Built-up Areas' },
              { key: 'roads',      color: '#c7c7c7', label: 'Roads' },
              { key: 'buildings',  color: '#adc6ff', label: 'Buildings' },
              { key: 'location',   color: '#adc6ff', label: 'Location Marker' },
            ].map(({ key, color, label }) => (
              <div key={key} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                  <span className="font-mono text-[9px] text-[#c2c6d6]">{label}</span>
                </div>
                <button
                  onClick={() => toggleLayer(key)}
                  className={`w-8 h-4 rounded-full transition-colors relative flex-shrink-0 ${layerToggles[key] ? 'bg-[#4edea3]/70' : 'bg-white/10'}`}
                >
                  <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${layerToggles[key] ? 'right-0.5' : 'left-0.5'}`} />
                </button>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  )
}
