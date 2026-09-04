import { useState } from 'react'
import { api } from '../lib/api'
import { rupees } from '../lib/format'
import Icon from './Icon'
import { Modal, useToast } from './ui'
import './payment.css'

/**
 * The till only takes cash and UPI, so the counter gets two big buttons.
 *
 * "card" and "other" remain valid everywhere else — the model, the API and the
 * sales report all still handle them — so adding a card machine later is one
 * line here, with no migration and no change to existing data.
 */
const METHODS = [
  { value: 'cash', label: 'Cash', icon: 'flame', hint: 'Notes and coins' },
  { value: 'upi', label: 'UPI', icon: 'bolt', hint: 'GPay, PhonePe, Paytm' },
]

/**
 * Captures how the money was taken when a session ends.
 *
 * `mode` is "complete" (ends the session) or "settle" (pays off an existing
 * balance without touching the booking's status).
 */
export default function PaymentModal({ booking, mode = 'complete', onDone, onClose }) {
  const due = Number(booking.amount_due || 0)
  const [method, setMethod] = useState('cash')
  const [amount, setAmount] = useState(due.toFixed(2))
  const [outcome, setOutcome] = useState('paid')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const toast = useToast()

  const submit = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const endpoint = mode === 'settle' ? 'record_payment' : 'complete'
      const body =
        outcome === 'paid'
          ? { payment_status: 'paid', payment_method: method, amount_collected: amount }
          : { payment_status: outcome }
      await api.post(`/admin/bookings/${booking.id}/${endpoint}/`, body)
      toast(
        outcome === 'paid'
          ? `${booking.code} — ${rupees(amount)} ${method === 'cash' ? 'cash' : method.toUpperCase()}`
          : `${booking.code} marked ${outcome}`,
      )
      onDone()
    } catch (err) {
      setError(err.fields?.payment_method || err.message)
    } finally {
      setBusy(false)
    }
  }

  const short = outcome === 'paid' && Number(amount) < due
  const over = outcome === 'paid' && Number(amount) > due

  return (
    <Modal
      title={mode === 'settle' ? `Settle ${booking.code}` : `Close out ${booking.code}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn--ghost" onClick={onClose}>Cancel</button>
          <button className="btn" onClick={submit} disabled={busy}>
            {busy ? 'Saving…' : outcome === 'paid' ? `Take ${rupees(amount)}` : 'Save'}
          </button>
        </>
      }
    >
      <form onSubmit={submit}>
        {error && <div className="notice notice--error">{error}</div>}

        <div className="pay-summary">
          <div>
            <span className="small muted">Customer</span>
            <strong>{booking.full_name}</strong>
          </div>
          <div>
            <span className="small muted">Station</span>
            <strong>
              {booking.station_name || booking.station_type_name}
              {booking.seats > 1 ? ` × ${booking.seats}` : ''}
            </strong>
          </div>
          <div>
            <span className="small muted">Amount due</span>
            <strong className="pay-summary__due">{rupees(due)}</strong>
          </div>
        </div>

        <div className="seg pay-outcome">
          {[['paid', 'Paid'], ['unpaid', 'Leave unpaid'], ['waived', 'Waive']].map(([v, l]) => (
            <button key={v} type="button" className={outcome === v ? 'is-active' : ''}
              onClick={() => setOutcome(v)}>{l}</button>
          ))}
        </div>

        {outcome === 'paid' && (
          <>
            <span className="pay-label">How was it paid?</span>
            <div className="pay-methods">
              {METHODS.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  className={`pay-method ${method === m.value ? 'is-active' : ''}`}
                  onClick={() => setMethod(m.value)}
                >
                  <Icon name={m.icon} size={20} />
                  <strong>{m.label}</strong>
                  <span className="small muted">{m.hint}</span>
                </button>
              ))}
            </div>

            <div className="field" style={{ marginTop: '1rem' }}>
              <label htmlFor="amount_collected">Amount collected</label>
              <input
                id="amount_collected"
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              {short && (
                <span className="hint" style={{ color: 'var(--warn)' }}>
                  {rupees(due - Number(amount))} less than the amount due.
                </span>
              )}
              {over && (
                <span className="hint" style={{ color: 'var(--info)' }}>
                  {rupees(Number(amount) - due)} more than the amount due.
                </span>
              )}
            </div>
          </>
        )}

        {outcome === 'unpaid' && (
          <p className="small muted">
            The session closes and the balance stays on the books. It will show under
            <strong> money owed</strong> in the sales report until someone settles it.
          </p>
        )}
        {outcome === 'waived' && (
          <p className="small muted">
            Nothing is collected and nothing is owed. Waived sessions do not count
            toward revenue.
          </p>
        )}
      </form>
    </Modal>
  )
}
