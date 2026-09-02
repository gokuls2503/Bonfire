const BASE = import.meta.env.VITE_API_BASE || '/api'
const ACCESS_KEY = 'bonfire.access'
const REFRESH_KEY = 'bonfire.refresh'

export class ApiError extends Error {
  constructor(message, { status, fields } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.fields = fields || {}
  }
}

export const tokens = {
  get access() { return localStorage.getItem(ACCESS_KEY) },
  get refresh() { return localStorage.getItem(REFRESH_KEY) },
  set({ access, refresh }) {
    if (access) localStorage.setItem(ACCESS_KEY, access)
    if (refresh) localStorage.setItem(REFRESH_KEY, refresh)
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY)
    localStorage.removeItem(REFRESH_KEY)
  },
}

function flatten(payload) {
  if (!payload || typeof payload !== 'object') return { message: 'Request failed.', fields: {} }
  if (payload.detail) return { message: payload.detail, fields: {} }
  const fields = {}
  let first = null
  for (const [key, value] of Object.entries(payload)) {
    const text = Array.isArray(value) ? value.join(' ') : String(value)
    fields[key] = text
    if (!first) first = `${key === 'non_field_errors' ? '' : key + ': '}${text}`
  }
  return { message: first || 'Request failed.', fields }
}

let refreshing = null

async function refreshAccess() {
  // One in-flight refresh at a time — a burst of 401s must not fan out
  // into a burst of refresh calls that rotate each other's tokens away.
  if (!refreshing) {
    const token = tokens.refresh
    refreshing = (async () => {
      if (!token) throw new ApiError('Session expired.', { status: 401 })
      const res = await fetch(`${BASE}/auth/token/refresh/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh: token }),
      })
      if (!res.ok) {
        tokens.clear()
        throw new ApiError('Session expired. Please sign in again.', { status: 401 })
      }
      const data = await res.json()
      tokens.set({ access: data.access, refresh: data.refresh })
      return data.access
    })().finally(() => { refreshing = null })
  }
  return refreshing
}

async function raw(path, { method = 'GET', body, isForm = false, retry = true } = {}) {
  const headers = {}
  const access = tokens.access
  if (access) headers.Authorization = `Bearer ${access}`
  if (body && !isForm) headers['Content-Type'] = 'application/json'

  let res
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
    })
  } catch {
    throw new ApiError('Cannot reach the server.', { status: 0 })
  }

  if (res.status === 401 && retry && tokens.refresh) {
    await refreshAccess()
    return raw(path, { method, body, isForm, retry: false })
  }

  if (res.status === 204) return null

  let payload = null
  try { payload = await res.json() } catch { payload = null }

  if (!res.ok) {
    const { message, fields } = flatten(payload)
    throw new ApiError(message, { status: res.status, fields })
  }
  return payload
}

export const api = {
  login: async (username, password) => {
    const res = await fetch(`${BASE}/auth/token/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    if (!res.ok) throw new ApiError('Wrong username or password.', { status: res.status })
    const data = await res.json()
    tokens.set(data)
    return data
  },
  logout: () => tokens.clear(),

  get: (path) => raw(path),
  post: (path, body) => raw(path, { method: 'POST', body }),
  patch: (path, body) => raw(path, { method: 'PATCH', body }),
  put: (path, body) => raw(path, { method: 'PUT', body }),
  del: (path) => raw(path, { method: 'DELETE' }),
  upload: (path, formData, method = 'PATCH') =>
    raw(path, { method, body: formData, isForm: true }),
}

/** Collection helper — every admin list endpoint is either paginated or plain. */
export const rows = (payload) => (Array.isArray(payload) ? payload : payload?.results || [])
export const count = (payload) => (Array.isArray(payload) ? payload.length : payload?.count || 0)
