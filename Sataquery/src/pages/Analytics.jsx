import { useState, useEffect } from 'react'
import Navbar from '../components/shared/Navbar'
import Sidebar from '../components/shared/Sidebar'
import { projectApi } from '../services/projectApi'

export default function Analytics() {
  const [analyses, setAnalyses] = useState([])
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let mounted = true
    projectApi.list()
      .then(res => {
        if (!mounted) return
        const proj = Array.isArray(res) ? res : (res?.projects || [])
        setProjects(proj)

        const totalAnalyses = proj.reduce((s, p) => s + (p.analysis_count ?? 0), 0)
        const derived = totalAnalyses > 0
          ? proj.flatMap(p => {
              const count = p.analysis_count ?? 0
              if (count <= 0) return []
              return Array.from({ length: count }, (_, i) => ({
                analysis_id: `${p.id}#.${i + 1}`,
                status: 'completed',
                project_id: p.id,
                project_name: p.name || p.title || 'Untitled',
                detections: (p.detections ?? []),
                confidence: p.confidence ?? null,
                created_at: p.created_at ?? null,
                query: p.description ?? null,
              }))
            })
          : []

        setAnalyses(derived)
        setLoading(false)
      })
      .catch(e => {
        if (!mounted) return
        setError(e?.message || 'Unable to load analytics data.')
        setLoading(false)
      })
    return () => { mounted = false }
  }, [])

  const totalDetections = analyses.reduce((s, a) => {
    if (a.detections && Array.isArray(a.detections)) return s + a.detections.length
    return s
  }, 0)

  const classes = [...new Set(
    analyses.flatMap(a =>
      (a.detections || []).map(d => d.label || d.class || 'unknown')
    )
  )]

  const byStatus = (status) => analyses.filter(a => a.status === status).length

  const totalAnalyses = analyses.length

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[#0b0c10]">
      <Navbar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar activeKey="Analytics" />

        <main className="flex-1 overflow-y-auto scroll-thin">
          {loading ? (
            <div className="flex flex-col items-center justify-center gap-3 text-[#c2c6d6] h-full">
              <div className="w-8 h-8 border-2 border-[#adc6ff] border-t-transparent rounded-full animate-spin" />
              <div className="font-mono text-xs">Loading analytics…</div>
            </div>
          ) : error && analyses.length === 0 && projects.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 text-[#c2c6d6] h-full">
              <div className="text-center">
                <div className="text-[11px] font-mono text-[#c2c6d6]/50 mb-1">{error}</div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-5 p-5">
              {/* Summary cards */}
              <div className="grid grid-cols-4 gap-3">
                <StatCard label="Total Analyses" value={totalAnalyses} sub="completed + running + failed" />
                <StatCard label="Completed" value={byStatus('completed')} sub="successfully processed" />
                <StatCard label="Total Detections" value={totalDetections} sub="objects found" />
                <StatCard label="Projects" value={projects.length} sub="saved missions" />
              </div>

              {/* Detected classes */}
              {classes.length > 0 && (
                <div className="bg-[#111318] border border-white/10 rounded-xl p-4">
                  <h3 className="font-mono text-[11px] text-[#c2c6d6]/60 uppercase tracking-widest mb-3">Detected Classes</h3>
                  <div className="flex flex-wrap gap-2">
                    {classes.map(c => (
                      <span key={c} className="px-2.5 py-1 rounded-full bg-[#adc6ff]/10 border border-[#adc6ff]/20 font-mono text-[11px] text-[#adc6ff]">
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Analyses table */}
              <div className="bg-[#111318] border border-white/10 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
                  <h3 className="font-mono text-[11px] text-[#c2c6d6]/60 uppercase tracking-widest">Analysis History</h3>
                  <span className="font-mono text-[10px] text-[#c2c6d6]/50">{analyses.length} records</span>
                </div>

                {analyses.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-10 text-center">
                    <div className="w-10 h-10 rounded-lg bg-[#adc6ff]/10 border border-[#adc6ff]/20 flex items-center justify-center">
                      <span className="material-symbols-outlined text-[18px] text-[#c2c6d6]/50">analytics</span>
                    </div>
                    <div className="font-mono text-xs text-[#c2c6d6]/70">No analyses yet</div>
                    <div className="font-mono text-[10px] text-[#c2c6d6]/50">Run an analysis from the console to see results here</div>
                  </div>
                ) : (
                  <div className="divide-y divide-white/5">
                    {analyses.map(a => (
                      <AnalysisRow key={a.analysis_id || a.id} item={a} />
                    ))}
                  </div>
                )}
              </div>

              {/* Projects list */}
              <div className="bg-[#111318] border border-white/10 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
                  <h3 className="font-mono text-[11px] text-[#c2c6d6]/60 uppercase tracking-widest">Projects</h3>
                  <span className="font-mono text-[10px] text-[#c2c6d6]/50">{projects.length} saved</span>
                </div>

                {projects.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-10 text-center">
                    <div className="w-10 h-10 rounded-lg bg-[#adc6ff]/10 border border-[#adc6ff]/20 flex items-center justify-center">
                      <span className="material-symbols-outlined text-[18px] text-[#c2c6d6]/50">folder_off</span>
                    </div>
                    <div className="font-mono text-xs text-[#c2c6d6]/70">No projects yet</div>
                    <div className="font-mono text-[10px] text-[#c2c6d6]/50">Create a project from the console to save your work</div>
                  </div>
                ) : (
                  <div className="divide-y divide-white/5">
                    {projects.map(p => (
                      <div key={p.id} className="px-4 py-3 flex items-center justify-between">
                        <div>
                          <div className="font-mono text-xs text-[#e2e2e8]">{p.name || p.title || 'Untitled'}</div>
                          <div className="font-mono text-[10px] text-[#c2c6d6]/60 mt-0.5">
                            {p.id} · {p.created_at ? new Date(p.created_at).toLocaleDateString() : '—'}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {(p.image_count ?? (p.images?.length ?? 0)) > 0 && (
                            <span className="font-mono text-[10px] text-[#c2c6d6]/50">
                              {(p.image_count ?? (p.images?.length ?? 0))} image(s)
                            </span>
                          )}
                          {(p.analysis_count ?? 0) > 0 && (
                            <span className="font-mono text-[10px] text-[#adc6ff]">
                              {p.analysis_count} analysis
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

function StatCard({ label, value, sub }) {
  return (
    <div className="bg-[#111318] border border-white/10 rounded-xl p-4 flex flex-col gap-1">
      <div className="font-mono text-[10px] text-[#c2c6d6]/60 uppercase tracking-widest">{label}</div>
      <div className="font-mono text-2xl font-bold text-[#e2e2e8] leading-none">{value}</div>
      <div className="font-mono text-[9px] text-[#c2c6d6]/50">{sub}</div>
    </div>
  )
}

function AnalysisRow({ item }) {
  const statusColor = {
    completed: 'text-[#4edea3]',
    processing: 'text-[#adc6ff]',
    queued: 'text-[#c2c6d6]/70',
    failed: 'text-[#f87171]',
  }[item.status] || 'text-[#c2c6d6]/70'

  return (
    <div className="px-4 py-3 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <span className={`font-mono text-[10px] whitespace-nowrap ${statusColor}`}>
          {item.status}
        </span>
        <div className="min-w-0">
          <div className="font-mono text-xs text-[#e2e2e8] truncate">{item.query || item.description || 'Analysis'}</div>
          <div className="font-mono text-[9px] text-[#c2c6d6]/50">
            ID: {item.analysis_id || item.id}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {item.detections != null && (
          <span className="font-mono text-[10px] text-[#c2c6d6]/70">
            {(item.detections || []).length} detection(s)
          </span>
        )}
        {item.confidence != null && item.confidence !== undefined && (
          <span className="font-mono text-[10px] text-[#c2c6d6]/60">
            {typeof item.confidence === 'number' ? item.confidence.toFixed(1) : item.confidence}
          </span>
        )}
        {item.created_at && (
          <span className="font-mono text-[9px] text-[#c2c6d6]/50 whitespace-nowrap">
            {new Date(item.created_at).toLocaleString()}
          </span>
        )}
      </div>
    </div>
  )
}
