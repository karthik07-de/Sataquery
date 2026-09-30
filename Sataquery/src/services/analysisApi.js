import { api } from './api'

/**
 * Analysis API — matches the FastAPI backend endpoints:
 *   POST /analysis/run   → queue an analysis
 *   GET  /analysis/{id}  → poll status / get result
 *
 * Analysis types supported by the backend:
 *   water_detection, vegetation_analysis, built_up_detection,
 *   building_detection, change_detection, landcover, feature_highlighting
 */
export const analysisApi = {
  /**
   * POST /analysis/run
   * @param {object} params
   * @param {string} params.imageId - Required uploaded image ID
   * @param {string} params.analysisType - One of the supported types
   * @param {string} [params.referenceImageId] - For change_detection
   * @param {string} [params.projectId] - Optional project
   * @param {object} [params.extraParams] - Optional algorithm params
   * @returns {Promise<{analysis_id: string, task: string, status: string}>}
   */
  async runAnalysis({ imageId, analysisType, referenceImageId, projectId, extraParams }) {
    const payload = {
      image_id: imageId,
      analysis_type: analysisType,
    }
    if (referenceImageId) payload.reference_image_id = referenceImageId
    if (projectId) payload.project_id = projectId
    if (extraParams) payload.params = extraParams
    return api.post('/analysis/run', payload)
  },

  /**
   * GET /analysis/{analysis_id}
   * Returns full status including result when completed.
   * @param {string} analysisId
   * @returns {Promise<{analysis_id, task, status, progress, result?}>}
   */
  async getStatus(analysisId) {
    return api.get(`/analysis/${analysisId}`)
  },

  /**
   * Poll analysis status until completed or failed.
   * @param {string} analysisId
   * @param {function} onProgress - Called with {status, progress} on each poll
   * @param {number} maxAttempts - Max poll attempts before giving up
   * @param {number} intervalMs - Poll interval in milliseconds
   * @returns {Promise<object>} The final result
   */
  async pollUntilComplete(analysisId, onProgress, maxAttempts = 120, intervalMs = 1500) {
    for (let i = 0; i < maxAttempts; i++) {
      const status = await this.getStatus(analysisId)
      onProgress?.({ status: status.status, progress: status.progress })

      if (status.status === 'completed') {
        return status.result || status
      }
      if (status.status === 'failed') {
        const err = new Error(status.error_message || 'Analysis failed')
        err.code = status.error_code
        throw err
      }

      await new Promise(resolve => setTimeout(resolve, intervalMs))
    }

    throw new Error('Analysis timed out — exceeded maximum polling attempts')
  },

  /**
   * Supported analysis types from the backend.
   */
  ANALYSIS_TYPES: {
    water_detection: 'Water Detection',
    vegetation_analysis: 'Vegetation Analysis',
    built_up_detection: 'Built-up Detection',
    building_detection: 'Building Detection',
    change_detection: 'Change Detection',
    landcover: 'Land Cover Classification',
    feature_highlighting: 'Feature Highlighting',
  },
}
