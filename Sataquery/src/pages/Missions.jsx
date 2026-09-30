import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Navbar from '../components/shared/Navbar'
import Sidebar from '../components/shared/Sidebar'
import { imageryApi } from '../services/imageryApi'
import { projectApi } from '../services/projectApi'
const SUPPORTED = ['image/tiff', 'image/png', 'image/jpeg', 'image/jpg']
const SUPPORTED_EXT = ['.tif', '.tiff', '.png', '.jpg', '.jpeg', '.geotiff']

function FileRow({ file, onRemove }) {
  const valid = SUPPORTED.includes(file.type) || SUPPORTED_EXT.some(e => file.name.toLowerCase().endsWith(e))
  const [preview, setPreview] = useState(null)

  useState(() => {
    if (file.type.startsWith('image/') && !file.type.includes('tiff')) {
      const url = URL.createObjectURL(file)
      setPreview(url)
      return () => URL.revokeObjectURL(url)
    }
  })

  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-[#111318] border border-white/10 rounded-xl hover:bg-white/[0.02] transition-colors">
      {preview
        ? <img src={preview} alt="" className="w-9 h-9 rounded object-cover border border-white/10 flex-shrink-0" />
        : (
          <div className="w-9 h-9 rounded bg-[#adc6ff]/10 border border-[#adc6ff]/20 flex items-center justify-center flex-shrink-0">
            <span className="material-symbols-outlined text-[18px] text-[#adc6ff]">satellite_alt</span>
          </div>
        )
      }
      <div className="flex-1 min-w-0">
        <div className="font-mono text-sm text-[#e2e2e8] truncate">{file.name}</div>
        <div className="font-mono text-[10px] text-[#c2c6d6]/60">{(file.size / (1024 * 1024)).toFixed(1)} MB</div>
      </div>
      <div className="flex items-center gap-2">
        {valid
          ? <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#4edea3]/10 border border-[#4edea3]/20 font-mono text-[10px] text-[#4edea3]">
              <span className="material-symbols-outlined text-[12px]">verified</span> Valid
            </span>
          : <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#ffb4ab]/10 border border-[#ffb4ab]/20 font-mono text-[10px] text-[#ffb4ab]">
              <span className="material-symbols-outlined text-[12px]">warning</span> Unsupported
            </span>
        }
        <button onClick={onRemove} className="material-symbols-outlined text-[18px] text-[#c2c6d6]/40 hover:text-[#ffb4ab] transition-colors">
          delete
        </button>
      </div>
    </div>
  )
}

export default function Missions() {
  const navigate = useNavigate()
  const inputRef = useRef(null)
  const [files, setFiles] = useState([])
  const [dragging, setDragging] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState('')
  const [projects, setProjects] = useState([])

  useEffect(() => {
    let mounted = true
    projectApi.list()
      .then(data => { if (mounted) setProjects(data?.projects ?? []) })
      .catch(() => {})
    return () => { mounted = false }
  }, [])

  function addFiles(incoming) {
    setError('')
    const arr = Array.from(incoming)
    if (arr.some(f => !SUPPORTED.includes(f.type) && !SUPPORTED_EXT.some(e => f.name.toLowerCase().endsWith(e)))) {
      setError('One or more files are not supported. Please upload GeoTIFF, TIFF, PNG, or JPEG.')
    }
    setFiles(prev => [...prev, ...arr])
  }

  function handleDrop(e) {
    e.preventDefault()
    setDragging(false)
    addFiles(e.dataTransfer.files)
  }

  async function handleAnalyze() {
    if (!files.length) { setError('Please upload at least one image first.'); return }
    setError('')
    setAnalyzing(true)
    try {
      const file = files[0]
      const result = await imageryApi.upload(file)
      // Create a project to attach this analysis to
      await projectApi.create({
        name: `Analysis: ${result.original_filename || result.filename}`,
        description: `Auto-created from uploaded ${result.original_filename || result.filename}`,
      })
      // Navigate to dashboard with the uploaded image ready
      navigate('/dashboard', { state: { imageId: result.image_id } })
    } catch (err) {
      setError(err.message || 'Upload failed. Please try again.')
    } finally {
      setAnalyzing(false)
    }
  }


  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[#0b0c10]">
      <Navbar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar activeKey="History" />

        <main className="flex-1 overflow-y-auto scroll-thin bg-[#0b0c10] flex items-start justify-center p-8">
          <div className="w-full max-w-2xl flex flex-col gap-6">

            <div className="text-center flex flex-col gap-1.5">
              <h1 className="text-2xl font-semibold text-[#e2e2e8]">Analyze Your Satellite Image</h1>
              <p className="text-sm text-[#c2c6d6]">Upload high-resolution imagery for neural processing.</p>
            </div>

            {error && (
              <div className="flex items-center gap-2 px-4 py-3 bg-[#ffb4ab]/10 border border-[#ffb4ab]/30 rounded-xl">
                <span className="material-symbols-outlined text-[18px] text-[#ffb4ab]">error</span>
                <span className="font-mono text-xs text-[#ffb4ab]">{error}</span>
                <button onClick={() => setError('')} className="material-symbols-outlined text-[16px] text-[#ffb4ab]/60 hover:text-[#ffb4ab] ml-auto">close</button>
              </div>
            )}

            {/* Drop zone */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => inputRef.current?.click()}
              onKeyDown={e => e.key === 'Enter' && inputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-xl p-10 flex flex-col items-center gap-4 cursor-pointer transition-colors ${
                dragging
                  ? 'border-[#adc6ff]/60 bg-[#adc6ff]/[0.04]'
                  : 'border-[#adc6ff]/25 hover:border-[#adc6ff]/50 hover:bg-[#adc6ff]/[0.02]'
              }`}
            >
              <div className="w-14 h-14 rounded-xl bg-[#adc6ff]/10 border border-[#adc6ff]/20 flex items-center justify-center">
                <span className="material-symbols-outlined text-[32px] text-[#adc6ff]">cloud_upload</span>
              </div>
              <div className="text-center">
                <p className="text-sm text-[#e2e2e8] font-medium">
                  Drop satellite imagery here or{' '}
                  <span className="text-[#adc6ff] underline">Browse files</span>
                </p>
                <p className="font-mono text-xs text-[#c2c6d6] mt-1">
                  Supported formats: GeoTIFF, TIFF, PNG, JPEG
                </p>
              </div>
              <input
                ref={inputRef}
                type="file"
                multiple
                accept=".tif,.tiff,.png,.jpg,.jpeg,.geotiff,image/tiff,image/png,image/jpeg"
                className="hidden"
                onChange={e => addFiles(e.target.files)}
              />
            </div>

            {/* File list */}
            {files.length > 0 && (
              <div className="flex flex-col gap-3">
                {files.map((f, i) => (
                  <FileRow key={i} file={f} onRemove={() => setFiles(files.filter((_, j) => j !== i))} />
                ))}
              </div>
            )}

            {/* Analyze button */}
            <div className="flex justify-end">
              <button
                onClick={handleAnalyze}
                disabled={analyzing || files.length === 0}
                className="flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 hover:-translate-y-px"
                style={{ background: 'linear-gradient(135deg,#4d8eff 0%,#adc6ff 100%)', color: '#001a42' }}
              >
                {analyzing
                  ? <><span className="w-4 h-4 border-2 border-[#001a42]/40 border-t-[#001a42] rounded-full animate-spin-slow" /> Processing…</>
                  : <><span className="material-symbols-outlined text-[18px]">analytics</span> Analyze Image</>
                }
              </button>
            </div>

            {/* Recent missions — real data from backend */}
            <div className="mt-4">
              <div className="font-mono text-[10px] text-[#c2c6d6]/60 tracking-widest uppercase mb-3">
                Recent Missions
              </div>
              {projects.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-6 text-center">
                  <div className="w-10 h-10 rounded-lg bg-[#adc6ff]/10 border border-[#adc6ff]/20 flex items-center justify-center">
                    <span className="material-symbols-outlined text-[20px] text-[#adc6ff]/60">history</span>
                  </div>
                  <p className="font-mono text-xs text-[#c2c6d6]/60">No missions yet</p>
                  <p className="font-mono text-[10px] text-[#c2c6d6]/40">Upload an image above to create your first mission</p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {projects.map(p => (
                    <div
                      key={p.id}
                      onClick={() => navigate('/layers')}
                      className="flex items-center gap-3 px-4 py-3 bg-[#111318] border border-white/10 rounded-xl cursor-pointer hover:bg-white/[0.02] transition-colors"
                    >
                      <div className="w-8 h-8 rounded flex items-center justify-center flex-shrink-0 bg-[#adc6ff]/10 border border-[#adc6ff]/20">
                        <span className="material-symbols-outlined text-[16px] text-[#adc6ff]">satellite_alt</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-mono text-xs text-[#e2e2e8] truncate">{p.name}</div>
                        <div className="font-mono text-[9px] text-[#c2c6d6]/60 truncate">{p.description}</div>
                      </div>
                      <span className="px-2 py-0.5 rounded-full bg-[#4edea3]/10 border border-[#4edea3]/20 text-[#4edea3] font-mono text-[10px]">Done</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        </main>
      </div>
    </div>
  )
}
