import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { rupees } from '../lib/format'
import { ChangeDue, DiscountBlock, TenderBlock, useCheckout } from './checkout'
import { Modal, Pill, useToast } from './ui'
import './payment.css'

/** Close out a session, or settle one that was left unpaid. */
export default function PaymentModal({ booking, mode = 'complete', onDone, onClose }) {
  const station = Number(booking.amount_due || 0)
  const items = Number(booking.items_total || 0)
  // gross_due is served by the API; fall back for callers that build a booking
  // object by hand (the Sales page's outstanding list).
  const gross = Number(booking.gross_due ?? station + items)

  const [outcome, setOutcome] = useState('paid')
  const [membership, setMembership] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const checkout = useCheckout(gross)
  const toast = useToast()

  const canSubmit = outcome === 'paid' ? checkout.canTender : !checkout.needsReason

  // Who is in front of you: a live membership changes what you offer them, so
  // it is fetched for this one booking rather than carried on every booking row.
  useEffect(() => {
    if (!booking.phone) return undefined
    let cancelled = false
    api.get(`/admin/memberships/?state=active&customer_phone=${encodeURIComponent(booking.phone)}`)
      .then((res) => {
        const rows = Array.isArray(res) ? res : res?.results || []
        if (!cancelled) setMembership(rows[0] || null)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [booking.phone])

  const memberDiscount = Number(membership?.discount_percent || 0)

  /** One tap applies the rate the member already paid for. Staff still choose. */
  const applyMemberDiscount = () => {
    checkout.setShowDiscount(true)
    checkout.setDiscountMode('percent')
    checkout.setDiscountInput(String(memberDiscount))
    checkout.setDiscountReason(`Member — ${membership.plan_name}`)
  }

  const submit = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const body = { payment_status: outcome, ...checkout.body() }
      // Only a paid outcome tenders money; the rest just record the discount.
      if (outcome !== 'paid') {
        delete body.payments
        delete body.payment_method
      }

      const endpoint = mode === 'settle' ? 'record_payment' : 'complete'
      const res = await api.post(`/admin/bookings/${booking.id}/${endpoint}/`, body)
      const drawn = res?.membership_draw
      toast(
        `${booking.code} — ${outcome === 'paid' ? checkout.summary() : `marked ${outcome}`}`
        + (drawn
          ? ` · ${drawn.hours_drawn} hr off ${drawn.plan}, ${drawn.hours_remaining} left`
          : ''),
      )
      onDone()
    } catch (err) {
      setError(
        err.fields?.payments
        || err.fields?.discount_reason
        || err.fields?.payment_method
        || err.message,
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={mode === 'settle' ? `Settle ${booking.code}` : `Close out ${booking.code}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn--ghost" onClick={onClose}>Cancel</button>
          <button className="btn" onClick={submit} disabled={busy || !canSubmit}>
            {busy ? 'Saving…' : outcome === 'paid' ? `Take ${rupees(checkout.net)}` : 'Save'}
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
            <span className="small muted">
              {checkout.discount > 0 ? 'After discount' : 'Amount due'}
            </span>
            <strong className="pay-summary__due">{rupees(checkout.net)}</strong>
            {items > 0 && (
              <span className="small muted">
                {rupees(station)} station + {rupees(items)} items
              </span>
            )}
            {checkout.discount > 0 && (
              <span className="small" style={{ color: 'var(--warn)' }}>
                was {rupees(gross)}, less {rupees(checkout.discount)}
              </span>
            )}
          </div>
        </div>

        {membership && (
          <div className="member-flag">
            <div>
              <Pill tone="flame">Member</Pill>
              <strong>{membership.plan_name}</strong>
              <span className="small muted">
                {membership.has_hour_allowance
                  ? `${Number(membership.hours_remaining)} of ${Number(membership.included_hours)} hrs left`
                  : 'Discount-only scheme'}
                {' · '}{membership.days_remaining} days left
              </span>
            </div>
            {memberDiscount > 0 && checkout.discount === 0 && (
              <button type="button" className="btn btn--ghost btn--sm"
                onClick={applyMemberDiscount}>
                Apply {memberDiscount}% member rate
              </button>
            )}
          </div>
        )}

        <div className="seg pay-outcome">
          {[['paid', 'Paid'], ['unpaid', 'Leave unpaid'], ['waived', 'Waive']].map(([v, l]) => (
            <button key={v} type="button" className={outcome === v ? 'is-active' : ''}
              onClick={() => setOutcome(v)}>{l}</button>
          ))}
        </div>

        {outcome === 'paid' && (
          <>
            <DiscountBlock checkout={checkout} />
            <TenderBlock checkout={checkout} />
            {checkout.tender === 'cash' && checkout.net > 0 && (
              <ChangeDue net={checkout.net} />
            )}
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
