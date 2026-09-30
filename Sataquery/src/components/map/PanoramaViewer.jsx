/**
 * PanoramaViewer — Immersive 360° panorama using Three.js
 *
 * Renders a full equirectangular 360° panorama inside an inverted sphere.
 *
 * KEY FIX: The canvas container div is ALWAYS rendered immediately (same
 * pattern as Cesium3DGlobe). Loading / error states are absolute overlays
 * on top, so containerRef.current is never null when useEffect fires.
 *
 * Controls:
 *   Mouse drag / touch drag → look around
 *   Scroll wheel            → zoom (FOV)
 *   Reset button            → back to centre
 */

import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'

/* ── Free equirectangular panorama images (CC0 / public domain) ── */
const PANORAMA_URLS = [
  // Three.js example texture — guaranteed to exist alongside the library
  'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/2294472375_24a3b8ef46_o.jpg',
  'https://threejs.org/examples/textures/2294472375_24a3b8ef46_o.jpg',
]

function loadTexture(urls) {
  return new Promise((resolve, reject) => {
    const loader = new THREE.TextureLoader()
    let i = 0
    function next() {
      if (i >= urls.length) { reject(new Error('All panorama sources failed')); return }
      loader.load(urls[i], resolve, undefined, () => { i++; next() })
    }
    next()
  })
}

/* Procedural sky — used as guaranteed fallback when all URLs fail */
function makeSkyTexture() {
  const W = 2048, H = 1024
  const canvas = document.createElement('canvas')
  canvas.width = W; canvas.height = H
  const ctx = canvas.getContext('2d')

  // Sky gradient
  const grad = ctx.createLinearGradient(0, 0, 0, H)
  grad.addColorStop(0,    '#020818')
  grad.addColorStop(0.35, '#0a1628')
  grad.addColorStop(0.55, '#1a3a5c')
  grad.addColorStop(0.65, '#2d5a8e')
  grad.addColorStop(0.72, '#4a7ab5')
  grad.addColorStop(1,    '#e8c878')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, W, H)

  // Stars (upper hemisphere only)
  ctx.fillStyle = 'rgba(255,255,255,0.92)'
  for (let s = 0; s < 1200; s++) {
    const x = Math.random() * W
    const y = Math.random() * H * 0.58
    const r = Math.random() * 1.6
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
  }

  // Horizon glow
  const haze = ctx.createLinearGradient(0, H * 0.62, 0, H * 0.74)
  haze.addColorStop(0, 'rgba(255,200,100,0.00)')
  haze.addColorStop(1, 'rgba(255,175,50,0.22)')
  ctx.fillStyle = haze
  ctx.fillRect(0, 0, W, H)

  return new THREE.CanvasTexture(canvas)
}

/* ═══════════════════════════════════════════════════════════════ */

export default function PanoramaViewer({ location, onExit, className = '' }) {
  /* containerRef is on the INNER canvas div — always in the DOM */
  const containerRef = useRef(null)
  const rendererRef  = useRef(null)
  const cameraRef    = useRef(null)
  const rafRef       = useRef(null)
  const cleanupRef   = useRef(false)

  /* Camera state — mutated directly for perf, read each frame */
  const lonRef  = useRef(0)
  const latRef  = useRef(0)
  const fovRef  = useRef(75)
  const dragRef = useRef({ active: false, x: 0, y: 0 })

  const [loadState, setLoadState] = useState('loading')
  const [error,     setError]     = useState('')
  const [isProcedural, setIsProcedural] = useState(false)

  useEffect(() => {
    cleanupRef.current = false
    const container = containerRef.current
    if (!container) return

    let renderer, camera

    async function init() {
      /* ── Load panorama texture ── */
      let texture
      let usedFallback = false
      try {
        texture = await loadTexture(PANORAMA_URLS)
      } catch {
        texture = makeSkyTexture()
        usedFallback = true
      }

      if (cleanupRef.current) return

      const W = container.clientWidth  || 900
      const H = container.clientHeight || 600

      /* ── Renderer ── */
      renderer = new THREE.WebGLRenderer({ antialias: true })
      renderer.setSize(W, H)
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      container.appendChild(renderer.domElement)
      rendererRef.current = renderer

      /* ── Scene & Camera ── */
      const scene = new THREE.Scene()
      camera = new THREE.PerspectiveCamera(fovRef.current, W / H, 0.01, 1000)
      camera.position.set(0, 0, 0.001)
      cameraRef.current = camera

      /* ── Inverted sphere (viewer is inside looking out) ── */
      const geo = new THREE.SphereGeometry(500, 60, 40)
      geo.scale(-1, 1, 1)          // flip normals so texture visible from inside
      const mat = new THREE.MeshBasicMaterial({ map: texture })
      scene.add(new THREE.Mesh(geo, mat))

      /* ── Render loop ── */
      function animate() {
        if (cleanupRef.current) return
        rafRef.current = requestAnimationFrame(animate)

        /* Clamp vertical look */
        latRef.current = Math.max(-85, Math.min(85, latRef.current))

        /* Spherical → Cartesian look-at point */
        const phi   = THREE.MathUtils.degToRad(90 - latRef.current)
        const theta = THREE.MathUtils.degToRad(lonRef.current)
        camera.lookAt(
          500 * Math.sin(phi) * Math.cos(theta),
          500 * Math.cos(phi),
          500 * Math.sin(phi) * Math.sin(theta),
        )

        renderer.render(scene, camera)
      }
      animate()

      if (!cleanupRef.current) {
        setIsProcedural(usedFallback)
        setLoadState('ready')
      }
    }

    init().catch(err => {
      console.error('[PanoramaViewer]', err)
      if (!cleanupRef.current) { setError(err.message); setLoadState('error') }
    })

    /* ── Resize ── */
    function onResize() {
      if (!renderer || !camera) return
      const W = container.clientWidth, H = container.clientHeight
      if (!W || !H) return
      camera.aspect = W / H
      camera.updateProjectionMatrix()
      renderer.setSize(W, H)
    }
    window.addEventListener('resize', onResize)

    /* ── Mouse drag ── */
    function onMouseDown(e) {
      dragRef.current = { active: true, x: e.clientX, y: e.clientY }
      container.style.cursor = 'grabbing'
    }
    function onMouseMove(e) {
      if (!dragRef.current.active) return
      lonRef.current -= (e.clientX - dragRef.current.x) * 0.15
      latRef.current += (e.clientY - dragRef.current.y) * 0.15
      dragRef.current = { active: true, x: e.clientX, y: e.clientY }
    }
    function onMouseUp() {
      dragRef.current.active = false
      container.style.cursor = 'grab'
    }

    /* ── Touch drag ── */
    function onTouchStart(e) {
      const t = e.touches[0]
      dragRef.current = { active: true, x: t.clientX, y: t.clientY }
    }
    function onTouchMove(e) {
      if (!dragRef.current.active || !e.touches[0]) return
      const t = e.touches[0]
      lonRef.current -= (t.clientX - dragRef.current.x) * 0.15
      latRef.current += (t.clientY - dragRef.current.y) * 0.15
      dragRef.current = { active: true, x: t.clientX, y: t.clientY }
      e.preventDefault()
    }
    function onTouchEnd() { dragRef.current.active = false }

    /* ── Scroll zoom ── */
    function onWheel(e) {
      e.preventDefault()
      fovRef.current = Math.max(20, Math.min(120, fovRef.current + e.deltaY * 0.04))
      if (cameraRef.current) {
        cameraRef.current.fov = fovRef.current
        cameraRef.current.updateProjectionMatrix()
      }
    }

    container.addEventListener('mousedown',  onMouseDown)
    window   .addEventListener('mousemove',  onMouseMove)
    window   .addEventListener('mouseup',    onMouseUp)
    container.addEventListener('touchstart', onTouchStart, { passive: false })
    container.addEventListener('touchmove',  onTouchMove,  { passive: false })
    container.addEventListener('touchend',   onTouchEnd)
    container.addEventListener('wheel',      onWheel, { passive: false })

    return () => {
      cleanupRef.current = true
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      window   .removeEventListener('resize',    onResize)
      window   .removeEventListener('mousemove', onMouseMove)
      window   .removeEventListener('mouseup',   onMouseUp)
      container.removeEventListener('mousedown',  onMouseDown)
      container.removeEventListener('touchstart', onTouchStart)
      container.removeEventListener('touchmove',  onTouchMove)
      container.removeEventListener('touchend',   onTouchEnd)
      container.removeEventListener('wheel',      onWheel)
      if (rendererRef.current) {
        try {
          if (container.contains(rendererRef.current.domElement))
            container.removeChild(rendererRef.current.domElement)
          rendererRef.current.dispose()
        } catch { /* ignore cleanup errors */ }
        rendererRef.current = null
      }
    }
  }, [])  

  /* ── Reset camera ── */
  function handleReset() {
    lonRef.current = 0
    latRef.current = 0
    fovRef.current = 75
    if (cameraRef.current) {
      cameraRef.current.fov = 75
      cameraRef.current.updateProjectionMatrix()
    }
  }

  /* ════════════════════════════════════════════════════════════════
     RENDER — canvas div ALWAYS present; overlays sit on top of it
  ════════════════════════════════════════════════════════════════ */
  return (
    <div
      className={`w-full h-full relative ${className}`}
      style={{ background: '#000510', overflow: 'hidden' }}
    >
      {/* ── Canvas target — always mounted ── */}
      <div
        ref={containerRef}
        className="absolute inset-0"
        style={{ cursor: 'grab' }}
      />

      {/* ── Loading overlay ── */}
      {loadState === 'loading' && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#000510]">
          <div className="flex flex-col items-center gap-4">
            <div className="relative w-14 h-14">
              <div className="absolute inset-0 border-2 border-[#4edea3]/15 rounded-full" />
              <div className="absolute inset-0 border-2 border-transparent border-t-[#4edea3] rounded-full animate-spin" />
            </div>
            <p className="font-mono text-[10px] text-[#c2c6d6]/50 tracking-widest uppercase">
              Loading 360° panorama…
            </p>
          </div>
        </div>
      )}

      {/* ── Error overlay ── */}
      {loadState === 'error' && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#000510]">
          <div className="text-center max-w-sm px-6">
            <span className="material-symbols-outlined text-[40px] text-[#ffb4ab] block mb-3">360</span>
            <p className="font-mono text-sm text-[#ffb4ab] font-bold mb-2">360° view unavailable</p>
            <p className="font-mono text-[10px] text-[#c2c6d6]/50 mb-4">{error}</p>
            <button
              onClick={onExit}
              className="px-4 py-2 bg-[#adc6ff]/10 border border-[#adc6ff]/30 rounded-lg
                font-mono text-[10px] text-[#adc6ff] hover:bg-[#adc6ff]/20 transition-colors"
            >
              Return to Map
            </button>
          </div>
        </div>
      )}

      {/* ── UI chrome — only when ready ── */}
      {loadState === 'ready' && (
        <>
          {/* Top bar */}
          <div className="absolute top-0 left-0 right-0 z-20 flex items-center gap-3 px-4 py-3
            bg-[#0c0e12]/80 backdrop-blur-md border-b border-white/10">

            <button
              onClick={onExit}
              className="flex items-center gap-2 px-3 py-1.5 bg-[#111318] border border-white/15
                rounded-lg font-mono text-[11px] text-[#c2c6d6] hover:border-[#adc6ff]/40
                hover:text-[#adc6ff] transition-colors"
            >
              <span className="material-symbols-outlined text-[14px]">arrow_back</span>
              Back to map
            </button>

            <div className="w-px h-5 bg-white/10" />

            <div className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[15px] text-[#4edea3]">360</span>
              <span className="font-mono text-[10px] text-[#4edea3] font-bold tracking-widest">360° VIEW</span>
            </div>

            {location?.label && (
              <>
                <div className="w-px h-5 bg-white/10" />
                <span className="font-mono text-[11px] text-[#c2c6d6]/70 truncate min-w-0">
                  {location.label}
                </span>
              </>
            )}

            <div className="flex-1" />

            <button
              onClick={handleReset}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#111318] border border-white/10
                rounded-lg font-mono text-[10px] text-[#c2c6d6] hover:border-[#adc6ff]/30
                hover:text-[#adc6ff] transition-colors"
              title="Reset view"
            >
              <span className="material-symbols-outlined text-[13px]">my_location</span>
              Reset
            </button>
          </div>

          {/* Centre crosshair */}
          <div className="absolute inset-0 z-10 pointer-events-none flex items-center justify-center">
            <div className="relative w-5 h-5 opacity-40">
              <div className="absolute top-1/2 inset-x-0 h-px bg-white -translate-y-1/2" />
              <div className="absolute left-1/2 inset-y-0 w-px bg-white -translate-x-1/2" />
            </div>
          </div>

          {/* Bottom hint */}
          <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
            <div className="flex items-center gap-2 px-4 py-2 bg-[#0c0e12]/70 border border-white/10
              rounded-full backdrop-blur-sm">
              <span className="material-symbols-outlined text-[12px] text-[#4edea3]">pan_tool</span>
              <span className="font-mono text-[10px] text-[#c2c6d6]/70">
                Drag to look around · Scroll to zoom
              </span>
            </div>
          </div>

          {/* Demo badge (shown when using procedural fallback) */}
          {isProcedural && (
            <div className="absolute top-16 right-4 z-20 pointer-events-none">
              <div className="px-2.5 py-1 bg-[#ffb95f]/10 border border-[#ffb95f]/20 rounded-lg">
                <span className="font-mono text-[8px] text-[#ffb95f]/80 uppercase tracking-widest">
                  Demo Sky
                </span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
