import { api } from './api'

/**
 * Projects API — matches the FastAPI backend endpoints:
 *   GET    /projects          → list projects
 *   POST   /projects          → create project
 *   GET    /projects/{id}     → get project
 *   PUT    /projects/{id}     → update project
 *   DELETE /projects/{id}     → delete project
 */

export const projectApi = {
  /**
   * GET /projects
   * @returns {Promise<{projects: Array, total: number}>}
   */
  async list() {
    const res = await api.get('/projects')
    return res
  },

  /**
   * POST /projects
   * @param {{ name: string, description?: string }} project
   */
  async create(project) {
    return await api.post('/projects', project)
  },

  /**
   * GET /projects/{id}
   * @param {string} id
   * @returns {Promise<object>} ProjectResponse
   */
  async get(id) {
    return await api.get(`/projects/${id}`)
  },

  /**
   * PUT /projects/{id}
   * @param {string} id
   * @param {{ name?: string, description?: string }} updates
   */
  async update(id, updates) {
    return await api.put(`/projects/${id}`, updates)
  },

  /**
   * DELETE /projects/{id}
   * @param {string} id
   */
  async remove(id) {
    return await api.delete(`/projects/${id}`)
  },
}
