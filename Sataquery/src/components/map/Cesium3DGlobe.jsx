/**
 * Cesium3DGlobe — Realistic 3D Earth Globe for SatQuery AI
 *
 * Strategy:
 *  1. Paint a procedural Earth texture immediately (canvas) — works 100% offline.
 *  2. Attempt to load NASA/Three.js textures in the background; swap them in
 *     if they succeed (CORS permitting).
 *  3. Always render something — no more black screen.
 */

import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'

/* ─────────────────────────────────────────────────────────────────────
   PROCEDURAL EARTH TEXTURE
   Painted on a canvas — zero network dependency, always available.
───────────────────────────────────────────────────────────────────── */
function buildProceduralEarthTexture() {
  const W = 2048, H = 1024
  const canvas = document.createElement('canvas')
  canvas.width = W; canvas.height = H
  const ctx = canvas.getContext('2d')

  /* Ocean base */
  const ocean = ctx.createLinearGradient(0, 0, 0, H)
  ocean.addColorStop(0,    '#0a2744')
  ocean.addColorStop(0.15, '#0d3460')
  ocean.addColorStop(0.5,  '#1a5276')
  ocean.addColorStop(0.85, '#0d3460')
  ocean.addColorStop(1,    '#0a2744')
  ctx.fillStyle = ocean
  ctx.fillRect(0, 0, W, H)

  /* Helper: draw a land mass */
  function land(shapes, colour = '#2d6a3f') {
    ctx.fillStyle = colour
    shapes.forEach(pts => {
      ctx.beginPath()
      pts.forEach(([x, y], i) => i === 0 ? ctx.moveTo(x * W, y * H) : ctx.lineTo(x * W, y * H))
      ctx.closePath()
      ctx.fill()
    })
  }

  /* North America */
  land([[
    [0.04,0.08],[0.18,0.06],[0.24,0.10],[0.28,0.14],[0.30,0.22],
    [0.26,0.30],[0.22,0.36],[0.18,0.42],[0.14,0.48],[0.10,0.52],
    [0.06,0.46],[0.04,0.38],[0.02,0.28],[0.02,0.18],
  ]], '#3a7d4a')

  /* South America */
  land([[
    [0.14,0.52],[0.20,0.50],[0.24,0.54],[0.26,0.62],[0.24,0.72],
    [0.20,0.80],[0.16,0.86],[0.12,0.82],[0.10,0.74],[0.10,0.64],[0.12,0.56],
  ]], '#3d8b4e')

  /* Europe */
  land([[
    [0.42,0.12],[0.50,0.10],[0.54,0.14],[0.52,0.22],[0.46,0.26],
    [0.42,0.24],[0.40,0.18],
  ]], '#4a9455')

  /* Africa */
  land([[
    [0.42,0.30],[0.52,0.28],[0.56,0.34],[0.58,0.44],[0.56,0.58],
    [0.52,0.68],[0.46,0.72],[0.42,0.68],[0.40,0.58],[0.40,0.46],[0.40,0.36],
  ]], '#5aad62')

  /* Asia */
  land([[
    [0.52,0.08],[0.70,0.06],[0.80,0.10],[0.86,0.16],[0.82,0.26],
    [0.76,0.32],[0.68,0.34],[0.60,0.30],[0.54,0.24],[0.52,0.16],
  ]], '#4a9e58')

  /* South-East Asia / Indonesia */
  land([[
    [0.74,0.38],[0.82,0.36],[0.86,0.40],[0.84,0.46],[0.76,0.46],[0.72,0.42],
  ]], '#4a9e58')

  /* Australia */
  land([[
    [0.76,0.54],[0.86,0.52],[0.90,0.58],[0.88,0.68],[0.82,0.72],
    [0.74,0.70],[0.72,0.62],[0.74,0.56],
  ]], '#8aab6a')

  /* Antarctica */
  land([[
    [0,0.92],[0.25,0.90],[0.5,0.92],[0.75,0.90],[1,0.92],[1,1],[0,1],
  ]], '#dce9f0')

  /* Greenland */
  land([[
    [0.20,0.06],[0.28,0.04],[0.32,0.08],[0.30,0.14],[0.22,0.14],
  ]], '#c8dce8')

  /* Ice caps — North Pole */
  const iceCap = ctx.createRadialGradient(W*0.5, 0, 0, W*0.5, 0, H*0.12)
  iceCap.addColorStop(0,   'rgba(230,245,255,0.95)')
  iceCap.addColorStop(0.7, 'rgba(200,225,245,0.60)')
  iceCap.addColorStop(1,   'rgba(180,210,240,0.00)')
  ctx.fillStyle = iceCap
  ctx.fillRect(0, 0, W, H * 0.12)

  /* Shallow ocean tint near coasts */
  ctx.fillStyle = 'rgba(30,90,140,0.18)'
  ctx.fillRect(0, 0, W, H)

  /* Slight atmospheric haze at poles */
  const haze = ctx.createLinearGradient(0, 0, 0, H)
  haze.addColorStop(0,    'rgba(180,220,255,0.20)')
  haze.addColorStop(0.1,  'rgba(180,220,255,0.00)')
  haze.addColorStop(0.9,  'rgba(180,220,255,0.00)')
  haze.addColorStop(1,    'rgba(180,220,255,0.15)')
  ctx.fillStyle = haze
  ctx.fillRect(0, 0, W, H)

  return new THREE.CanvasTexture(canvas)
}

/* lat/lng → THREE.Vector3 on unit sphere */
function latLngToVec3(lat, lng, r = 1) {
  const phi   = (90 - lat)  * (Math.PI / 180)
  const theta = (lng + 180) * (Math.PI / 180)
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
     r * Math.cos(phi),
     r * Math.sin(phi) * Math.sin(theta),
  )
}

/* Pulsing location-marker on the globe surface */
function createLocationMarker(scene, lat, lng) {
  const group   = new THREE.Group()
  const outward = latLngToVec3(lat, lng).normalize()

  /* Cone spike */
  const spikeMesh = new THREE.Mesh(
    new THREE.ConeGeometry(0.018, 0.12, 8),
    new THREE.MeshBasicMaterial({ color: 0xadc6ff }),
  )
  spikeMesh.position.copy(outward.clone().multiplyScalar(1.07))
  spikeMesh.lookAt(outward.clone().multiplyScalar(2))
  spikeMesh.rotateX(Math.PI / 2)

  /* Inner ring */
  const ringMesh = new THREE.Mesh(
    new THREE.RingGeometry(0.028, 0.046, 32),
    new THREE.MeshBasicMaterial({ color: 0xadc6ff, side: THREE.DoubleSide, transparent: true, opacity: 0.8 }),
  )
  ringMesh.position.copy(outward.clone().multiplyScalar(1.015))
  ringMesh.lookAt(outward.clone().multiplyScalar(2))

  /* Outer pulse ring */
  const pulseMat = new THREE.MeshBasicMaterial({ color: 0x4edea3, side: THREE.DoubleSide, transparent: true, opacity: 0.4 })
  const pulseMesh = new THREE.Mesh(new THREE.RingGeometry(0.052, 0.072, 32), pulseMat)
  pulseMesh.position.copy(outward.clone().multiplyScalar(1.015))
  pulseMesh.lookAt(outward.clone().multiplyScalar(2))

  group.add(spikeMesh, ringMesh, pulseMesh)
  scene.add(group)
  return { group, pulse: pulseMesh, pulseMat }
}

/* ══════════════════════════════════════════════════════════════════ */

export default function Cesium3DGlobe({ mapState, className = '' }) {
  const containerRef  = useRef(null)   // ALWAYS rendered — never null on mount
  const rendererRef   = useRef(null)
  const cameraRef     = useRef(null)
  const sceneRef      = useRef(null)
  const earthRef      = useRef(null)
  const cloudsRef     = useRef(null)
  const markerRef     = useRef(null)
  const rafRef        = useRef(null)
  const cleanedUpRef  = useRef(false)
  const dragRef       = useRef({ active: false, x: 0, y: 0 })
  const rotRef        = useRef({ x: 0.3, y: 0 })
  const zoomRef       = useRef(2.8)
  const targetZoomRef = useRef(2.8)
  const initialLatRef = useRef(mapState.lat)
  const initialLngRef = useRef(mapState.lng)

  const [loadState, setLoadState] = useState('loading')
  const [error,     setError]     = useState('')

  useEffect(() => {
    cleanedUpRef.current = false
    const container = containerRef.current
    if (!container) return

    let renderer, scene, camera, earth, clouds
    let markerGroup = null

    function init() {
      const W = container.clientWidth  || 900
      const H = container.clientHeight || 600

      /* ── Renderer ── */
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
      renderer.setSize(W, H)
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      renderer.setClearColor(0x000510, 1)
      container.appendChild(renderer.domElement)
      rendererRef.current = renderer

      /* ── Scene ── */
      scene = new THREE.Scene()
      sceneRef.current = scene

      /* ── Camera ── */
      camera = new THREE.PerspectiveCamera(45, W / H, 0.01, 1000)
      camera.position.z = zoomRef.current
      cameraRef.current = camera

      /* ── Stars ── */
      const starPos = new Float32Array(6000)
      for (let i = 0; i < 2000; i++) {
        const th = Math.random() * 2 * Math.PI
        const ph = Math.acos(2 * Math.random() - 1)
        const r  = 80 + Math.random() * 120
        starPos[i * 3]     = r * Math.sin(ph) * Math.cos(th)
        starPos[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th)
        starPos[i * 3 + 2] = r * Math.cos(ph)
      }
      const starGeo = new THREE.BufferGeometry()
      starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3))
      scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({
        color: 0xffffff, size: 0.22, transparent: true, opacity: 0.9, sizeAttenuation: true,
      })))

      /* ── Earth — procedural texture first (guaranteed to work) ── */
      const proceduralTex = buildProceduralEarthTexture()
      const earthGeo = new THREE.SphereGeometry(1, 64, 64)
      const earthMat = new THREE.MeshPhongMaterial({
        map:      proceduralTex,
        specular: new THREE.Color(0x1a3a5a),
        shininess: 12,
      })
      earth = new THREE.Mesh(earthGeo, earthMat)
      scene.add(earth)
      earthRef.current = earth

      /* ── Atmosphere glow ── */
      const atmoMat = new THREE.MeshPhongMaterial({
        color: 0x4488ff, transparent: true, opacity: 0.07,
        side: THREE.FrontSide, depthWrite: false,
      })
      scene.add(new THREE.Mesh(new THREE.SphereGeometry(1.06, 40, 40), atmoMat))

      /* Outer haze */
      const hazeMat = new THREE.MeshPhongMaterial({
        color: 0x2266cc, transparent: true, opacity: 0.025,
        side: THREE.BackSide, depthWrite: false,
      })
      scene.add(new THREE.Mesh(new THREE.SphereGeometry(1.10, 40, 40), hazeMat))

      /* ── Lights ── */
      scene.add(new THREE.AmbientLight(0xffffff, 0.45))           // raised so dark side is visible
      const sun = new THREE.DirectionalLight(0xfffae8, 1.4)
      sun.position.set(5, 3, 4)
      scene.add(sun)
      const fill = new THREE.DirectionalLight(0x224477, 0.20)
      fill.position.set(-5, -2, -3)
      scene.add(fill)

      /* ── Location marker ── */
      const lat = initialLatRef.current
      const lng = initialLngRef.current
      markerGroup = createLocationMarker(scene, lat, lng)
      markerRef.current = markerGroup
      const tv = latLngToVec3(lat, lng)
      rotRef.current.y = -Math.atan2(tv.x, tv.z)

      /* ── Render loop ── */
      let pulseT = 0
      function animate() {
        if (cleanedUpRef.current) return
        rafRef.current = requestAnimationFrame(animate)

        // Smooth zoom
        zoomRef.current += (targetZoomRef.current - zoomRef.current) * 0.08
        camera.position.z = zoomRef.current

        // Auto-spin when not dragging
        if (!dragRef.current.active) rotRef.current.y += 0.0008

        earth.rotation.set(rotRef.current.x, rotRef.current.y, 0)
        if (clouds) clouds.rotation.set(rotRef.current.x, rotRef.current.y + 0.001, 0)

        // Pulse marker
        if (markerRef.current) {
          markerRef.current.group.rotation.copy(earth.rotation)
          pulseT += 0.04
          markerRef.current.pulse.scale.setScalar(1 + 0.30 * Math.abs(Math.sin(pulseT)))
          markerRef.current.pulseMat.opacity = 0.18 + 0.22 * Math.abs(Math.sin(pulseT))
        }

        renderer.render(scene, camera)
      }
      animate()

      /* Mark ready immediately — procedural texture is already painted */
      if (!cleanedUpRef.current) setLoadState('ready')

      /* ── Try to upgrade to real NASA textures in the background ── */
      tryUpgradeTextures(earth, scene)
    }

    /* Attempt to load NASA textures; silently ignore any failure */
    async function tryUpgradeTextures(earthMesh, sc) {
      const loader = new THREE.TextureLoader()
      const load = (url) => new Promise(res => loader.load(url, res, undefined, () => res(null)))

      /* Pick one reliable CDN — threejs.org serves its own examples */
      const earthTex = await load('https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg')
      if (cleanedUpRef.current || !earthTex) return

      earthMesh.material.map = earthTex
      earthMesh.material.needsUpdate = true

      const bumpTex = await load('https://threejs.org/examples/textures/planets/earth_normal_2048.jpg')
      if (!cleanedUpRef.current && bumpTex) {
        earthMesh.material.bumpMap   = bumpTex
        earthMesh.material.bumpScale = 0.008
        earthMesh.material.needsUpdate = true
      }

      const cloudTex = await load('https://threejs.org/examples/textures/planets/earth_clouds_1024.png')
      if (!cleanedUpRef.current && cloudTex && sc) {
        const cloudMat = new THREE.MeshPhongMaterial({
          map: cloudTex, transparent: true, opacity: 0.36, depthWrite: false,
        })
        clouds = new THREE.Mesh(new THREE.SphereGeometry(1.008, 40, 40), cloudMat)
        sc.add(clouds)
        cloudsRef.current = clouds
      }
    }

    /* ── Resize handler ── */
    function onResize() {
      if (!rendererRef.current || !cameraRef.current) return
      const W = container.clientWidth, H = container.clientHeight
      if (!W || !H) return
      cameraRef.current.aspect = W / H
      cameraRef.current.updateProjectionMatrix()
      rendererRef.current.setSize(W, H)
    }
    window.addEventListener('resize', onResize)

    /* ── Mouse drag ── */
    function onMouseDown(e) {
      dragRef.current = { active: true, x: e.clientX, y: e.clientY }
      container.style.cursor = 'grabbing'
    }
    function onMouseMoveHandler(e) {
      if (!dragRef.current.active) return
      rotRef.current.y += (e.clientX - dragRef.current.x) * 0.005
      rotRef.current.x  = Math.max(-1.4, Math.min(1.4,
        rotRef.current.x + (e.clientY - dragRef.current.y) * 0.005))
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
      rotRef.current.y += (t.clientX - dragRef.current.x) * 0.005
      rotRef.current.x  = Math.max(-1.4, Math.min(1.4,
        rotRef.current.x + (t.clientY - dragRef.current.y) * 0.005))
      dragRef.current = { active: true, x: t.clientX, y: t.clientY }
      e.preventDefault()
    }
    function onTouchEnd() { dragRef.current.active = false }

    /* ── Scroll zoom ── */
    function onWheel(e) {
      e.preventDefault()
      targetZoomRef.current = Math.max(1.2, Math.min(8, targetZoomRef.current + e.deltaY * 0.003))
    }

    /* Attach all listeners */
    container.addEventListener('mousedown',  onMouseDown)
    window   .addEventListener('mousemove',  onMouseMoveHandler)
    window   .addEventListener('mouseup',    onMouseUp)
    container.addEventListener('touchstart', onTouchStart, { passive: false })
    container.addEventListener('touchmove',  onTouchMove,  { passive: false })
    container.addEventListener('touchend',   onTouchEnd)
    container.addEventListener('wheel',      onWheel, { passive: false })

    try {
      init()
    } catch (err) {
      console.error('[Cesium3DGlobe] init error:', err)
      if (!cleanedUpRef.current) { setError(err.message); setLoadState('error') }
    }

    return () => {
      cleanedUpRef.current = true
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      window   .removeEventListener('resize',    onResize)
      window   .removeEventListener('mousemove', onMouseMoveHandler)
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

  /* ── Fly to new location on mapState change ── */
  useEffect(() => {
    if (loadState !== 'ready') return
    const scene = sceneRef.current
    const earth = earthRef.current
    if (!scene || !earth) return

    /* Replace marker */
    if (markerRef.current) scene.remove(markerRef.current.group)
    markerRef.current = createLocationMarker(scene, mapState.lat, mapState.lng)

    /* Animate globe rotation toward the location */
    const tv      = latLngToVec3(mapState.lat, mapState.lng)
    const targetY = -Math.atan2(tv.x, tv.z)
    const startY  = rotRef.current.y
    let diff = targetY - (startY % (2 * Math.PI))
    if (diff >  Math.PI) diff -= 2 * Math.PI
    if (diff < -Math.PI) diff += 2 * Math.PI

    const t0 = performance.now(), dur = 1200
    function step(now) {
      const p = Math.min((now - t0) / dur, 1)
      const e = 1 - Math.pow(1 - p, 3)
      rotRef.current.y = startY + diff * e
      if (p < 1 && !cleanedUpRef.current) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)

    /* Zoom */
    targetZoomRef.current = Math.max(1.3, Math.min(5, 4.5 - (mapState.zoom || 11) * 0.1))
  }, [mapState.lat, mapState.lng, mapState.zoom, loadState])

  /* ══════════════════════════════════════════════════════════
     JSX — canvas div ALWAYS rendered; overlays on top of it
  ══════════════════════════════════════════════════════════ */
  return (
    <div className={`w-full h-full relative ${className}`} style={{ background: '#000510' }}>

      {/* Canvas target — ALWAYS mounted so useEffect ref is valid */}
      <div
        ref={containerRef}
        className="absolute inset-0"
        style={{ cursor: loadState === 'ready' ? 'grab' : 'default' }}
      />

      {/* Loading overlay */}
      {loadState === 'loading' && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#000510]">
          <div className="flex flex-col items-center gap-4">
            <div className="relative w-16 h-16">
              <div className="absolute inset-0 border-2 border-[#adc6ff]/10 rounded-full" />
              <div className="absolute inset-0 border-2 border-transparent border-t-[#adc6ff] rounded-full animate-spin" />
              <div className="absolute inset-2 border border-[#4edea3]/20 rounded-full" />
            </div>
            <div className="text-center">
              <p className="font-mono text-[11px] text-[#adc6ff] mb-1 tracking-widest uppercase">3D Earth</p>
              <p className="font-mono text-[10px] text-[#c2c6d6]/50">Building scene…</p>
            </div>
          </div>
        </div>
      )}

      {/* Error overlay */}
      {loadState === 'error' && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#000510]">
          <div className="text-center max-w-sm px-6">
            <span className="material-symbols-outlined text-[40px] text-[#ffb4ab] block mb-3">public</span>
            <p className="font-mono text-sm text-[#ffb4ab] font-bold mb-2">3D Globe failed to load</p>
            <p className="font-mono text-[10px] text-[#c2c6d6]/50 mb-4">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-[#adc6ff]/10 border border-[#adc6ff]/30 rounded-lg
                font-mono text-[10px] text-[#adc6ff] hover:bg-[#adc6ff]/20 transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* UI chrome — shown when ready */}
      {loadState === 'ready' && (
        <>
          <div className="absolute top-3 left-3 z-10 pointer-events-none">
            <div className="flex items-center gap-1.5 px-2.5 py-1
              bg-[#0c0e12]/70 border border-[#adc6ff]/20 rounded-lg backdrop-blur-sm">
              <span className="material-symbols-outlined text-[12px] text-[#adc6ff]">public</span>
              <span className="font-mono text-[9px] text-[#adc6ff] font-bold tracking-widest">3D EARTH</span>
            </div>
          </div>
          <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
            <div className="flex items-center gap-2 px-3 py-1.5
              bg-[#0c0e12]/60 border border-white/10 rounded-full">
              <span className="material-symbols-outlined text-[11px] text-[#c2c6d6]/50">open_with</span>
              <span className="font-mono text-[9px] text-[#c2c6d6]/50">
                Drag to rotate · Scroll to zoom
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
