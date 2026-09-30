import { useEffect, useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import Logo from '../components/shared/Logo'
import { api, BACKEND_CONNECTED } from '../services/api'
import { projectApi } from '../services/projectApi'
import { imageryApi } from '../services/imageryApi'

const CAPS = [
  { icon: 'water_drop',   color: '#adc6ff', label: 'Hydrological Dynamics', acc: '99.2%', res: '3m–10m',   spec: 'NDWI, SAR' },
  { icon: 'location_city',color: '#ffb95f', label: 'Urban Infrastructure',  acc: '95.8%', res: '0.3m–1m',  spec: 'RGB, PAN'  },
  { icon: 'forest',       color: '#4edea3', label: 'Vegetation Health',     acc: '97.4%', res: '10m–30m',  spec: 'NIR, SWIR' },
]

const EXAMPLE_QUERIES = [
  'Show water bodies in this image',
  'Detect vessel activity in port regions',
  'Highlight built-up expansion since 2024',
  'Find deforestation areas in Amazon sector',
  'Count visible shipping containers',
  'Compare vegetation cover over 24 months',
]

function formatFileSize(bytes) {
  if (!bytes) return '—'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

function clampQueryForDisplay(q) {
  // Keep demo copy from being cut off inside the inner box.
  const maxLine = 70
  if (q.length <= maxLine) return q
  return q.slice(0, maxLine - 1) + '…'
}

function scrollIntoViewIfNeeded(node) {
  try {
    // occupy necessary space if offscreen on small viewports
    if (node && node.getBoundingClientRect().bottom > window.innerHeight) {
      window.scrollBy({ top: node.getBoundingClientRect().bottom - window.innerHeight + 80, behavior: 'smooth' })
    }
  } catch { /* ignore */ }
}

export const NavBar = () => (
  <nav className="fixed top-0 w-full z-50 backdrop-blur-2xl border-b border-white/10 bg-[#0b0c10]/80 flex items-center justify-between px-8 h-14">
    <div className="flex items-center gap-3">
      <Logo px={32} />
      <span className="font-mono font-bold text-lg text-[#e2e2e8] tracking-tight flex items-center gap-2">
        SatQuery<span className="text-[#adc6ff]">AI</span>
        <span className="px-2 py-0.5 rounded text-[10px] bg-[#adc6ff]/10 text-[#adc6ff] border border-[#adc6ff]/20 ml-1">v2.4.1</span>
      </span>
    </div>

    <div className="hidden md:flex items-center gap-8 border-l border-white/10 pl-8 h-full">
      {['/PLATFORM','/SOLUTIONS','/DATASETS','/DOCS'].map(t => (
        <a key={t} href="#" className="font-mono text-sm text-[#c2c6d6] hover:text-[#e2e2e8] transition-colors">{t}</a>
      ))}
    </div>

    <div className="flex items-center gap-4 ml-auto">
      <div className="hidden lg:flex items-center gap-2 text-xs font-mono text-[#c2c6d6] mr-2">
        <span className="w-2 h-2 rounded-full bg-[#4edea3] animate-pulse-dot" />
        SYSTEM_NOMINAL
      </div>
      <Link to="/login" className="font-mono text-sm text-[#e2e2e8] hover:text-[#adc6ff] transition-colors">
        LOGIN
      </Link>
      <Link to="/dashboard"
        className="bg-[#adc6ff]/10 text-[#adc6ff] border border-[#adc6ff]/30 font-mono text-sm
                   px-4 py-1.5 rounded hover:bg-[#adc6ff]/20 transition-all flex items-center gap-2">
        CONSOLE <span className="material-symbols-outlined text-[16px]">terminal</span>
      </Link>
    </div>
  </nav>
)

export const TelemetryReadouts = () => (
  <>
    <div className="absolute top-20 left-8 font-mono text-[10px] text-[#c2c6d6]/40 hidden md:block">
      LAT: 45.92°N | LON: -124.44°W
    </div>
    <div className="absolute bottom-8 right-8 font-mono text-[10px] text-[#c2c6d6]/40 hidden md:block">
      ORBIT_ALT: 400KM | SENSOR: SAR+OPTICAL
    </div>
  </>
)

export const StatusBadge = () => (
  <div className="inline-flex items-center gap-3 px-4 py-1.5 rounded-full glass-panel
                  text-[#4edea3] font-mono text-xs border border-[#4edea3]/20
                  shadow-[0_0_15px_rgba(78,222,163,0.1)]">
    <span className="w-2 h-2 rounded-full bg-[#4edea3] animate-pulse-dot" />
    ORBITAL INTELLIGENCE ENGINE ONLINE
  </div>
)

export const Headline = () => (
  <>
    <h1 className="font-display font-extrabold text-4xl md:text-5xl lg:text-7xl text-center leading-tight tracking-tighter
                   max-w-4xl text-gradient">
      Ask Your Satellite Data<br />
      <span className="text-[#adc6ff] font-mono">Anything.</span>
    </h1>
    <p className="text-[#c2c6d6] max-w-2xl text-center text-sm md:text-base lg:text-lg mt-2">
      Enterprise-grade geospatial inference. Transform multi-modal satellite telemetry into
      structured insights via natural language and neural computer vision.
    </p>
  </>
)

export const SearchBar = ({ onExecute, query, onQueryChange, className = '' }) => {
  const inputRef = useRef(null)
  const displayQuery = query ? clampQueryForDisplay(query) : ''
  return (
    <div className={`w-full max-w-3xl mt-6 tech-border bg-[#111318]/80 backdrop-blur-xl rounded p-1 focus-within:border-[#adc6ff]/50 transition-colors shadow-2xl ${className}`}>
      <div className="flex items-center px-4 py-2 border-b border-white/5 gap-4">
        <span className="px-2 py-0.5 bg-[#333539] text-[#c2c6d6] font-mono text-[10px] rounded">SENSOR: AUTO</span>
        <span className="px-2 py-0.5 bg-[#333539] text-[#c2c6d6] font-mono text-[10px] rounded">RES: &lt;0.5m</span>
        <div className="ml-auto flex items-center gap-1.5 font-mono text-[10px] text-[#c2c6d6]">
          <span className="material-symbols-outlined text-[14px]">my_location</span>
          BBOX: [-122.4, 37.7, -122.3, 37.8]
        </div>
      </div>
      <div className="flex items-center p-2">
        <span className="font-mono text-[#adc6ff] px-4 text-lg">&gt;</span>
        <span className="font-mono text-[#c2c6d6]/60 mr-3 truncate max-w-[55vw] block">
          {displayQuery || <span className="opacity-40">Detecting anomalous vessel activity in port regions…</span>}
        </span>
        <input
          ref={inputRef}
          className="w-full bg-transparent border-none text-[#e2e2e8] font-mono text-sm
                     focus:ring-0 focus:outline-none placeholder:text-[#c2c6d6]/40"
          placeholder="Detect anomalous vessel activity in port regions over the last 72 hours…"
          value={query}
          onChange={e => onQueryChange?.(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && (query || '').trim()) {
              e.preventDefault()
              onExecute?.(query.trim())
            }
          }}
          onClick={() => inputRef.current?.focus()}
        />
        <button
          type="button"
          onClick={() => { if ((query || '').trim()) onExecute?.(query.trim()) }}
          disabled={(query || '').trim() === ''}
          className="bg-[#adc6ff]/20 text-[#adc6ff] border border-[#adc6ff]/30 px-6 py-2 rounded
                     font-mono text-sm hover:bg-[#adc6ff]/30 transition-colors flex items-center gap-2 whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed">
          EXECUTE <span className="material-symbols-outlined text-[16px]">keyboard_return</span>
        </button>
      </div>
    </div>
  )
}

export const ExampleQueryButtons = ({ onSelect }) => (
  <div className="flex flex-wrap gap-2 justify-center mt-2">
    {EXAMPLE_QUERIES.map(q => (
      <button
        key={q}
        type="button"
        onClick={() => onSelect?.(q)}
        className="px-3 py-1 rounded-full bg-white/[0.04] border border-white/10
                   font-mono text-[10px] text-[#c2c6d6] hover:border-[#adc6ff]/30
                   hover:text-[#adc6ff] cursor-pointer transition-colors"
      >
        {q}
      </button>
    ))}
  </div>
)

export const CtaButtons = () => (
  <div className="flex items-center gap-4 mt-2 justify-center">
    <Link to="/dashboard"
      className="bg-[#4d8eff] hover:bg-[#5b96ff] text-[#001a42] font-semibold
                 px-6 py-2.5 rounded-lg transition-colors flex items-center gap-2 text-sm">
      <span className="material-symbols-outlined text-[18px]">rocket_launch</span>
      Start Exploring
    </Link>
    <Link to="/missions"
      className="border border-white/20 hover:border-white/40 text-[#e2e2e8]
                 font-semibold px-6 py-2.5 rounded-lg transition-colors text-sm flex items-center gap-2">
      <span className="material-symbols-outlined text-[18px]">play_circle</span>
      View Demo
    </Link>
  </div>
)

export const RecentImageryPanel = ({ images, baseUrl }) => {
  if (images.length === 0) return null
  return (
    <div className="w-full mt-16 relative rounded-xl border border-white/10 bg-[#111318] shadow-2xl overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-t from-[#0b0c10] via-[#0b0c10]/10 to-transparent z-10 pointer-events-none" />
      <div className="h-8 border-b border-white/10 flex items-center px-4 justify-between bg-[#1a1c20] font-mono text-[10px] text-[#c2c6d6]">
        <span>RECENT IMAGERY</span>
        <span className="text-[#adc6ff]">{images.length} FILES</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 p-4 h-[280px] overflow-y-auto">
        {images.slice(0, 6).map(img => (
          <div key={img.image_id} className="relative rounded-lg overflow-hidden border border-white/10 bg-[#0c0e12] group">
            <div className="aspect-video bg-cover bg-center"
              style={{ backgroundImage: `url(${baseUrl || ''}${img.url})` }}>
              <div className="absolute inset-0 bg-gradient-to-t from-[#111318]/80 to-transparent" />
            </div>
            <div className="absolute bottom-0 left-0 right-0 p-2">
              <div className="font-mono text-[9px] text-[#e2e2e8] truncate">{img.original_filename}</div>
              <div className="font-mono text-[8px] text-[#c2c6d6]/60 flex gap-2">
                {img.width && img.height ? `${img.width}×${img.height}` : ''}
                {img.is_georeferenced ? <span className="text-[#4edea3]">GEO</span> : <span className="text-[#c2c6d6]/40">IMAGE</span>}
                {formatFileSize(img.size_bytes)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export const RecentProjectsPanel = ({ projects }) => {
  if (projects.length === 0) return null
  return (
    <div className="w-full mt-16 relative rounded-xl border border-white/10 bg-[#111318] shadow-2xl overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-t from-[#0b0c10] via-[#0b0c10]/10 to-transparent z-10 pointer-events-none" />
      <div className="h-8 border-b border-white/10 flex items-center px-4 justify-between bg-[#1a1c20] font-mono text-[10px] text-[#c2c6d6]">
        <span>RECENT PROJECTS</span>
        <span className="text-[#adc6ff]">{projects.length} PROJECTS</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-4">
        {projects.slice(0, 3).map(p => (
          <div key={p.id} className="flex items-start gap-3 p-3 rounded-lg border border-white/10 bg-[#0c0e12]">
            <div className="w-9 h-9 rounded-lg bg-[#111318] flex items-center justify-center border border-white/10 flex-shrink-0">
              <span className="material-symbols-outlined text-[18px] text-[#adc6ff]">folder</span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-mono font-bold text-sm text-[#e2e2e8] truncate">{p.name}</div>
              <div className="font-mono text-[9px] text-[#c2c6d6]/60 mt-0.5">
                {p.analysis_count} analysis{p.analysis_count !== 1 ? 'es' : ''}
              </div>
              <div className="mt-1.5 flex items-center gap-1">
                <span className={`w-1.5 h-1.5 rounded-full ${p.analysis_count > 0 ? 'bg-[#4edea3]' : 'bg-[#c2c6d6]/40'}`} />
                <span className="font-mono text-[8px] text-[#c2c6d6]/50">
                  {new Date(p.created_at).toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
      {projects.length === 0 && (
        <div className="p-8 text-center">
          <div className="font-mono text-[10px] text-[#c2c6d6]/50">No projects yet. Upload imagery and run analysis to see them here.</div>
          <Link to="/dashboard" className="inline-flex items-center gap-2 mt-3 bg-[#adc6ff]/10 text-[#adc6ff] border border-[#adc6ff]/30 rounded-lg px-4 py-2 font-mono text-xs hover:bg-[#adc6ff]/20 transition-colors">
            <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
            Go to Dashboard
          </Link>
        </div>
      )}
    </div>
  )
}

export const MissionControlPanel = () => (
  <div className="w-full mt-16 relative rounded-xl border border-white/10 bg-[#111318] shadow-2xl overflow-hidden">
    <div className="h-8 border-b border-white/10 flex items-center px-4 justify-between bg-[#1a1c20] font-mono text-[10px] text-[#c2c6d6]">
      <span>MISSION_CONTROL</span>
      <span className="text-[#ffb95f]">IDLE</span>
    </div>
    <div className="p-8 text-center">
      <div className="font-mono text-[10px] text-[#c2c6d6]/50">No data yet. Open the console to upload imagery and run your first analysis.</div>
      <div className="flex justify-center gap-3 mt-4">
        <Link to="/dashboard"
          className="bg-[#4d8eff] hover:bg-[#5b96ff] text-[#001a42] font-semibold px-6 py-2.5 rounded-lg transition-colors text-sm flex items-center gap-2">
          <span className="material-symbols-outlined text-[16px]">rocket_launch</span>
          Start Exploring
        </Link>
      </div>
    </div>
  </div>
)

export const ProcessSection = () => (
  <section className="py-24 px-4 border-t border-white/10 bg-[#0c0e12]">
    <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8">
      {[
        { phase:'PHASE_01', color:'#adc6ff', icon:'satellite_alt', title:'Data Ingest',
          desc:'Automated pipeline ingests multi-spectral, SAR, and DEM data from commercial constellations via API.' },
        { phase:'PHASE_02', color:'#ffb95f', icon:'memory',        title:'Neural Inference',
          desc:'Proprietary foundational vision models process imagery to extract features, anomalies, and temporal changes.' },
        { phase:'PHASE_03', color:'#4edea3', icon:'polyline',      title:'Geospatial Output',
          desc:'Results delivered as structured GeoJSON, annotated raster layers, or direct dashboard visualization.' },
      ].map((p, i) => (
        <div key={p.phase} className="tech-border p-8 rounded bg-[#111318]/50 flex flex-col gap-4 relative
                                      hover:border-[#adc6ff]/30 transition-colors">
          {i > 0 && (
            <div className="hidden md:block absolute -left-4 top-1/2 -translate-y-1/2 text-[#333539]">
              <span className="material-symbols-outlined text-sm">arrow_forward_ios</span>
            </div>
          )}
          <div className="font-mono text-xs mb-1" style={{ color: p.color }}>{p.phase}</div>
          <div className="w-10 h-10 border border-white/20 bg-[#111318] flex items-center justify-center text-[#e2e2e8]">
            <span className="material-symbols-outlined">{p.icon}</span>
          </div>
          <h3 className="font-mono font-bold text-lg text-[#e2e2e8]">{p.title}</h3>
          <p className="text-[#c2c6d6] text-sm leading-relaxed">{p.desc}</p>
        </div>
      ))}
    </div>
  </section>
)

export const CapabilitiesSection = ({ analysisTasks }) => (
  <section className="py-24 px-4 border-t border-white/10 bg-[#0b0c10]">
    <div className="max-w-5xl mx-auto">
      <div className="flex justify-between items-end mb-12">
        <h2 className="font-display font-bold text-4xl text-[#e2e2e8] tracking-tight">Analysis Capabilities</h2>
        <div className="font-mono text-xs text-[#c2c6d6] border border-white/10 px-3 py-1 rounded">
          MODELS_LOADED: 24
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {(analysisTasks.length > 0 ? analysisTasks : CAPS).map(c => (
          c.source ? (
            <div key={c.source} className="tech-border p-6 rounded bg-[#1a1c20] flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#4edea3] animate-pulse-dot" />
                <span className="font-mono text-[10px] text-[#4edea3]">{c.source.toUpperCase()}</span>
              </div>
              <p className="text-[#c2c6d6] text-xs leading-relaxed">{c.description}</p>
              <div className="mt-auto border-t border-white/10 pt-3 flex justify-between font-mono text-[10px] text-[#c2c6d6]">
                <span>CONFIGURED</span>
                <span className="text-[#4edea3]">ACTIVE</span>
              </div>
            </div>
          ) : (
            <div key={c.label} className="tech-border p-6 rounded bg-[#1a1c20] flex flex-col gap-4">
              <div className="flex justify-between items-start">
                <div className="w-8 h-8 flex items-center justify-center border"
                  style={{ background: `${c.color}1a`, borderColor: `${c.color}33`, color: c.color }}>
                  <span className="material-symbols-outlined text-sm">{c.icon}</span>
                </div>
                <span className="font-mono text-[10px] text-[#4edea3]">{c.acc}</span>
              </div>
              <div>
                <h3 className="font-mono font-bold text-[#e2e2e8] text-base mb-1">{c.label}</h3>
                <p className="text-[#c2c6d6] text-xs leading-relaxed">
                  {c.label === 'Hydrological Dynamics' && 'Automated extraction of water body extents, shoreline changes, and flood inundation mapping.'}
                  {c.label === 'Urban Infrastructure'  && 'Building footprint extraction, urban sprawl quantification, and road network topological mapping.'}
                  {c.label === 'Vegetation Health'     && 'Time-series NDVI/EVI analysis for crop yield prediction and deforestation tracking.'}
                </p>
              </div>
              <div className="mt-auto border-t border-white/10 pt-4 flex justify-between font-mono text-[10px] text-[#c2c6d6]">
                <span>{c.res}</span>
                <span>{c.spec}</span>
              </div>
            </div>
          )
        ))}
      </div>
    </div>
  </section>
)

export const Footer = ({ backendOk, projects, analysisTasks, logoOpacity }) => (
  <footer className="border-t border-white/10 py-16 px-4 bg-[#0c0e12] font-mono">
    <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-12 mb-12">
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Logo px={24} className={`opacity-${logoOpacity ?? 80}`} />
          <span className="text-sm font-bold text-[#e2e2e8]">SatQuery<span className="text-[#adc6ff]">AI</span></span>
        </div>
        <p className="text-xs text-[#c2c6d6]/60 leading-relaxed">
          Enterprise geospatial intelligence. Processing earth observation data at planetary scale.
        </p>
      </div>
      {[
        { title:'PLATFORM', links:['Neural Models','Data Catalog','API Reference','Pricing'] },
        { title:'RESOURCES', links:['Documentation','Case Studies','Data Governance','System Status'] },
      ].map(col => (
        <div key={col.title}>
          <h4 className="text-xs font-bold text-[#e2e2e8] mb-4">{col.title}</h4>
          <ul className="flex flex-col gap-2 text-xs text-[#c2c6d6]">
            {col.links.map(l => (
              <li key={l}><a href="#" className="hover:text-[#adc6ff] transition-colors">{l}</a></li>
            ))}
          </ul>
        </div>
      ))}
      <div>
        <h4 className="text-xs font-bold text-[#e2e2e8] mb-4">SYSTEM</h4>
        <div className="bg-[#111318] border border-white/5 p-3 rounded text-[10px] text-[#c2c6d6] flex flex-col gap-1">
          <div className="flex justify-between">
            <span>API_STATUS:</span>
            <span className={backendOk ? 'text-[#4edea3]' : 'text-[#ffb4ab]'}>
              {backendOk ? 'ONLINE' : 'OFFLINE'}
            </span>
          </div>
          <div className="flex justify-between">
            <span>PROJECTS:</span>
            <span>{projects.length}</span>
          </div>
          <div className="flex justify-between">
            <span>VERSION:</span>
            <span>2.4.1</span>
          </div>
          {backendOk && (
            <div className="flex justify-between">
              <span>SOURCES:</span>
              <span className="text-[#4edea3]">{analysisTasks.length} configured</span>
            </div>
          )}
        </div>
      </div>
    </div>
    <div className="max-w-5xl mx-auto pt-8 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-4">
      <p className="text-[10px] text-[#c2c6d6]/40">© 2026 SATQUERY AI INC. ALL RIGHTS RESERVED.</p>
      <div className="flex gap-4 text-[10px] text-[#c2c6d6]/40">
        <a href="#" className="hover:text-[#c2c6d6]">PRIVACY</a>
        <a href="#" className="hover:text-[#c2c6d6]">TERMS</a>
        <a href="#" className="hover:text-[#c2c6d6]">SECURITY</a>
      </div>
    </div>
  </footer>
)

export default function Landing() {
  const [backendOk, setBackendOk] = useState(BACKEND_CONNECTED)
  const uploadedImages = []
  const [projects, setProjects] = useState([])
  const [analysisTasks, setAnalysisTasks] = useState([])
  const [selectedQuery, setSelectedQuery] = useState('')

  const lastFocusedSearchBar = useRef(false)

  useEffect(() => {
    let mounted = true
    const fetchAll = async () => {
      const health = await api.health()
      if (mounted) setBackendOk(health.ok)

      try {
        const sources = await imageryApi.sources()
        if (mounted) {
          const configured = sources?.sources?.filter(s => s.configured) ?? []
          setAnalysisTasks(
            configured.map(s => ({
              source: s.source,
              description: s.description,
            }))
          )
        }
      } catch { /* ignore */ }

      try {
        const data = await projectApi.list()
        if (mounted) setProjects(data?.projects ?? [])
      } catch { /* ignore */ }
    }
    fetchAll().catch(() => {})
    return () => { mounted = false }
  }, [])

  const baseUrl = import.meta.env.VITE_API_BASE_URL || ''

  const handleExecute = async (query) => {
    // TODO: wire this to POST /query
    console.log('Execute query:', query)
    lastFocusedSearchBar.current = true
    setTimeout(() => {
      const node = document.querySelector('.search-bar-hero input')
      if (node && lastFocusedSearchBar.current) {
        node.focus()
        lastFocusedSearchBar.current = false
      }
    }, 10)
  }

  const handleSelectQuery = (q) => {
    setSelectedQuery(q)
  }

  return (
    <div className="min-h-screen bg-[#0b0c10] text-[#e2e2e8] flex flex-col overflow-x-hidden">

      <NavBar />

      <section className="relative min-h-screen flex items-center justify-center pt-16 pb-8 px-4
                          bg-grid overflow-hidden"
        style={{ background: 'radial-gradient(circle at center, rgba(77,142,255,0.08) 0%, #0b0c10 70%)' }}>

        <TelemetryReadouts />

        <div className="relative z-10 w-full max-w-5xl mx-auto flex flex-col items-center gap-6 md:gap-8 lg:gap-10 mt-6 md:mt-8">

          <StatusBadge />

          <Headline />

          <SearchBar
            onExecute={handleExecute}
            query={selectedQuery}
            onQueryChange={setSelectedQuery}
            className="search-bar-hero"
            onFocus={() => scrollIntoViewIfNeeded(document.querySelector('.search-bar-hero'))}
          />

          <div className="w-full max-w-3xl mt-2 px-2 text-center">
            <ExampleQueryButtons onSelect={handleSelectQuery} />
          </div>

          <div className="w-full max-w-3xl mt-2 px-2 text-center">
            <CtaButtons />
          </div>

          <div className="w-full max-w-3xl mt-6 px-2 text-center">
            <p className="text-xs text-[#c2c6d6]/40">
              Example queries populate the search bar; press Enter or EXECUTE to run them.
            </p>
          </div>

          {uploadedImages.length > 0 ? (
            <RecentImageryPanel images={uploadedImages} baseUrl={baseUrl} />
          ) : projects.length > 0 ? (
            <RecentProjectsPanel projects={projects} />
          ) : (
            <MissionControlPanel />
          )}
        </div>
      </section>

      <ProcessSection />

      <CapabilitiesSection analysisTasks={analysisTasks} />

      <Footer backendOk={backendOk} projects={projects} analysisTasks={analysisTasks} logoOpacity={80} />
    </div>
  )
}

// No separate named-export block here — the components are already declared
// with `export const ...` above, so a grouped export would duplicate them.
