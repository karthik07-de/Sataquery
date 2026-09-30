import { useCallback, useRef, useState } from 'react'
import Navbar from '../components/shared/Navbar'
import StatBar from '../components/shared/StatBar'
import GoogleSatMap from '../components/map/GoogleSatMap'
import { reportApi } from '../services/reportApi'

const CENTER = [-8.0, -79.0]
const ZOOM   = 10

/* overlays shown ONLY on the "after" (dark) map */
const AFTER_OVERLAYS = [
  { type:'rectangle', bounds:[[-8.05,-79.10],[-7.95,-78.95]], color:'#4edea3' },
  { type:'rectangle', bounds:[[-8.12,-79.05],[-8.08,-79.00]], color:'#4edea3' },
  { type:'rectangle', bounds:[[-8.02,-79.08],[-8.00,-79.05]], color:'#ffb4ab' },
  { type:'rectangle', bounds:[[-7.98,-78.98],[-7.96,-78.94]], color:'#ffb4ab' },
]

const MORPHOLOGY = [
  { label:'Residential',   color:'#adc6ff', value:'+8.3%'  },
  { label:'Industrial',    color:'#4edea3', value:'+11.5%' },
  { label:'Infrastructure',color:'#ffb95f', value:'+2.3%'  },
  { label:'Deforested',    color:'#ffb4ab', value:'-12.4%' },
]

const MODES = [
  { key:'swipe', icon:'swap_horiz',  label:'Swipe'            },
  { key:'side',  icon:'view_column', label:'Side-by-Side'     },
  { key:'diff',  icon:'difference',  label:'Difference Overlay'},
]

const ARCHIVE = [
  { label:'Coastal Sector 7A',          sub:"Jun'24 → Jun'26", active:true },
  { label:'Amazon Basin – Deforestation',sub:"Jan'23 → Jan'26"             },
  { label:'Dubai Urban Sprawl',          sub:'2020 → 2026'                 },
  { label:'Aral Sea Water Level',        sub:'2010 → 2026'                 },
]

export default function ChangeDetection() {
  const beforeMapRef   = useRef(null)
  const afterMapRef    = useRef(null)
  const containerRef   = useRef(null)
  const dragging       = useRef(false)
  const [mode, setMode] = useState('swipe')
  const [pct,  setPct]  = useState(50)

  /* ── Report generation state ── */
  const [reportLoading, setReportLoading] = useState(false)
  const [reportError,   setReportError]   = useState(null)
  const [reportDone,    setReportDone]    = useState(false)

  async function handleGenerateReport() {
    setReportError(null)
    setReportDone(false)

    // Read the last completed analysis_id from localStorage
    let analysisId = null
    try {
      const ctx = JSON.parse(localStorage.getItem('satquery:context') || 'null')
      analysisId = ctx?.analysis_id || null
    } catch { /* nothing stored */ }

    if (!analysisId) {
      setReportError('No completed analysis found. Run a change detection analysis on the Dashboard first.')
      return
    }

    setReportLoading(true)
    try {
      await reportApi.generateAndDownload(analysisId, 'markdown')
      setReportDone(true)
    } catch (err) {
      setReportError(err.message || 'Report generation failed.')
    } finally {
      setReportLoading(false)
    }
  }

  /* keep both maps in sync */
  function syncCenter(sourceRef, targetRef) {
    const src = sourceRef.current
    const tgt = targetRef.current
    if (!src || !tgt) return
    src.addListener('center_changed', () => tgt.setCenter(src.getCenter()))
    src.addListener('zoom_changed',   () => tgt.setZoom(src.getZoom()))
  }

  const onBeforeLoad = useCallback(map => {
    beforeMapRef.current = map
    syncCenter(beforeMapRef, afterMapRef)
  }, [])

  const onAfterLoad = useCallback(map => {
    afterMapRef.current = map
    syncCenter(afterMapRef, beforeMapRef)
  }, [])

  /* swipe drag */
  function onMouseMove(e) {
    if (!dragging.current || mode !== 'swipe') return
    const rect = containerRef.current.getBoundingClientRect()
    setPct(Math.max(5, Math.min(95, ((e.clientX - rect.left) / rect.width) * 100)))
  }

  /* clip style for "after" pane based on mode */
  function afterStyle() {
    if (mode === 'swipe') return { clipPath:`inset(0 ${100 - pct}% 0 0)` }
    if (mode === 'side')  return { clipPath:'inset(0 0 0 50%)' }
    return { opacity:'0.55' }
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[#0b0c10]">
      <Navbar />
      <div className="flex flex-1 overflow-hidden">

        {/* ── Left sidebar ── */}
        <aside className="w-[220px] min-w-[220px] border-r border-white/10 bg-[#0c0e12] flex flex-col overflow-hidden flex-shrink-0">
          {/* compact brand */}
          <div className="px-3 py-2.5 border-b border-white/10 flex items-center gap-2">
            <img
              src="https://lh3.googleusercontent.com/aida/AEtjO1WtOLcDt1Rxm1vZq_fraHn5KVZyReJyM_fhPP-LB5CadEKBa0jT-1SvbpF7mpZE8GZ8OUJcCEXyKHylnjj2Wqia21_SQbJy-9r8wvdyB-Gji7vA0-zsPek7FXw99dK5BMBqEBQJv5Ba_T1I7gJ4ZWwceQBhS8dD_UvOkoVCg7_vwnukDH2ESJykJ6E4CgnydJCHzih-vAYpLxb7WLZwL_ltTBt62_PNAfmWrfxpdMl3KGNdP1eFTlwuzQ"
              alt="" style={{ width:24, height:24, borderRadius:4, objectFit:'cover', flexShrink:0 }}
            />
            <div className="leading-tight">
              <div className="font-mono text-[11px] font-bold text-[#e2e2e8]">
                SatQuery<span className="text-[#adc6ff]">AI</span>
              </div>
              <div className="font-mono text-[9px] text-[#c2c6d6]/50">Orbital Intelligence</div>
            </div>
          </div>

          {/* nav */}
          <div className="p-3">
            <a href="/missions"
              className="flex items-center justify-center gap-2 w-full py-2 bg-[#adc6ff]/10 hover:bg-[#adc6ff]/20
                         border border-[#adc6ff]/20 rounded-lg font-mono text-xs text-[#adc6ff] transition-colors">
              <span className="material-symbols-outlined text-[16px]">add</span> New Analysis
            </a>
          </div>
          {[
            { icon:'chat_bubble',label:'Neural Chat',to:'/dashboard' },
            { icon:'history',    label:'History',    to:'/missions'  },
            { icon:'layers',     label:'Layers',     to:'/layers'    },
            { icon:'bar_chart',  label:'Analytics',  to:'/analytics' },
            { icon:'folder',     label:'Projects',   to:'/missions'  },
          ].map(item => (
            <a key={item.label} href={item.to}
              className="mx-2 flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px]
                         text-[#c2c6d6] hover:bg-white/[0.06] hover:text-[#e2e2e8] transition-colors">
              <span className="material-symbols-outlined text-[18px]">{item.icon}</span>
              {item.label}
            </a>
          ))}

          {/* archive list */}
          <div className="px-3 mt-4 flex-1 overflow-y-auto scroll-thin">
            <div className="font-mono text-[9px] text-[#c2c6d6]/60 uppercase tracking-widest mb-2 px-1">
              Saved Comparisons
            </div>
            <div className="flex flex-col gap-1">
              {ARCHIVE.map(a => (
                <div key={a.label}
                  className={`p-2 rounded-lg cursor-pointer transition-colors ${
                    a.active ? 'bg-[#adc6ff]/10 border border-[#adc6ff]/20' : 'hover:bg-white/[0.05]'
                  }`}>
                  <div className={`font-mono text-[10px] ${a.active ? 'text-[#adc6ff]' : 'text-[#e2e2e8]'}`}>
                    {a.label}
                  </div>
                  <div className="font-mono text-[9px] text-[#c2c6d6]/60">{a.sub}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="px-4 pb-3 flex flex-col gap-1 border-t border-white/10 pt-3">
            <a href="#" className="flex items-center gap-2 text-[11px] text-[#c2c6d6]/60 hover:text-[#c2c6d6] transition-colors">
              <span className="material-symbols-outlined text-[14px]">help_outline</span> Support
            </a>
            <a href="#" className="flex items-center gap-2 text-[11px] text-[#c2c6d6]/60 hover:text-[#c2c6d6] transition-colors">
              <span className="material-symbols-outlined text-[14px]">wifi_tethering</span> System Status
            </a>
          </div>
        </aside>

        {/* ── Map swipe area ── */}
        <main
          ref={containerRef}
          className="flex-1 relative overflow-hidden select-none"
          style={{ cursor: mode === 'swipe' ? 'col-resize' : 'default' }}
          onMouseMove={onMouseMove}
          onMouseUp={() => { dragging.current = false }}
          onMouseLeave={() => { dragging.current = false }}
          onTouchMove={e => {
            if (!dragging.current) return
            const rect = containerRef.current.getBoundingClientRect()
            setPct(Math.max(5, Math.min(95, ((e.touches[0].clientX - rect.left) / rect.width) * 100)))
          }}
          onTouchEnd={() => { dragging.current = false }}
        >
          {/* Date labels */}
          <div className="absolute top-3 left-4 z-[600] glass-panel rounded-lg px-3 py-1.5 font-mono text-[10px] text-[#e2e2e8] flex items-center gap-2">
            <span className="material-symbols-outlined text-[12px] text-[#c2c6d6]">calendar_month</span>
            Jun 2024 (Before)
          </div>
          <div className="absolute top-3 z-[600] glass-panel rounded-lg px-3 py-1.5 font-mono text-[10px] text-[#e2e2e8] flex items-center gap-2"
            style={{ right: 316 }}>
            <span className="material-symbols-outlined text-[12px] text-[#4edea3]">calendar_month</span>
            Jun 2026 (After)
          </div>

          {/* BEFORE map – satellite (full size, behind) */}
          <div className="absolute inset-0">
            <GoogleSatMap
              center={CENTER}
              zoom={ZOOM}
              mapStyle="satellite"
              overlays={[]}
              onMapReady={onBeforeLoad}
            />
          </div>

          {/* AFTER map – dark + change overlays (clipped) */}
          <div className="absolute inset-0 transition-none" style={afterStyle()}>
            <GoogleSatMap
              center={CENTER}
              zoom={ZOOM}
              mapStyle="dark"
              overlays={AFTER_OVERLAYS}
              onMapReady={onAfterLoad}
            />
          </div>

          {/* Swipe handle */}
          {mode === 'swipe' && (
            <div
              className="swipe-handle"
              style={{ left: `${pct}%` }}
              onMouseDown={e => { e.preventDefault(); dragging.current = true }}
              onTouchStart={() => { dragging.current = true }}
            />
          )}

          {/* Mode controls */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[600] glass-panel rounded-xl px-4 py-2.5 flex items-center gap-2">
            {MODES.map(m => (
              <button key={m.key}
                onClick={() => setMode(m.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-mono text-[11px] border transition-colors ${
                  mode === m.key
                    ? 'bg-[#adc6ff]/12 text-[#adc6ff] border-[#adc6ff]/30'
                    : 'text-[#8c909f] border-white/10 hover:text-[#c2c6d6] hover:border-white/20'
                }`}>
                <span className="material-symbols-outlined text-[14px]">{m.icon}</span>
                {m.label}
              </button>
            ))}
          </div>
        </main>

        {/* ── Right Panel – Change Detection ── */}
        <aside className="w-[300px] min-w-[300px] border-l border-white/10 bg-[#0c0e12] flex flex-col overflow-hidden flex-shrink-0">
          <div className="p-4 border-b border-white/10">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="material-symbols-outlined text-[16px] text-[#4edea3]">compare_arrows</span>
              <span className="font-mono text-xs font-bold text-[#4edea3]">Change Detection</span>
            </div>
            <div className="font-mono text-[9px] text-[#c2c6d6]/60">Jun '24 → Jun '26 · Coastal Sector 7A</div>
          </div>

          <div className="flex-1 overflow-y-auto scroll-thin p-4 flex flex-col gap-5">

            {/* Vegetation Loss */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[16px] text-[#ffb4ab]">forest</span>
                  <span className="font-mono text-xs text-[#e2e2e8] font-bold">Vegetation Loss</span>
                </div>
                <span className="font-mono text-sm font-bold text-[#ffb4ab]">-12.4%</span>
              </div>
              <StatBar value={100} variant="red" />
              <p className="text-xs text-[#c2c6d6] leading-relaxed">
                ⚠ −3,820 ha vegetation loss detected. Primary loss in coastal mangrove belt. (Dev placeholder)
              </p>
            </div>

            {/* Built-up Expansion */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[16px] text-[#4edea3]">location_city</span>
                  <span className="font-mono text-xs text-[#e2e2e8] font-bold">Built-up Expansion</span>
                </div>
                <span className="font-mono text-sm font-bold text-[#4edea3]">+22.1%</span>
              </div>
              <StatBar value={100} variant="green" />
              <p className="text-xs text-[#c2c6d6] leading-relaxed">
                ⚠ +6,102 ha new impervious surface. Significant expansion in port/logistics zones. (Dev placeholder)
              </p>
            </div>

            {/* Morphology */}
            <div>
              <div className="font-mono text-[9px] text-[#c2c6d6]/60 uppercase tracking-widest mb-3">
                Morphology Breakdown
              </div>
              <div className="flex flex-col gap-2">
                {MORPHOLOGY.map(m => (
                  <div key={m.label} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ background: m.color }} />
                      <span className="text-xs text-[#e2e2e8]">{m.label}</span>
                    </div>
                    <span className="font-mono text-xs" style={{ color: m.color }}>{m.value}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-white/10" />

            {/* Timeline */}
            <div>
              <div className="font-mono text-[9px] text-[#c2c6d6]/60 uppercase tracking-widest mb-3">
                Change Timeline
              </div>
              <div className="relative">
                <div className="absolute left-3 top-0 bottom-0 w-px bg-white/10" />
                <div className="flex flex-col gap-4 pl-8">
                  {[
                    { date:'Jun 2024', note:'Baseline captured · SAR+RGB',         color:'#c2c6d6' },
                    { date:'Dec 2024', note:'Initial construction activity +4.2%',  color:'#ffb95f' },
                    { date:'Jun 2025', note:'Urban expansion accelerated +14.8%',   color:'#adc6ff' },
                    { date:'Jun 2026', note:'Current state · Total +22.1% built-up',color:'#4edea3' },
                  ].map(t => (
                    <div key={t.date} className="relative">
                      <div className="absolute -left-5 top-1 w-2 h-2 rounded-full border border-[#0c0e12]"
                        style={{ background: t.color }} />
                      <div className="font-mono text-[10px] text-[#e2e2e8]">{t.date}</div>
                      <div className="font-mono text-[9px] text-[#c2c6d6]/60">{t.note}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Confidence */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#4edea3] animate-pulse-dot" />
                  <span className="font-mono text-[9px] text-[#c2c6d6]/70">AI Confidence</span>
                </div>
                <span className="font-mono text-[10px] text-[#4edea3] font-bold">⚠ N/A (Dev)</span>
              </div>
              <StatBar value={0} variant="green" />
              <div className="font-mono text-[9px] text-[#c2c6d6]/50">Connect backend for real confidence</div>
            </div>
          </div>

          {/* Generate Report */}
          <div className="p-4 border-t border-white/10">
            <button
              onClick={handleGenerateReport}
              disabled={reportLoading}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-opacity hover:opacity-90 disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg,#4d8eff 0%,#adc6ff 100%)', color: '#001a42' }}
            >
              {reportLoading
                ? <span className="w-4 h-4 border-2 border-[#001a42]/30 border-t-[#001a42] rounded-full animate-spin" />
                : <span className="material-symbols-outlined text-[18px]">description</span>
              }
              {reportLoading ? 'Generating…' : 'Generate Change Report'}
            </button>

            {/* Status messages */}
            {reportDone && !reportLoading && (
              <div className="mt-2 flex items-center gap-1.5 justify-center">
                <span className="material-symbols-outlined text-[14px] text-[#4edea3]">check_circle</span>
                <span className="font-mono text-[9px] text-[#4edea3]">Report downloaded successfully</span>
              </div>
            )}
            {reportError && !reportLoading && (
              <div className="mt-2 font-mono text-[9px] text-[#ffb4ab] text-center leading-relaxed">
                {reportError}
              </div>
            )}
            {!reportDone && !reportError && !reportLoading && (
              <div className="font-mono text-[9px] text-[#c2c6d6]/40 text-center mt-2">
                Generates a Markdown report from the last completed analysis
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
