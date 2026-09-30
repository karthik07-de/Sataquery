import { api } from './api'

/**
 * Geodata API — matches the FastAPI backend endpoint:
 *   POST /geodata
 *
 * Parses a natural-language location query, geocodes it via OpenStreetMap
 * Nominatim, fetches real feature geometries (water, vegetation, built-up,
 * agriculture) from the Overpass API, and returns a GeoJSON FeatureCollection
 * ready to render on the map.
 *
 * Request:  { query: string }
 * Response: {
 *   query, location, latitude, longitude, zoom,
 *   feature_type, feature_count, total_area_m2,
 *   geojson: FeatureCollection,
 *   message
 * }
 */
export const geodataApi = {
  /**
   * POST /geodata
   * @param {string} query  Natural-language query, e.g. "Show water bodies in Bangalore"
   * @returns {Promise<GeoDataResponse>}
   */
  async query(query) {
    return api.post('/geodata', { query })
  },

  /**
   * Submit a geodata query and convert the response into the location + overlay
   * format expected by Dashboard / Layers.
   *
   * Returns:
   *   {
   *     location: { label, center: [lat, lng], zoom },
   *     overlays: Array,    // SatMap rectangle/circleMarker overlays
   *     summary:  string,   // human-readable summary line
   *     geojson:  object,   // raw FeatureCollection for further use
   *   }
   * or throws on error.
   *
   * @param {string} query
   * @returns {Promise<{ location, overlays, summary, geojson }>}
   */
  async queryAndParse(query) {
    const r = await this.query(query)

    // Build a location object compatible with handleLocationSelect / mapState.goTo
    const location = {
      label:  r.location || query,
      center: [r.latitude, r.longitude],
      zoom:   r.zoom ?? 12,
    }

    // Convert the GeoJSON FeatureCollection into SatMap overlays
    const overlays = _geojsonToOverlays(r.geojson, '#4edea3')

    const areaKm2 = r.total_area_m2 != null
      ? ` · ${(r.total_area_m2 / 1e6).toFixed(2)} km²`
      : ''
    const summary = r.message
      || `${r.feature_count ?? overlays.length} ${(r.feature_type || 'features').replace(/_/g, ' ')} found${areaKm2}`

    return { location, overlays, summary, geojson: r.geojson }
  },
}

/* ── Internal: convert a GeoJSON FeatureCollection to SatMap overlays ── */
function _geojsonToOverlays(geojson, color) {
  if (!geojson || geojson.type !== 'FeatureCollection') return []
  const overlays = []

  for (const feature of geojson.features || []) {
    const geom  = feature.geometry
    const props = feature.properties || {}
    if (!geom) continue

    if (geom.type === 'Polygon' || geom.type === 'MultiPolygon') {
      const rings =
        geom.type === 'Polygon'
          ? [geom.coordinates[0]]
          : geom.coordinates.flat()

      for (const ring of rings) {
        if (ring.length < 3) continue
        // GeoJSON is [lng, lat] — Leaflet wants [[lat, lng], ...]
        const coords  = ring.map(p => [p[1], p[0]])
        const minLat  = Math.min(...coords.map(c => c[0]))
        const maxLat  = Math.max(...coords.map(c => c[0]))
        const minLng  = Math.min(...coords.map(c => c[1]))
        const maxLng  = Math.max(...coords.map(c => c[1]))
        const areaStr = props.area_m2 != null
          ? ` [${(props.area_m2 / 1e6).toFixed(3)} km²]`
          : ''
        overlays.push({
          type:             'rectangle',
          bounds:           [[minLat, minLng], [maxLat, maxLng]],
          color:            props.fillColor || color,
          fillOpacity:      0.15,
          tooltip:          `${props.name || props.feature || 'feature'}${areaStr}`,
          permanentTooltip: false,
        })
      }
    }

    if (geom.type === 'Point') {
      const [lng, lat] = geom.coordinates
      overlays.push({
        type:             'circleMarker',
        latlng:           [lat, lng],
        color:            props.fillColor || color,
        radius:           7,
        tooltip:          props.name || props.feature || 'feature',
        permanentTooltip: false,
      })
    }
  }

  return overlays
}
