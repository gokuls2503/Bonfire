const BASE = import.meta.env.VITE_API_BASE || '/api'

export class ApiError extends Error {
  constructor(message, { status, fields } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.fields = fields || {}
  }
}

function flattenErrors(payload) {
  if (!payload || typeof payload !== 'object') return { message: 'Something went wrong.', fields: {} }
  if (payload.detail) return { message: payload.detail, fields: {} }
  const fields = {}
  let first = null
  for (const [key, value] of Object.entries(payload)) {
    const text = Array.isArray(value) ? value.join(' ') : String(value)
    fields[key] = text
    if (!first) first = text
  }
  return { message: first || 'Please check the form and try again.', fields }
}

async function request(path, { method = 'GET', body, signal } = {}) {
  let response
  try {
    response = await fetch(`${BASE}${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal,
    })
  } catch (err) {
    if (err.name === 'AbortError') throw err
    throw new ApiError('Could not reach the server. Check your connection.', { status: 0 })
  }

  if (response.status === 204) return null

  let payload = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    const { message, fields } = flattenErrors(payload)
    throw new ApiError(message, { status: response.status, fields })
  }
  return payload
}

export const api = {
  bootstrap: () => request('/public/bootstrap/'),
  availability: ({ date, duration, stationType }) => {
    const params = new URLSearchParams()
    if (date) params.set('date', date)
    if (duration) params.set('duration', duration)
    if (stationType) params.set('station_type', stationType)
    return request(`/public/availability/?${params}`)
  },
  createBooking: (data) => request('/public/bookings/', { method: 'POST', body: data }),
  lookupBooking: (code) => request(`/public/bookings/${encodeURIComponent(code)}/`),
  cancelBooking: (code, phone) =>
    request(`/public/bookings/${encodeURIComponent(code)}/cancel/`, {
      method: 'POST',
      body: { phone },
    }),
  tournaments: (scope = 'upcoming') => request(`/public/tournaments/?scope=${scope}`),
  tournament: (slug) => request(`/public/tournaments/${slug}/`),
  register: (data) => request('/public/registrations/', { method: 'POST', body: data }),
  contact: (data) => request('/public/contact/', { method: 'POST', body: data }),
}
