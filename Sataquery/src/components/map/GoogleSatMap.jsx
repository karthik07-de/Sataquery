/**
 * GoogleSatMap — replaced with a free Leaflet/Esri implementation.
 *
 * The original used @react-google-maps/api which:
 *  - Shows "API KEY REQUIRED" watermark across the entire page without a key
 *  - Renders an invisible overlay that blocks all clicks (upload button, etc.)
 *
 * This version uses Leaflet with free Esri World Imagery tiles (no API key).
 * It accepts the same props as the original so all consumers work unchanged.
 *
 * Props:
 *   center        [lat, lng]
 *   zoom          number
 *   mapStyle      'satellite' | 'dark'   — satellite = Esri, dark = Carto dark
 *   overlays      SatMap-style overlay descriptors
 *   onMapReady    (map) => void
 *   onMouseMove   ({lat,lng}) => void
 *   className     string
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

const TILE_PROVIDERS = {
  // Google Maps satellite tiles — no API key required
  satellite: {
    url:        'https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
    attr:       '&copy; Google',
    subdomains: ['0', '1', '2', '3'],
  },
  // Carto Dark road map — no API key required
  dark: {
    url:  'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attr: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>',
  },
}

export default function GoogleSatMap({
  center     = [35.68, 139.69],
  zoom       = 11,
  mapStyle   = 'satellite',
  overlays   = [],
  onMapReady,
  onMouseMove,
  className  = '',
}) {
  const containerRef   = useRef(null)
  const mapRef         = useRef(null)
  const overlayLayersRef = useRef([])

  /* ── Init map once ── */
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return

    const provider = TILE_PROVIDERS[mapStyle] || TILE_PROVIDERS.satellite

    const map = L.map(containerRef.current, {
      center,
      zoom,
      zoomControl:        false,
      attributionControl: true,
    })
    mapRef.current = map

    L.tileLayer(provider.url, {
      attribution: provider.attr,
      maxZoom:     21,
      subdomains:  provider.subdomains || 'abc',
    }).addTo(map)

    map.on('mousemove', e => {
      onMouseMove?.({ lat: e.latlng.lat, lng: e.latlng.lng })
    })

    onMapReady?.(map)

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Sync center/zoom ── */
  useEffect(() => {
    mapRef.current?.setView(center, zoom)
  }, [center[0], center[1], zoom]) // eslint-disable-line

  /* ── Render overlays ── */
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    overlayLayersRef.current.forEach(l => map.removeLayer(l))
    overlayLayersRef.current = []

    overlays.forEach(o => {
      const opts = {
        color:       o.color       || '#4edea3',
        fillColor:   o.fillColor   || o.color || '#4edea3',
        fillOpacity: o.fillOpacity ?? 0.15,
        weight: 1.5,
        opacity: 0.9,
      }
      let layer
      if (o.type === 'rectangle') {
        layer = L.rectangle(o.bounds, opts)
      } else if (o.type === 'circle' || o.type === 'circleMarker') {
        layer = L.circleMarker(o.latlng, { ...opts, radius: o.radius || 7 })
      } else {
        layer = L.marker(o.latlng || center)
      }
      if (o.tooltip) layer.bindTooltip(o.tooltip, { permanent: false, direction: 'top' })
      layer.addTo(map)
      overlayLayersRef.current.push(layer)
    })
  }, [overlays]) // eslint-disable-line

  return (
    <div
      ref={containerRef}
      className={`w-full h-full ${className}`}
      style={{ background: '#0b0c10' }}
    />
  )
}
