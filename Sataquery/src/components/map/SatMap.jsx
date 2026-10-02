/**
 * SatMap — Leaflet-based interactive map for SatQuery AI.
 *
 * Supports two modes controlled by `viewMode` prop:
 *   'map'       → OpenStreetMap street tiles
 *   'satellite' → Esri World Imagery (real satellite photos, no API key)
 *
 * Props:
 *   center      [lat, lng]
 *   zoom        number
 *   viewMode    'map' | 'satellite'
 *   overlays    SatQuery overlay descriptors
 *   onMapReady  (mapInstance) => void
 *   onMouseMove ({ lat, lng }) => void
 *   className   string
 */
import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Fix Leaflet default icon paths broken by Vite bundling
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

/* ── Tile providers — no API key required ── */
const TILES = {
  // Street / road map — OpenStreetMap
  map: {
    url:        'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attr:       '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom:    19,
    className:  'map-tiles-dark',
  },
  // Real satellite imagery — Esri World Imagery (free, no key)
  satellite: {
    url:        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attr:       'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
    maxZoom:    19,
  },
}

/* ── Custom SatQuery location pin ── */
const LOCATION_ICON = L.divIcon({
  className: '',
  html: `<svg width="28" height="36" viewBox="0 0 28 36" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M14 0C6.27 0 0 6.27 0 14c0 9.75 14 22 14 22s14-12.25 14-22C28 6.27 21.73 0 14 0z" fill="#adc6ff"/>
    <circle cx="14" cy="14" r="5" fill="#0b0c10"/>
    <circle cx="14" cy="14" r="2" fill="#adc6ff"/>
  </svg>`,
  iconSize:   [28, 36],
  iconAnchor: [14, 36],
  popupAnchor:[0, -36],
})

/** Returns the right tile config — any non-'map' value defaults to satellite */
function getTileCfg(viewMode) {
  return viewMode === 'map' ? TILES.map : TILES.satellite
}

export default function SatMap({
  center     = [35.68, 139.69],
  zoom       = 11,
  viewMode   = 'satellite',
  overlays   = [],
  onMapReady,
  onMouseMove,
  className  = '',
}) {
  const containerRef      = useRef(null)
  const mapRef            = useRef(null)
  const tileLayerRef      = useRef(null)
  const overlayLayersRef  = useRef([])
  const locationMarkerRef = useRef(null)

  // Keep a ref to viewMode so the init effect always uses the latest value
  const viewModeRef = useRef(viewMode)
  useEffect(() => { viewModeRef.current = viewMode }, [viewMode])

  /* ── Initialise Leaflet map once ── */
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return

    const map = L.map(containerRef.current, {
      center,
      zoom,
      zoomControl:        false,
      attributionControl: true,
    })
    mapRef.current = map

    // Use the current viewMode (via ref) so we always start on the right tiles
    const tileCfg = getTileCfg(viewModeRef.current)
    tileLayerRef.current = L.tileLayer(tileCfg.url, {
      attribution: tileCfg.attr,
      maxZoom:     tileCfg.maxZoom,
      className:   tileCfg.className || '',
    }).addTo(map)

    // Mouse-move for coordinate readout
    map.on('mousemove', (e) => {
      onMouseMove?.({ lat: e.latlng.lat, lng: e.latlng.lng })
    })

    onMapReady?.(map)

    return () => {
      map.remove()
      mapRef.current        = null
      tileLayerRef.current  = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /* ── React to viewMode changes after mount ── */
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const tileCfg = getTileCfg(viewMode)

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current)
    }
    tileLayerRef.current = L.tileLayer(tileCfg.url, {
      attribution: tileCfg.attr,
      maxZoom:     tileCfg.maxZoom,
      className:   tileCfg.className || '',
    }).addTo(map)
  }, [viewMode])

  /* ── React to center/zoom prop changes ── */
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    map.setView(center, zoom, { animate: true, duration: 0.8 })

    // Update location marker
    if (locationMarkerRef.current) {
      map.removeLayer(locationMarkerRef.current)
    }
    locationMarkerRef.current = L.marker(center, { icon: LOCATION_ICON, zIndexOffset: 1000 })
      .addTo(map)
  }, [center[0], center[1], zoom]) // eslint-disable-line

  /* ── React to overlay changes ── */
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    overlayLayersRef.current.forEach(l => map.removeLayer(l))
    overlayLayersRef.current = []

    overlays.forEach(o => {
      const opts = {
        color:       o.color     || '#4edea3',
        weight:      o.weight    ?? 1.5,
        fillColor:   o.fillColor || o.color || '#4edea3',
        fillOpacity: o.fillOpacity ?? 0.15,
        opacity:     0.9,
      }
      let layer
      if (o.type === 'rectangle') {
        layer = L.rectangle(o.bounds, opts)
      } else if (o.type === 'circle') {
        layer = L.circle(o.latlng, { ...opts, radius: o.radius || 500 })
      } else if (o.type === 'circleMarker') {
        layer = L.circleMarker(o.latlng, { ...opts, radius: o.radius || 6 })
      } else if (o.type === 'polygon') {
        layer = L.polygon((o.latlngs || []).map(ll => [ll[0], ll[1]]), opts)
      } else {
        layer = L.marker(o.latlng || center, { icon: LOCATION_ICON })
      }
      if (o.tooltip) {
        layer.bindTooltip(o.tooltip, { permanent: false, direction: 'top', opacity: 0.95 })
      }
      layer.addTo(map)
      overlayLayersRef.current.push(layer)
    })
  }, [overlays]) // eslint-disable-line

  return (
    <div
      ref={containerRef}
      className={`w-full h-full ${className}`}
      style={{ background: '#111318' }}
    />
  )
}
