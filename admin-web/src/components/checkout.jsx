import { useMemo, useState } from 'react'
import { rupees } from '../lib/format'
import Icon from './Icon'
import './payment.css'

/**
 * Shared checkout controls for both the session close-out and the counter sale.
 *
 * Both screens take money the same way, so the discount rules and the split
 * arithmetic live here once. Duplicating them is how the two screens would
 * quietly drift apart on something that has to stay exact.
 */

export const METHODS = [
  { value: 'cash', label: 'Cash', icon: 'flame', hint: 'Notes and coins' },
  { value: 'upi', label: 'UPI', icon: 'bolt', hint: 'GPay, PhonePe, Paytm' },
]

const DISCOUNT_REASONS = ['Regular', 'Happy hour', 'Tournament winner', 'Goodwill', 'Staff']

/** Work in whole paise so 0.1 + 0.2 never costs someone a rupee. */
export const paise = (value) => Math.round(Number(value || 0) * 100)
const fromPaise = (n) => (n / 100).toFixed(2)

export function useCheckout(gross) {
  const [tender, setTender] = useState('cash')      // cash | upi | split
  const [cashPart, setCashPart] = useState('')
  const [upiPart, setUpiPart] = useState('')
  const [discountMode, setDiscountMode] = useState('amount')
  const [discountInput, setDiscountInput] = useState('')
  const [discountReason, setDiscountReason] = useState('')
  const [showDiscount, setShowDiscount] = useState(false)

  const discount = useMemo(() => {
    const entered = Number(discountInput || 0)
    if (!entered || entered < 0) return 0
    const value = discountMode === 'percent' ? (gross * entered) / 100 : entered
    return Math.min(Math.round(value * 100) / 100, Math.max(gross, 0))
  }, [discountInput, discountMode, gross])

  const net = Math.max(Math.round((gross - discount) * 100) / 100, 0)
  const splitRemaining = paise(net) - (paise(cashPart) + paise(upiPart))
  const splitBalanced =
    tender === 'split' && splitRemaining === 0 && paise(cashPart) + paise(upiPart) > 0
  const needsReason = discount > 0 && !discountReason.trim()

  /** Typing one half of a split fills the other, so it always balances. */
  const setHalf = (which) => (event) => {
    const raw = event.target.value
    const other = Math.max(paise(net) - paise(raw), 0)
    if (which === 'cash') {
      setCashPart(raw)
      setUpiPart(raw === '' ? '' : fromPaise(other))
    } else {
      setUpiPart(raw)
      setCashPart(raw === '' ? '' : fromPaise(other))
    }
  }

  /** The discount + tender half of the request body. */
  const body = () => {
    const out = {}
    if (discount > 0) {
      out.discount_amount = discount.toFixed(2)
      out.discount_reason = discountReason.trim()
    }
    if (net > 0) {
      if (tender === 'split') {
        out.payments = [
          { method: 'cash', amount: Number(cashPart || 0).toFixed(2) },
          { method: 'upi', amount: Number(upiPart || 0).toFixed(2) },
        ].filter((p) => Number(p.amount) > 0)
      } else {
        out.payment_method = tender
      }
    }
    return out
  }

  const summary = () =>
    tender === 'split'
      ? `${rupees(cashPart)} cash + ${rupees(upiPart)} UPI`
      : `${rupees(net)} ${tender === 'cash' ? 'cash' : 'UPI'}`

  const reset = () => {
    setTender('cash')
    setCashPart('')
    setUpiPart('')
    setDiscountInput('')
    setDiscountReason('')
    setShowDiscount(false)
  }

  return {
    tender, setTender, cashPart, upiPart, setHalf,
    discount, discountMode, setDiscountMode, discountInput, setDiscountInput,
    discountReason, setDiscountReason, showDiscount, setShowDiscount,
    net, splitRemaining, splitBalanced, needsReason,
    canTender: !needsReason && (net === 0 || tender !== 'split' || splitBalanced),
    body, summary, reset,
  }
}

export function DiscountBlock({ checkout }) {
  const c = checkout
  if (!c.showDiscount && c.discount === 0) {
    return (
      <button type="button" className="btn btn--ghost btn--sm"
        style={{ marginBottom: '1.25rem' }}
        onClick={() => c.setShowDiscount(true)}>
        <Icon name="star" size={14} /> Apply a discount
      </button>
    )
  }

  return (
    <div className="discount">
      <div className="row" style={{ marginBottom: '0.6rem' }}>
        <span className="pay-label" style={{ margin: 0 }}>Discount</span>
        <span className="spacer" />
        <button type="button" className="btn btn--ghost btn--sm"
          onClick={() => {
            c.setShowDiscount(false)
            c.setDiscountInput('')
            c.setDiscountReason('')
          }}>
          Remove
        </button>
      </div>

      <div className="row" style={{ gap: '0.5rem' }}>
        <div className="seg">
          <button type="button" className={c.discountMode === 'amount' ? 'is-active' : ''}
            onClick={() => c.setDiscountMode('amount')}>₹</button>
          <button type="button" className={c.discountMode === 'percent' ? 'is-active' : ''}
            onClick={() => c.setDiscountMode('percent')}>%</button>
        </div>
        <input type="number" min="0" step="0.01" className="discount__input"
          placeholder={c.discountMode === 'percent' ? '10' : '50'}
          value={c.discountInput}
          onChange={(e) => c.setDiscountInput(e.target.value)}
          aria-label="Discount" />
        {c.discount > 0 && <span className="small muted">= {rupees(c.discount)} off</span>}
      </div>

      <span className="pay-label" style={{ marginTop: '0.85rem' }}>
        Why? <em className="req">required</em>
      </span>
      <div className="reason-chips">
        {DISCOUNT_REASONS.map((r) => (
          <button key={r} type="button"
            className={`chip ${c.discountReason === r ? 'is-active' : ''}`}
            onClick={() => c.setDiscountReason(r)}>{r}</button>
        ))}
      </div>
      <input className="discount__reason" placeholder="Or type a reason…"
        value={c.discountReason}
        onChange={(e) => c.setDiscountReason(e.target.value)}
        aria-label="Discount reason" />
      {c.needsReason && (
        <span className="small" style={{ color: 'var(--bad)' }}>
          A discount has to say why — it is recorded against the bill.
        </span>
      )}
    </div>
  )
}

export function TenderBlock({ checkout, compact }) {
  const c = checkout
  if (c.net === 0) {
    return (
      <p className="small muted">The discount covers the whole bill — nothing to collect.</p>
    )
  }

  return (
    <>
      <span className="pay-label">How was it paid?</span>
      <div className="pay-methods">
        {METHODS.map((m) => (
          <button key={m.value} type="button"
            className={`pay-method ${c.tender === m.value ? 'is-active' : ''}`}
            onClick={() => c.setTender(m.value)}>
            <Icon name={m.icon} size={compact ? 18 : 20} />
            <strong>{m.label}</strong>
            {!compact && <span className="small muted">{m.hint}</span>}
          </button>
        ))}
        <button type="button"
          className={`pay-method ${c.tender === 'split' ? 'is-active' : ''}`}
          onClick={() => c.setTender('split')}>
          <Icon name="ticket" size={compact ? 18 : 20} />
          <strong>Split</strong>
          {!compact && <span className="small muted">Part cash, part UPI</span>}
        </button>
      </div>

      {c.tender === 'split' && (
        <div className="split">
          <div className="split__row">
            <label htmlFor="split-cash">Cash</label>
            <input id="split-cash" type="number" min="0" step="0.01"
              value={c.cashPart} onChange={c.setHalf('cash')} placeholder="0.00" />
          </div>
          <div className="split__row">
            <label htmlFor="split-upi">UPI</label>
            <input id="split-upi" type="number" min="0" step="0.01"
              value={c.upiPart} onChange={c.setHalf('upi')} placeholder="0.00" />
          </div>
          <div className={`split__balance ${c.splitBalanced ? 'is-ok' : ''}`}>
            {c.splitBalanced ? (
              <><Icon name="check" size={14} /> Balances to {rupees(c.net)}</>
            ) : c.splitRemaining > 0 ? (
              <>{rupees(c.splitRemaining / 100)} still to allocate</>
            ) : (
              <>{rupees(Math.abs(c.splitRemaining) / 100)} over the bill</>
            )}
          </div>
        </div>
      )}
    </>
  )
}

/** Cash handed over vs the bill. Display only — revenue records the bill. */
export function ChangeDue({ net }) {
  const [given, setGiven] = useState('')
  const change = paise(given) > 0 ? paise(given) - paise(net) : 0

  return (
    <div className="field" style={{ marginTop: '1rem' }}>
      <label htmlFor="cash-given">
        Cash handed over <span className="muted">(optional, to work out change)</span>
      </label>
      <input id="cash-given" type="number" min="0" step="0.01" value={given}
        onChange={(e) => setGiven(e.target.value)} placeholder={net.toFixed(2)} />
      {change > 0 && (
        <span className="hint" style={{ color: 'var(--ok)' }}>
          Change due: <strong>{rupees(change / 100)}</strong>
        </span>
      )}
      {change < 0 && (
        <span className="hint" style={{ color: 'var(--warn)' }}>
          That is {rupees(Math.abs(change) / 100)} short of the bill.
        </span>
      )}
    </div>
  )
}
