import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api, ApiError } from '../lib/api'
import { rupees, formatDay, formatTime, duration } from '../lib/format'
import Icon from '../components/Icon'

const STATUS_TONE = {
  pending: 'tag',
  confirmed: 'tag tag--ok',
  checked_in: 'tag tag--ok',
  completed: 'tag',
  cancelled: 'tag tag--bad',
  no_show: 'tag tag--bad',
}

export default function MyBooking() {
  const [code, setCode] = useState('')
  const [phone, setPhone] = useState('')
  const [booking, setBooking] = useState(null)
  const [banner, setBanner] = useState(null)
  const [busy, setBusy] = useState(false)
  const [cancelled, setCancelled] = useState(false)

  const lookup = async (event) => {
    event.preventDefault()
    setBanner(null)
    setBusy(true)
    setCancelled(false)
    try {
      setBooking(await api.lookupBooking(code.trim()))
    } catch (err) {
      setBooking(null)
      setBanner(err instanceof ApiError ? err.message : 'Could not find that booking.')
    } finally {
      setBusy(false)
    }
  }

  const cancel = async () => {
    if (!phone.trim()) {
      setBanner('Enter the phone number on the booking to cancel it.')
      return
    }
    setBanner(null)
    setBusy(true)
    try {
      await api.cancelBooking(booking.code, phone.trim())
      setBooking({ ...booking, status: 'cancelled', status_display: 'Cancelled' })
      setCancelled(true)
    } catch (err) {
      setBanner(err instanceof ApiError ? err.message : 'Could not cancel that booking.')
    } finally {
      setBusy(false)
    }
  }

  const canCancel = booking && !['completed', 'cancelled', 'no_show'].includes(booking.status)

  return (
    <>
      <header className="page-head">
        <div className="glow page-head__glow" />
        <div className="shell">
          <span className="eyebrow">Already booked?</span>
          <h1>Find my booking</h1>
          <p className="lead">Enter the code we gave you to check or cancel your slot.</p>
        </div>
      </header>

      <div className="shell section section--tight" style={{ maxWidth: 620 }}>
        <form className="card" onSubmit={lookup}>
          <div className="field">
            <label htmlFor="code">Booking code</label>
            <input
              id="code"
              required
              placeholder="BF1A2B3C"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              style={{ fontFamily: 'ui-monospace, Menlo, monospace', letterSpacing: '0.12em' }}
            />
          </div>
          <button className="btn btn--block" disabled={busy}>
            {busy ? 'Looking…' : 'Find booking'}
          </button>
        </form>

        {banner && <div className="notice notice--error" style={{ marginTop: '1.5rem' }}>{banner}</div>}
        {cancelled && (
          <div className="notice notice--ok" style={{ marginTop: '1.5rem' }}>
            Booking cancelled. The slot is back in the pool.
          </div>
        )}

        {booking && (
          <div className="card" style={{ marginTop: '1.5rem' }}>
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: '1.25rem' }}>
              <strong style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: '1.3rem', letterSpacing: '0.1em' }}>
                {booking.code}
              </strong>
              <span className={STATUS_TONE[booking.status] || 'tag'}>{booking.status_display}</span>
            </div>

            <div className="summary-card" style={{ marginBottom: '1.5rem' }}>
              <div><span className="small muted">Name</span><strong>{booking.full_name}</strong></div>
              <div><span className="small muted">Station</span>
                <strong>{booking.station_type}{booking.seats > 1 ? ` × ${booking.seats}` : ''}</strong>
                {booking.station && <span className="small flame-text">{booking.station}</span>}
              </div>
              <div><span className="small muted">When</span>
                <strong>{formatDay(booking.start_at)}</strong>
                <span className="small">{formatTime(booking.start_at)} – {formatTime(booking.end_at)}</span>
              </div>
              <div><span className="small muted">
                {booking.payment_status === 'paid' ? 'Paid' : 'Due at counter'}</span>
                <strong className="flame-text">{rupees(booking.amount_due)}</strong>
              </div>
            </div>

            {canCancel ? (
              <>
                <div className="field">
                  <label htmlFor="cancel-phone">Confirm your phone number to cancel</label>
                  <input
                    id="cancel-phone"
                    type="tel"
                    inputMode="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
                <button className="btn btn--ghost btn--block" onClick={cancel} disabled={busy}>
                  Cancel this booking
                </button>
              </>
            ) : (
              <Link to="/book" className="btn btn--block">Book another session</Link>
            )}
          </div>
        )}
      </div>
    </>
  )
}
