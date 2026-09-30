/**
 * Base API client.
 *
 * In development, all requests are sent to the Vite dev-server proxy at
 * `/api/*` which rewrites to `http://localhost:8000/*` — this eliminates
 * all CORS pre-flight issues.  The raw VITE_API_BASE_URL is kept as a
 * production / override escape-hatch only.
 *
 * Proxy config lives in vite.config.js:
 *   server.proxy['/api'] → target: http://localhost:8000, rewrite: /api → ''
 */
const BASE_URL = import.meta.env.VITE_API_BASE_URL
  ? import.meta.env.VITE_API_BASE_URL  // explicit override (e.g. production)
  : '/api'                              // default: use Vite proxy (dev)

/**
 * Friendly error messages keyed by HTTP status code.
 */
const ERROR_MESSAGES = {
  400: 'Bad request. Please check your input.',
  401: 'Authentication required.',
  403: 'Access denied.',
  404: 'Resource not found.',
  409: 'Conflict. The resource already exists.',
  422: 'Invalid request data.',
  429: 'Too many requests. Please wait and try again.',
  500: 'Server error. Please try again later.',
  502: 'Backend service unavailable. Please try again.',
  503: 'Service temporarily unavailable.',
}

/**
 * Parse the error body from the backend into a user-friendly message.
 */
function parseErrorBody(status, text) {
  try {
    const json = JSON.parse(text)
    if (json.error?.message) return json.error.message
    if (json.detail) {
      if (typeof json.detail === 'string') return json.detail
      if (Array.isArray(json.detail)) {
        return json.detail.map(d => d.msg || d.message || String(d)).join('; ')
      }
    }
  } catch {
    // not JSON
  }
  return ERROR_MESSAGES[status] || `Request failed (HTTP ${status}).`
}

/**
 * Make an HTTP request to the FastAPI backend.
 * @param {'GET'|'POST'|'PUT'|'DELETE'} method
 * @param {string} path - API path, e.g. '/health'
 * @param {object|null} body - JSON body (for POST/PUT)
 * @param {object} opts - Extra fetch options
 * @returns {Promise<any>}
 */
async function request(method, path, body, opts = {}) {

  const fetchOpts = {
    method,
    headers: { 'Content-Type': 'application/json', ...opts.headers },
    signal: opts.signal,
  }
  if (body) fetchOpts.body = JSON.stringify(body)

  const res = await fetch(`${BASE_URL}${path}`, fetchOpts)
  if (!res.ok) {
    const text = await res.text()
    const message = parseErrorBody(res.status, text)
    const error = new Error(message)
    error.status = res.status
    error.body = text
    throw error
  }

  // 204 No Content (e.g. DELETE)
  if (res.status === 204) return null
  return res.json()
}

/**
 * Upload a file via multipart/form-data.
 * @param {string} path - API path, e.g. '/images/upload'
 * @param {File} file - The file to upload
 * @param {object} [extraFields] - Additional form fields
 * @returns {Promise<any>}
 */
async function uploadFile(path, file, extraFields = {}) {

  const formData = new FormData()
  formData.append('file', file)
  for (const [key, value] of Object.entries(extraFields)) {
    formData.append(key, value)
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    body: formData,
    // Do NOT set Content-Type header — browser sets it with boundary automatically
  })

  if (!res.ok) {
    const text = await res.text()
    const message = parseErrorBody(res.status, text)
    const error = new Error(message)
    error.status = res.status
    error.body = text
    throw error
  }

  return res.json()
}

/**
 * Check if the backend is reachable.
 * @returns {Promise<{ok: boolean, status?: string}>}
 */
async function checkHealth() {
  try {
    const res = await fetch(`${BASE_URL}/health`, { method: 'GET' })
    if (res.ok) {
      const data = await res.json()
      return { ok: true, status: data.status }
    }
    return { ok: false }
  } catch {
    return { ok: false }
  }
}

export const BACKEND_CONNECTED = true  // proxy is always configured

export const api = {
  get:    (path, opts)          => request('GET',    path, null, opts),
  post:   (path, body, opts)    => request('POST',   path, body, opts),
  put:    (path, body, opts)    => request('PUT',    path, body, opts),
  delete: (path, opts)          => request('DELETE', path, null, opts),
  upload: (path, file, extra)   => uploadFile(path, file, extra),
  health: ()                    => checkHealth(),
}
