import { useState, useEffect } from 'react'
import Navbar from '../components/shared/Navbar'
import Sidebar from '../components/shared/Sidebar'
import { projectApi } from '../services/projectApi'

export default function Projects() {
  const [projects, setProjects] = useState([])
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let mounted = true
    projectApi.list()
      .then(res => {
        if (!mounted) return
        const list = Array.isArray(res) ? res : (res?.projects || [])
        setProjects(list)
        setSelected(prev => prev ?? list[0] ?? null)
        setLoading(false)
      })
      .catch(e => {
        if (!mounted) return
        setError(e?.message || 'Unable to load projects.')
        setLoading(false)
      })
    return () => { mounted = false }
  }, [])

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[#0b0c10]">
      <Navbar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar activeKey="Projects" />

        <main className="flex-1 overflow-hidden">
          {loading ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-[#c2c6d6] h-full">
              <div className="w-8 h-8 border-2 border-[#adc6ff] border-t-transparent rounded-full animate-spin" />
              <div className="font-mono text-xs">Loading projects…</div>
            </div>
          ) : error && projects.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-[#c2c6d6] h-full">
              <div className="text-center">
                <div className="text-[11px] font-mono text-[#c2c6d6]/50 mb-1">{error}</div>
              </div>
            </div>
          ) : (
            <div className="flex h-full gap-5 p-5 overflow-hidden">
              {/* Project list */}
              <div className="w-[300px] flex-shrink-0 flex flex-col gap-3 overflow-hidden">
                <div className="flex items-center justify-between">
                  <h3 className="font-mono text-[11px] text-[#c2c6d6]/60 uppercase tracking-widest">Projects</h3>
                  <span className="font-mono text-[10px] text-[#c2c6d6]/50">{projects.length}</span>
                </div>

                <div className="flex-1 overflow-y-auto scroll-thin space-y-1">
                  {projects.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 py-10 text-center border border-dashed border-white/10 rounded-xl">
                      <div className="w-10 h-10 rounded-lg bg-[#adc6ff]/10 border border-[#adc6ff]/20 flex items-center justify-center">
                        <span className="material-symbols-outlined text-[18px] text-[#c2c6d6]/50">folder_off</span>
                      </div>
                      <div className="font-mono text-xs text-[#c2c6d6]/70">No projects yet</div>
                      <div className="font-mono text-[10px] text-[#c2c6d6]/50">Create one from the console</div>
                    </div>
                  ) : (
                    projects.map(p => (
                      <button
                        key={p.id}
                        onClick={() => setSelected(p)}
                        className={
                          'w-full text-left px-3 py-2.5 rounded-lg border transition-colors '
                          + (selected?.id === p.id
                            ? 'bg-[#adc6ff]/12 border-[#adc6ff]/30'
                            : 'bg-[#111318] border-white/10 hover:border-white/20')
                        }
                      >
                        <div className="font-mono text-xs text-[#e2e2e8] truncate">
                          {p.name || p.title || 'Untitled'}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="font-mono text-[9px] text-[#c2c6d6]/50 truncate max-w-[180px]">{p.id}</span>
                          {(p.analysis_count ?? 0) > 0 && (
                            <span className="font-mono text-[9px] text-[#adc6ff]">
                              {p.analysis_count} analysis
                            </span>
                          )}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>

              {/* Project detail */}
              <div className="flex-1 flex flex-col overflow-hidden">
                {selected ? (
                  <>
                    <div className="px-4 py-3 border-b border-white/10">
                      <div className="flex items-center justify-between">
                        <h3 className="font-mono text-[11px] text-[#c2c6d6]/60 uppercase tracking-widest">
                          Project Details
                        </h3>
                        <span className="font-mono text-[10px] text-[#c2c6d6]/50">
                          {selected.id}
                        </span>
                      </div>
                    </div>

                    <div className="flex-1 overflow-y-auto scroll-thin divide-y divide-white/5">
                      <Field label="Name" value={selected.name || selected.title} />
                      <Field label="ID" value={selected.id} monospace />
                      {selected.description && (
                        <div className="px-4 py-3">
                          <div className="font-mono text-[10px] text-[#c2c6d6]/60 uppercase tracking-widest mb-2">Description</div>
                          <div className="text-sm text-[#e2e2e8] leading-relaxed">{selected.description}</div>
                        </div>
                      )}
                      {selected.created_at && (
                        <Field
                          label="Created"
                          value={new Date(selected.created_at).toLocaleString()}
                          monospace
                        />
                      )}
                      {selected.updated_at && (
                        <Field
                          label="Updated"
                          value={new Date(selected.updated_at).toLocaleString()}
                          monospace
                        />
                      )}
                      {(selected.image_count ?? (selected.images?.length ?? 0)) > 0 && (
                        <Field
                          label="Images"
                          value={String(selected.image_count ?? selected.images?.length)}
                          monospace
                        />
                      )}
                      {(selected.analysis_count ?? 0) > 0 && (
                        <Field
                          label="Analyses"
                          value={String(selected.analysis_count)}
                          monospace
                          highlight
                        />
                      )}
                      {selected.area_of_interest && (
                        <div className="px-4 py-3">
                          <div className="font-mono text-[10px] text-[#c2c6d6]/60 uppercase tracking-widest mb-2">
                            Area of Interest
                          </div>
                          <div className="font-mono text-[11px] text-[#adc6ff] leading-relaxed">
                            {selected.area_of_interest}
                          </div>
                        </div>
                      )}
                      {selected.bounds && (
                        <div className="px-4 py-3">
                          <div className="font-mono text-[10px] text-[#c2c6d6]/60 uppercase tracking-widest mb-2">
                            Bounds
                          </div>
                          <pre className="font-mono text-[10px] text-[#c2c6d6] leading-relaxed whitespace-pre-wrap">
                            {JSON.stringify(selected.bounds, null, 1)}
                          </pre>
                        </div>
                      )}
                      {selected.location && (
                        <div className="px-4 py-3">
                          <div className="font-mono text-[10px] text-[#c2c6d6]/60 uppercase tracking-widest mb-2">
                            Location
                          </div>
                          <div className="font-mono text-[11px] text-[#e2e2e8]">
                            {selected.location.name || selected.location}
                          </div>
                          {(selected.location.latitude != null) && (
                            <div className="font-mono text-[10px] text-[#c2c6d6]/60 mt-1">
                              {selected.location.latitude.toFixed(4)}, {selected.location.longitude?.toFixed(4)}
                            </div>
                          )}
                        </div>
                      )}
                      <div className="px-4 py-3">
                        <div className="font-mono text-[10px] text-[#c2c6d6]/60 uppercase tracking-widest mb-2">
                          Metadata
                        </div>
                        <pre className="font-mono text-[10px] text-[#c2c6d6] leading-relaxed whitespace-pre-wrap">
                          {JSON.stringify(selected, (k, v) =>
                            ['id', 'name', 'title', 'description', 'image_count', 'analysis_count',
                             'created_at', 'updated_at', 'location', 'bounds', 'area_of_interest'].includes(k)
                              ? undefined
                              : v
                          , 2)}
                        </pre>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center gap-3 text-[#c2c6d6]">
                    <div className="w-10 h-10 rounded-lg bg-[#adc6ff]/10 border border-[#adc6ff]/20 flex items-center justify-center">
                      <span className="material-symbols-outlined text-[18px] text-[#c2c6d6]/50">touch_app</span>
                    </div>
                    <div className="font-mono text-xs">Select a project to view details</div>
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

function Field({ label, value, monospace, highlight }) {
  if (value == null || value === '') return null
  return (
    <div className="px-4 py-3">
      <div className="font-mono text-[10px] text-[#c2c6d6]/60 uppercase tracking-widest mb-1">{label}</div>
      <div className={`text-sm ${monospace ? 'font-mono' : ''} ${highlight ? 'text-[#4edea3]' : 'text-[#e2e2e8]'}`}>
        {value}
      </div>
    </div>
  )
}
