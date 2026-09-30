/**
 * GeoJSON overlay helpers used by Dashboard and Layers to render backend results on the map.
 */

import { api } from './api'

/**
 * Convert a backend GeoJSON FeatureCollection into Leaflet-style overlays.
 * Works with SatMap's overlay format: { type, bounds/latlng, color, tooltip, fillOpacity }
 *
 * Backend detection geometries can be GeoJSON Polygon/MultiPolygon in WGS84 (lat/lng)
 * or pixel-coordinate geometries (clearly labelled by the backend as non-georeferenced).
 */
export function geojsonToOverlays(geojson, color, tooltipPrefix = '') {
  if (!geojson || geojson.type !== 'FeatureCollection') return []

  const overlays = []

  for (const feature of geojson.features || []) {
    const geom = feature.geometry
    const props = feature.properties || {}
    const isPixelCoords = props.note && props.note.toLowerCase().includes('pixel coordinates')

    if (!geom) continue

    // GeoJSON Polygon / MultiPolygon in WGS84 (lat/lng)
    if (geom.type === 'Polygon' || geom.type === 'MultiPolygon') {
      const rings = geom.type === 'Polygon' ? [geom.coordinates[0]] : geom.coordinates.flat()
      for (const ring of rings) {
        if (ring.length < 3) continue
        // GeoJSON is [lng, lat]; Leaflet bounds want [[lat, lng], [lat, lng]]
        const coords = ring.map(p => [p[1], p[0]])
        const minLat = Math.min(...coords.map(c => c[0]))
        const maxLat = Math.max(...coords.map(c => c[0]))
        const minLng = Math.min(...coords.map(c => c[1]))
        const maxLng = Math.max(...coords.map(c => c[1]))
        const bounds = [
          [minLat, minLng],
          [maxLat, maxLng],
        ]
        const label = tooltipPrefix
          ? `${tooltipPrefix} [${Math.round(props.area_m2 || props.area_px || 0)} m²]`
          : (props.feature || 'detected')
        overlays.push({
          type: 'rectangle',
          bounds,
          color: props.fillColor || color,
          fillOpacity: isPixelCoords ? 0.18 : 0.12,
          tooltip: isPixelCoords
            ? `${label} (pixel coords — no real-world area)` : label,
          permanentTooltip: true,
          pixelCoordinates: isPixelCoords,
        })
      }
    }

    // Point features (centroids, detected objects)
    if (geom.type === 'Point') {
      const [lng, lat] = geom.coordinates
      overlays.push({
        type: 'circleMarker',
        latlng: [lat, lng],
        color: props.fillColor || color,
        radius: 7,
        tooltip: props.feature || tooltipPrefix,
        permanentTooltip: false,
      })
    }
  }

  return overlays
}

/**
 * Build a summary line from real backend analysis result.
 */
export function buildSummary(result) {
  if (!result) return null

  const stats = result.statistics || {}
  const dets = result.detections || []
  const parts = []

  if (stats.detection_count != null) parts.push(`${stats.detection_count} feature${stats.detection_count !== 1 ? 's' : ''} detected`)
  if (stats.total_area_m2 != null) parts.push(`${(stats.total_area_m2 / 1e6).toFixed(3)} km²`)
  if (stats.total_area_px != null) parts.push(`${stats.total_area_px.toLocaleString()} px² (image-space)`)
  if (stats.coverage_percent != null) parts.push(`${stats.coverage_percent}% coverage`)
  if (result.confidence != null) parts.push(`confidence ${(result.confidence * 100).toFixed(1)}%`)
  if (result.method) parts.push(`method: ${result.method}`)

  return {
    count: stats.detection_count ?? dets.length ?? 0,
    totalAreaM2: stats.total_area_m2,
    totalAreaPx: stats.total_area_px,
    coveragePercent: stats.coverage_percent,
    confidence: result.confidence,
    method: result.method,
    summary: parts.join(' · '),
    detections: dets.length > 0
      ? dets.reduce((acc, d) => {
          const cls = d.class_name || d.class || d.label || 'unknown'
          acc[cls] = (acc[cls] || 0) + 1
          return acc
        }, {})
      : undefined,
  }
}

/**
 * Fetch the currently active analysis overlay from the backend.
 *
 * The backend has no /analysis/active endpoint — instead, Dashboard stores
 * the last completed analysis_id in localStorage under 'satquery:context'.
 * We read that id and call GET /analysis/{id} to retrieve the real result.
 *
 * Returns { overlays, summary, analysisId } or null when no analysis exists.
 */
export async function getActiveOverlays() {
  let analysisId = null
  try {
    const ctx = JSON.parse(localStorage.getItem('satquery:context') || 'null')
    analysisId = ctx?.analysis_id || null
  } catch { /* no context stored yet */ }

  if (!analysisId) return null

  try {
    const r = await api.get(`/analysis/${analysisId}`)
    // Only render results for completed analyses
    if (!r || r.status !== 'completed') return null

    const result = r.result || r
    const geojsonUrl = result?.visual_evidence?.geojson
    if (!geojsonUrl) return null

    // The geojson field is a URL path — fetch the actual GeoJSON file
    const geojsonRes = await fetch(geojsonUrl)
    if (!geojsonRes.ok) return null
    const geojson = await geojsonRes.json()

    const ANALYSIS_COLORS = {
      water_detection:      '#4edea3',
      vegetation_analysis:  '#6fdc8c',
      built_up_detection:   '#ffb95f',
      building_detection:   '#adc6ff',
      change_detection:     '#ffb4ab',
      landcover:            '#ffb95f',
      feature_highlighting: '#adc6ff',
    }
    const color = ANALYSIS_COLORS[result.task] || '#4edea3'
    const overlays = geojsonToOverlays(geojson, color, result.task || '')
    const summary = buildSummary(result)
    return { overlays, summary, analysisId, detections: summary ? { ...(summary.detections || {}) } : null }
  } catch (err) {
    if (err.status === 404) return null
    throw err
  }
}

/**
 * Send a natural-language question about the currently loaded image to the backend.
 * Submits POST /query, polls GET /analysis/{id} until done, and returns a reply string.
 */
export async function sendQuery(question) {
  const body = { query: question }
  try {
    const ctx = JSON.parse(localStorage.getItem('satquery:context') || 'null')
    if (ctx) {
      if (ctx.latitude != null)  body.latitude  = ctx.latitude
      if (ctx.longitude != null) body.longitude = ctx.longitude
      if (ctx.image_id)          body.image_id  = ctx.image_id
    }
  } catch { /* no map context yet */ }

  // POST /query returns { query_id, analysis_id, task, operation, status, plan }
  const r = await api.post('/query', body)
  if (!r.analysis_id) {
    return { reply: r.task ? `Analysis queued: ${r.task}` : 'Query submitted.' }
  }

  // Poll until the analysis completes (max ~30 s)
  for (let i = 0; i < 20; i++) {
    await new Promise(res => setTimeout(res, 1500))
    try {
      const status = await api.get(`/analysis/${r.analysis_id}`)
      if (status.status === 'completed') {
        const result = status.result || status
        const s = buildSummary(result)
        // Persist the analysis_id so Layers page can pick it up
        try {
          const ctx = JSON.parse(localStorage.getItem('satquery:context') || '{}')
          localStorage.setItem('satquery:context', JSON.stringify({
            ...ctx,
            analysis_id:   r.analysis_id,
            analysis_type: result.task,
          }))
        } catch { /* ignore */ }
        return {
          reply: s?.summary
            || result.explanation
            || `${result.task?.replace(/_/g, ' ')} complete — ${s?.count ?? 0} features found.`,
        }
      }
      if (status.status === 'failed') {
        return { reply: `Analysis failed: ${status.error_message || 'unknown error'}` }
      }
    } catch { /* retry */ }
  }

  return { reply: `Analysis running (${r.task?.replace(/_/g, ' ')})…` }
}
