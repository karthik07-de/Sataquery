import { api } from './api'

/**
 * Layers API — matches the FastAPI backend endpoints:
 *   GET /analyses/{analysis_id}/layers  → list all layers for an analysis
 *   GET /layers/{layer_id}              → get a single layer by id
 *
 * Layer types returned by the backend:
 *   detection_mask, polygon, bounding_box, heatmap, imagery
 *
 * layer_id format: "<analysis_id>:<artifact>" e.g. "abc123:geojson"
 */
export const layersApi = {
  /**
   * GET /analyses/{analysis_id}/layers
   * @param {string} analysisId
   * @returns {Promise<{ analysis_id: string, layers: Array }>}
   */
  async listForAnalysis(analysisId) {
    return api.get(`/analyses/${analysisId}/layers`)
  },

  /**
   * GET /layers/{layer_id}
   * @param {string} layerId  – format "<analysis_id>:<artifact>"
   * @returns {Promise<object>} LayerResponse
   */
  async get(layerId) {
    return api.get(`/layers/${encodeURIComponent(layerId)}`)
  },

  /**
   * Convenience: load layers for the most recently completed analysis stored
   * in localStorage (satquery:context.analysis_id).
   * Returns [] when nothing is stored yet.
   * @returns {Promise<Array>}
   */
  async listActive() {
    let analysisId = null
    try {
      const ctx = JSON.parse(localStorage.getItem('satquery:context') || 'null')
      analysisId = ctx?.analysis_id || null
    } catch { /* nothing stored */ }

    if (!analysisId) return []
    try {
      const res = await this.listForAnalysis(analysisId)
      return res?.layers ?? []
    } catch (err) {
      if (err.status === 404) return []
      throw err
    }
  },
}
