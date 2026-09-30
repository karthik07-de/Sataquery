/**
 * SatMap — Leaflet-based interactive map for SatQuery AI.
 *
 * Supports two modes controlled by `viewMode` prop:
 *   'map'       → OpenStreetMap (dark Carto tiles)
 *   'satellite' → ArcGIS World Imagery (free, no API key)
 *
 * Also handles overlays (rectangles, circles, markers, polygons)
 * from AI analysis results.
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

/* ── Tile providers — 100% free, no API key, no watermark ── */
const TILES = {
  // Dark map — OSM with dark CSS filter overlay
  map: {
    url:        'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attr:       '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom:    19,
    subdomains: '',
    className:  'map-tiles-dark',
  },
  // Satellite — OpenStreetMap Humanitarian (detailed, free, no watermark)
  satellite: {
    url:        'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attr:       '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom:    19,
    subdomains: '',
  },
  // Labels overlay (OSM-based, no key)
  labels: {
    url:        'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attr:       '',
    maxZoom:    19,
    subdomains: '',
    opacity:    0,  // OSM already includes labels, no extra overlay needed
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

export default function SatMap({
  center     = [35.68, 139.69],
  zoom       = 11,
  viewMode   = 'satellite',
  overlays   = [],
  onMapReady,
  onMouseMove,
  className  = '',
}) {
  const containerRef   = useRef(null)
  const mapRef         = useRef(null)
  const tileLayerRef   = useRef(null)
  const labelLayerRef  = useRef(null)
  const overlayLayersRef = useRef([])
  const locationMarkerRef = useRef(null)

  /* ── Initialise Leaflet map once ── */
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return

    const map = L.map(containerRef.current, {
      center,
      zoom,
      zoomControl:       false,
      attributionControl: true,
    })
    mapRef.current = map

    // Start with satellite tiles
    const tileMode = viewMode === 'map' ? 'map' : 'satellite'
    tileLayerRef.current = L.tileLayer(TILES[tileMode].url, {
      attribution: TILES[tileMode].attr,
      maxZoom:     TILES[tileMode].maxZoom,
      subdomains:  TILES[tileMode].subdomains || 'abc',
    }).addTo(map)

    // Labels overlay for satellite mode
    if (tileMode === 'satellite') {
      labelLayerRef.current = L.tileLayer(TILES.labels.url, {
        attribution: '',
        maxZoom:     19,
        opacity:     0.8,
      }).addTo(map)
    }

    // Mouse-move for coordinate readout
    map.on('mousemove', (e) => {
      onMouseMove?.({ lat: e.latlng.lat, lng: e.latlng.lng })
    })

    onMapReady?.(map)

    return () => {
      map.remove()
      mapRef.current = null
      tileLayerRef.current = null
      labelLayerRef.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /* ── React to viewMode changes ── */
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const tileMode = viewMode === 'map' ? 'map' : 'satellite'
    const tileCfg  = TILES[tileMode]

    // Swap tile layer
    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current)
    }
    tileLayerRef.current = L.tileLayer(tileCfg.url, {
      attribution: tileCfg.attr,
      maxZoom:     tileCfg.maxZoom,
      subdomains:  tileCfg.subdomains || 'abc',
    }).addTo(map)

    // Labels overlay — only for satellite
    if (labelLayerRef.current) {
      map.removeLayer(labelLayerRef.current)
      labelLayerRef.current = null
    }
    if (tileMode === 'satellite') {
      labelLayerRef.current = L.tileLayer(TILES.labels.url, {
        attribution: '',
        maxZoom:     19,
        opacity:     0.8,
      }).addTo(map)
    }
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
