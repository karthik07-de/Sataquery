import { api } from './api'

/**
 * Query API — submits natural-language analysis requests.
 *
 * Endpoint: POST /query
 *
 * Request schema:
 *   query            - natural language query (min 3 chars)
 *   image_id         - optional uploaded image ID to analyse
 *   reference_image_id - optional second image (for change detection)
 *   location         - optional explicit location name/coordinate
 *   date             - optional acquisition date (YYYY-MM or YYYY-MM-DD)
 *   project_id       - optional project to attach analysis to
 *
 * Response: { query_id, analysis_id, task, operation, status, plan }
 */
export const queryApi = {
  /**
   * Submit a natural-language query.
   * @param {object} params
   * @param {string} params.query - The natural language query
   * @param {string} [params.imageId] - Uploaded image ID to analyse
   * @param {string} [params.referenceImageId] - Second image for change detection
   * @param {string} [params.location] - Location name or coordinate
   * @param {string} [params.date] - Acquisition date
   * @param {string} [params.projectId] - Project ID
   * @returns {Promise<{query_id, analysis_id, task, operation, status, plan}>}
   */
  async submit({ query, imageId, referenceImageId, location, date, projectId }) {
    const payload = { query }
    if (imageId) payload.image_id = imageId
    if (referenceImageId) payload.reference_image_id = referenceImageId
    if (location != null) payload.location = location
    if (date) payload.date = date
    if (projectId) payload.project_id = projectId
    return api.post('/query', payload)
  },
}
