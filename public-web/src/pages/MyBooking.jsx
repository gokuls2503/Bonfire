import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api, ApiError } from '../lib/api'
import { rupees, formatDay, formatTime } from '../lib/format'
import Icon from '../components/Icon'
import './mybooking.css'

const STATUS_TONE = {
  pending: 'tag',
  confirmed: 'tag tag--ok',
  checked_in: 'tag tag--ok',
  completed: 'tag',
  cancelled: 'tag tag--bad',
  no_show: 'tag tag--bad',
}

function BookingCard({ booking, onCancelled }) {
  const [confirming, setConfirming] = useState(false)
  const [phone, setPhone] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const cancel = async (event) => {
    event.preventDefault()
    if (!phone.trim()) {
      setError('Enter the phone number on the booking.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await api.cancelBooking(booking.code, phone.trim())
      onCancelled(booking.code)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not cancel that booking.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <article className={`booking-card ${booking.status === 'cancelled' ? 'is-cancelled' : ''}`}>
      <header className="booking-card__head">
        <div>
          <span className="booking-card__seq">#{booking.sequence || '—'}</span>
          <strong className="mono">{booking.code}</strong>
        </div>
        <span className={STATUS_TONE[booking.status] || 'tag'}>{booking.status_display}</span>
      </header>

      <dl className="booking-card__meta">
        <div>
          <dt>Station</dt>
          <dd>
            {booking.station_type}{booking.seats > 1 ? ` × ${booking.seats}` : ''}
            {booking.station && <span className="flame-text"> · {booking.station}</span>}
          </dd>
        </div>
        <div>
          <dt>When</dt>
          <dd>
            {formatDay(booking.start_at)}
            <br />
            {formatTime(booking.start_at)} – {formatTime(booking.end_at)}
          </dd>
        </div>
        <div>
          <dt>{booking.payment_status === 'paid' ? 'Paid' : 'Due at counter'}</dt>
          <dd className="flame-text">{rupees(booking.amount_due)}</dd>
        </div>
      </dl>

      {booking.can_cancel && (
        confirming ? (
          <form className="booking-card__cancel" onSubmit={cancel}>
            <label htmlFor={`phone-${booking.code}`}>
              Confirm the phone number on this booking
            </label>
            <div className="row">
              <input
                id={`phone-${booking.code}`}
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
              <button className="btn btn--sm" disabled={busy}>
                {busy ? 'Cancelling…' : 'Cancel it'}
              </button>
              <button type="button" className="btn btn--ghost btn--sm"
                onClick={() => { setConfirming(false); setError(null) }}>
                Keep it
              </button>
            </div>
            {error && <span className="error small">{error}</span>}
          </form>
        ) : (
          <button className="btn btn--ghost btn--sm" onClick={() => setConfirming(true)}>
            Cancel this booking
          </button>
        )
      )}
    </article>
  )
}

export default function MyBooking() {
  const [code, setCode] = useState('')
  const [result, setResult] = useState(null)
  const [banner, setBanner] = useState(null)
  const [busy, setBusy] = useState(false)
  const [cancelled, setCancelled] = useState([])

  const lookup = async (event) => {
    event.preventDefault()
    setBanner(null)
    setCancelled([])
    setBusy(true)
    try {
      setResult(await api.lookupBooking(code.trim()))
    } catch (err) {
      setResult(null)
      setBanner(err instanceof ApiError ? err.message : 'Could not find that code.')
    } finally {
      setBusy(false)
    }
  }

  const onCancelled = (cancelledCode) => {
    setCancelled((v) => [...v, cancelledCode])
    setResult((r) => ({
      ...r,
      bookings: r.bookings.map((b) =>
        b.code === cancelledCode
          ? { ...b, status: 'cancelled', status_display: 'Cancelled', can_cancel: false }
          : b,
      ),
    }))
  }

  return (
    <>
      <header className="page-head">
        <div className="glow page-head__glow" />
        <div className="shell">
          <span className="eyebrow">Already booked?</span>
          <h1>Find my booking</h1>
          <p className="lead">
            Enter your code to check or cancel a slot. Your customer code shows
            everything you have booked; a full code shows just that one visit.
          </p>
        </div>
      </header>

      <div className="shell section section--tight" style={{ maxWidth: 720 }}>
        <form className="card" onSubmit={lookup}>
          <div className="field">
            <label htmlFor="code">Booking or customer code</label>
            <input
              id="code"
              required
              placeholder="A3F92C or A3F92C-001"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              className="mono-input"
            />
            <span className="small muted">
              Capitals, dashes and spaces don't matter — type it however you have it.
            </span>
          </div>
          <button className="btn btn--block" disabled={busy}>
            {busy ? 'Looking…' : 'Find booking'}
          </button>
        </form>

        {banner && <div className="notice notice--error" style={{ marginTop: '1.5rem' }}>{banner}</div>}
        {cancelled.length > 0 && (
          <div className="notice notice--ok" style={{ marginTop: '1.5rem' }}>
            {cancelled.length === 1
              ? 'Booking cancelled. The slot is back in the pool.'
              : `${cancelled.length} bookings cancelled.`}
          </div>
        )}

        {result && (
          <section className="lookup-result">
            <div className="lookup-result__head">
              <div>
                <span className="small muted">Customer code</span>
                <strong className="mono flame-text">{result.customer_code}</strong>
              </div>
              <div>
                <span className="small muted">Name</span>
                <strong>{result.full_name}</strong>
              </div>
            </div>

            {result.bookings.length === 0 ? (
              <div className="empty">
                <p>Nothing booked at the moment.</p>
                <Link to="/book" className="btn btn--sm" style={{ marginTop: '1rem' }}>
                  Book a station
                </Link>
              </div>
            ) : (
              <>
                <p className="small muted" style={{ margin: '0 0 1rem' }}>
                  {result.bookings.length} booking{result.bookings.length > 1 ? 's' : ''}
                </p>
                <div className="booking-list">
                  {result.bookings.map((b) => (
                    <BookingCard key={b.code} booking={b} onCancelled={onCancelled} />
                  ))}
                </div>
              </>
            )}

            <p className="small muted lookup-result__tip">
              <Icon name="flame" size={14} /> Quote <strong>{result.customer_code}</strong> at
              the counter next time and we'll pull up your account.
            </p>
          </section>
        )}
      </div>
    </>
  )
}
