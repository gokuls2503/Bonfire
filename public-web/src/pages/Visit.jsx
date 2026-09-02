import { useState } from 'react'
import { useSite } from '../lib/SiteContext'
import { api, ApiError } from '../lib/api'
import { timeLabel } from '../lib/format'
import Icon from '../components/Icon'
import './visit.css'

const TOPICS = [
  ['general', 'General enquiry'],
  ['booking', 'Booking help'],
  ['tournament', 'Tournaments'],
  ['party', 'Private / party booking'],
  ['feedback', 'Feedback'],
]

function ContactForm() {
  const [form, setForm] = useState({ name: '', phone: '', email: '', topic: 'general', message: '' })
  const [errors, setErrors] = useState({})
  const [banner, setBanner] = useState(null)
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    setErrors({})
    setBanner(null)
    setBusy(true)
    try {
      await api.contact({
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        topic: form.topic,
        message: form.message.trim(),
      })
      setSent(true)
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fields)
        setBanner(err.message)
      } else setBanner('Could not send that. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  if (sent) {
    return (
      <div className="card center done">
        <div className="done__mark"><Icon name="check" size={32} /></div>
        <h3>Message sent</h3>
        <p className="muted">We'll get back to you within a day. Usually much sooner.</p>
      </div>
    )
  }

  return (
    <form className="card" onSubmit={submit} id="contact">
      <h3 style={{ marginBottom: '1.25rem' }}>Send us a message</h3>
      {banner && <div className="notice notice--error">{banner}</div>}

      <div className="field">
        <label htmlFor="c-name">Name</label>
        <input id="c-name" required value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })} />
        {errors.name && <span className="error">{errors.name}</span>}
      </div>

      <div className="field-row">
        <div className="field">
          <label htmlFor="c-phone">Phone</label>
          <input id="c-phone" type="tel" inputMode="tel" value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="c-email">Email</label>
          <input id="c-email" type="email" value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
      </div>
      {errors.non_field_errors && <span className="error small">{errors.non_field_errors}</span>}

      <div className="field">
        <label htmlFor="c-topic">What's it about?</label>
        <select id="c-topic" value={form.topic}
          onChange={(e) => setForm({ ...form, topic: e.target.value })}>
          {TOPICS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>

      <div className="field">
        <label htmlFor="c-message">Message</label>
        <textarea id="c-message" required value={form.message}
          onChange={(e) => setForm({ ...form, message: e.target.value })} />
        {errors.message && <span className="error">{errors.message}</span>}
      </div>

      <button className="btn btn--block" disabled={busy}>
        {busy ? 'Sending…' : 'Send message'}
      </button>
    </form>
  )
}

export default function Visit() {
  const { data } = useSite()
  const s = data.settings
  const hours = data.business_hours

  return (
    <>
      <header className="page-head">
        <div className="glow page-head__glow" />
        <div className="shell">
          <span className="eyebrow">Come through</span>
          <h1>Visit the hub</h1>
          <p className="lead">
            Walk in any time we're open, or book ahead so a seat has your name on it.
          </p>
        </div>
      </header>

      <div className="shell section section--tight visit-grid">
        <div className="visit-info">
          <div className="card">
            <span className="eyebrow">Where</span>
            <p className="lead">{s.full_address || 'Address coming soon.'}</p>
            <div className="row row--wrap" style={{ marginTop: '1.25rem' }}>
              {s.directions_url && (
                <a className="btn btn--sm" href={s.directions_url} target="_blank" rel="noreferrer noopener">
                  <Icon name="pin" size={16} /> Directions
                </a>
              )}
              {s.phone && (
                <a className="btn btn--ghost btn--sm" href={`tel:${s.phone}`}>
                  <Icon name="phone" size={16} /> {s.phone}
                </a>
              )}
              {s.whatsapp && (
                <a
                  className="btn btn--ghost btn--sm"
                  href={`https://wa.me/${s.whatsapp.replace(/\D/g, '')}`}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  WhatsApp
                </a>
              )}
            </div>
          </div>

          <div className="card">
            <span className="eyebrow">Opening hours</span>
            <ul className="hours-list">
              {hours.map((h) => {
                const today = new Date().getDay()
                const isToday = h.weekday === (today === 0 ? 6 : today - 1)
                return (
                  <li key={h.weekday} className={isToday ? 'is-today' : ''}>
                    <span>{h.weekday_display}</span>
                    <span className={h.is_closed ? 'muted' : ''}>
                      {h.is_closed ? 'Closed' : `${timeLabel(h.opens_at)} – ${timeLabel(h.closes_at)}`}
                    </span>
                  </li>
                )
              })}
            </ul>
            <p className={`status-dot ${data.is_open_now ? 'is-open' : ''}`} style={{ marginTop: '1rem' }}>
              <i />{data.is_open_now ? 'Open right now' : 'Closed right now'}
            </p>
          </div>

          {s.map_embed_url && (
            <div className="map-frame">
              <iframe
                src={s.map_embed_url}
                title="Map to Bonfire Gaming Hub"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                allowFullScreen
              />
            </div>
          )}
        </div>

        <ContactForm />
      </div>
    </>
  )
}
