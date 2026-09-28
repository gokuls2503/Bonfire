export const rupees = (value) => {
  const n = Number(value || 0)
  return `₹${n % 1 === 0 ? n.toFixed(0) : n.toFixed(2)}`
}

export const duration = (minutes) => {
  const m = Number(minutes || 0)
  if (m < 60) return `${m} min`
  const h = m / 60
  return h % 1 === 0 ? `${h} hr${h > 1 ? 's' : ''}` : `${Math.floor(h)}h ${m % 60}m`
}

const dtf = (opts) => new Intl.DateTimeFormat('en-IN', opts)

export const formatDate = (value) =>
  dtf({ day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value))

export const formatDay = (value) =>
  dtf({ weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(value))

export const formatTime = (value) =>
  dtf({ hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(value))

export const formatDateTime = (value) =>
  `${formatDay(value)}, ${formatTime(value)}`

export const timeUntil = (value) => {
  const diff = new Date(value) - Date.now()
  if (diff < 0) return 'started'
  const days = Math.floor(diff / 86400000)
  const hours = Math.floor((diff % 86400000) / 3600000)
  if (days > 0) return `in ${days}d ${hours}h`
  const mins = Math.floor((diff % 3600000) / 60000)
  if (hours > 0) return `in ${hours}h ${mins}m`
  return `in ${mins}m`
}

/** Local YYYY-MM-DD — never use toISOString here, it shifts the day across timezones. */
export const toDateKey = (date) => {
  const d = new Date(date)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`
}

export const timeLabel = (value) => {
  if (!value) return ''
  const [h, m] = value.split(':')
  const hour = Number(h)
  const suffix = hour >= 12 ? 'pm' : 'am'
  const display = hour % 12 === 0 ? 12 : hour % 12
  return m === '00' ? `${display}${suffix}` : `${display}:${m}${suffix}`
}

/** A tel: URI must not contain spaces — keep the pretty display, strip the href. */
export const telHref = (phone) => `tel:${String(phone || '').replace(/[^\d+]/g, '')}`

/** wa.me wants digits only, no plus. */
export const whatsappHref = (number) =>
  `https://wa.me/${String(number || '').replace(/\D/g, '')}`

/** A Google Maps URL an iframe will actually render.

    The owner pastes whatever the Maps share sheet gives them, which is usually
    a `maps.app.goo.gl` short link. Google serves those with
    `X-Frame-Options: sameorigin`, so they load as a blank box rather than a map.
    An embeddable URL says so in the query, and anything else falls back to a
    search on the address — which always renders and is never blank. */
export const mapEmbedSrc = (settings) => {
  const url = settings?.map_embed_url || ''
  if (url.includes('/maps/embed') || url.includes('output=embed')) return url
  const place = settings?.full_address || settings?.brand_name || ''
  if (!place) return ''
  return `https://www.google.com/maps?q=${encodeURIComponent(place)}&output=embed`
}

/** Where "open in Google Maps" should send someone.

    `directions_url` is the field that exists for this — a share link resolves
    to the exact pin the owner dropped. The embed URL is only a fallback for
    the case where it was pasted into the wrong box, and a search on the
    address is the last resort so the link is never dead. */
export const mapLink = (settings) => {
  if (settings?.directions_url) return settings.directions_url
  const embed = settings?.map_embed_url || ''
  if (embed && !embed.includes('output=embed')) return embed
  const place = settings?.full_address || ''
  return place
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}`
    : ''
}
