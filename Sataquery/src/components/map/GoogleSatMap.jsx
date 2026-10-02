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
  // Esri ArcGIS Online — real satellite imagery, no key
  satellite: {
    url:        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attr:       'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
    subdomains: '',
  },
  // OSM dark for dark mode
  dark: {
    url:        'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attr:       '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    subdomains: '',
    className:  'map-tiles-dark',
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
      maxZoom:     19,
      subdomains:  provider.subdomains || '',
      className:   provider.className || '',
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
