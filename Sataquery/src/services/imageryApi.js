import { api } from './api'

/**
 * Imagery API — matches the FastAPI backend endpoints:
 *   POST /images/upload     → upload a satellite image
 *   GET  /imagery/search    → search Copernicus/Sentinel catalogs
 *   GET  /imagery/sources   → check configured data sources
 */
export const imageryApi = {
  /**
   * POST /images/upload (multipart/form-data)
   * Upload a satellite image (PNG/JPEG/TIFF/GeoTIFF).
   * @param {File} file
   * @returns {Promise<{image_id, filename, width, height, is_georeferenced, ...}>}
   */
  async upload(file) {
    return api.upload('/images/upload', file)
  },

  /**
   * GET /imagery/search
   * Search satellite imagery catalogs (Copernicus/Sentinel).
   * @param {object} params
   * @param {number} [params.latitude]
   * @param {number} [params.longitude]
   * @param {string} [params.bbox] - 'minx,miny,maxx,maxy'
   * @param {string} [params.dateFrom] - YYYY-MM-DD
   * @param {string} [params.dateTo] - YYYY-MM-DD
   * @param {number} [params.maxCloudCover] - 0-100
   * @param {string} [params.source] - 'copernicus', 'sentinel-2', 'sentinel-1', 'landsat'
   * @param {number} [params.limit] - 1-100
   * @returns {Promise<{source, configured, count, items[]}>}
   */
  async search({ latitude, longitude, bbox, dateFrom, dateTo, maxCloudCover, source, limit }) {
    const params = new URLSearchParams()
    if (latitude != null) params.set('latitude', latitude)
    if (longitude != null) params.set('longitude', longitude)
    if (bbox) params.set('bbox', bbox)
    if (dateFrom) params.set('date_from', dateFrom)
    if (dateTo) params.set('date_to', dateTo)
    if (maxCloudCover != null) params.set('max_cloud_cover', maxCloudCover)
    if (source) params.set('source', source)
    if (limit) params.set('limit', limit)

    return api.get(`/imagery/search?${params}`)
  },

  /**
   * GET /imagery/sources
   * Check which satellite data sources are configured.
   * @returns {Promise<{sources: Array<{source, description, configured}>}>}
   */
  async sources() {
    return api.get('/imagery/sources')
  },
}
