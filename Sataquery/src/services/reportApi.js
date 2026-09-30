import { api } from './api'

/**
 * Reports API — matches the FastAPI backend endpoints:
 *   POST /reports                        → generate a report from a completed analysis
 *   GET  /reports/{report_id}            → get report metadata
 *   GET  /reports/{report_id}/download   → download the report file
 *
 * Supported formats: "markdown" (default) | "pdf"
 */
export const reportApi = {
  /**
   * POST /reports
   * Generates a report for the given analysis.
   * @param {string} analysisId
   * @param {'markdown'|'pdf'} [format='markdown']
   * @returns {Promise<{ id, analysis_id, format, url, path, created_at }>}
   */
  async generate(analysisId, format = 'markdown') {
    return api.post('/reports', { analysis_id: analysisId, format })
  },

  /**
   * GET /reports/{report_id}
   * @param {string} reportId
   * @returns {Promise<{ id, analysis_id, format, url, path, created_at }>}
   */
  async get(reportId) {
    return api.get(`/reports/${reportId}`)
  },

  /**
   * Download a report file by opening the backend download URL in a new tab.
   * The backend serves the file directly via GET /reports/{id}/download.
   * @param {string} reportId
   */
  download(reportId) {
    // Use the proxied /api path so the download goes through Vite's proxy in dev
    const BASE = import.meta.env.VITE_API_BASE_URL || '/api'
    window.open(`${BASE}/reports/${reportId}/download`, '_blank', 'noopener')
  },

  /**
   * Convenience: generate a report for the last active analysis and trigger download.
   * Returns the report metadata object, or throws if no analysis is stored.
   * @param {'markdown'|'pdf'} [format='markdown']
   * @returns {Promise<{ id, analysis_id, format, url, path, created_at }>}
   */
  async generateAndDownload(analysisId, format = 'markdown') {
    const report = await this.generate(analysisId, format)
    this.download(report.id)
    return report
  },
}
