import { useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api'
import { useResource } from '../lib/useResource'
import { formatDate, rupees } from '../lib/format'
import {
  ConfirmModal, Empty, Loading, Modal, PageHead, Pill, useToast,
} from '../components/ui'
import Icon from '../components/Icon'
import './dashboard.css'
import './memberships.css'
import '../components/payment.css'

/** The derived state the API reports, in the order staff care about it. */
const FILTERS = [
  { value: '', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'expiring', label: 'Expiring in 7 days' },
  { value: 'unpaid', label: 'Unpaid' },
  { value: 'paused', label: 'Paused' },
  { value: 'expired', label: 'Lapsed' },
  { value: 'cancelled', label: 'Cancelled' },
]

const STATE_TONE = {
  active: 'ok',
  scheduled: 'info',
  paused: 'info',
  unpaid: 'warn',
  expired: 'bad',
  cancelled: 'bad',
}

const hours = (value) => `${Number(value || 0)} hr${Number(value) === 1 ? '' : 's'}`

/** How much of the allowance is gone, at a glance. */
function UsageBar({ membership: m }) {
  if (!m.has_hour_allowance) return <span className="small muted">Discount only</span>
  const pct = Number(m.usage_percent || 0)
  const tone = pct >= 100 ? 'is-full' : pct >= 80 ? 'is-high' : ''
  return (
    <div className="usage">
      <div className="usage__bar">
        <span className={`usage__fill ${tone}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="small muted">
        {hours(m.hours_used)} of {hours(m.included_hours)} · {hours(m.hours_remaining)} left
      </span>
    </div>
  )
}

// Cash and UPI at the counter, matching the rest of the console.
const METHODS = [
  { value: 'cash', label: 'Cash', icon: 'flame' },
  { value: 'upi', label: 'UPI', icon: 'bolt' },
]

function Stat({ label, value, sub, tone }) {
  return (
    <div className={`stat ${tone ? `stat--${tone}` : ''}`}>
      <span className="stat__label">{label}</span>
      <strong className="stat__value">{value}</strong>
      {sub && <span className="stat__sub">{sub}</span>}
    </div>
  )
}

/** Sell a term. Phone first, exactly like a walk-in booking. */
function SellModal({ plans, onClose, onDone }) {
  const sellable = plans.filter((p) => p.is_active)
  const [plan, setPlan] = useState(sellable[0]?.id || '')
  const [phone, setPhone] = useState('')
  const [fullName, setFullName] = useState('')
  const [startsOn, setStartsOn] = useState(() => new Date().toISOString().slice(0, 10))
  const [method, setMethod] = useState('cash')
  const [collectNow, setCollectNow] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const toast = useToast()

  const chosen = sellable.find((p) => String(p.id) === String(plan))

  const submit = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const created = await api.post('/admin/memberships/', {
        plan, phone, full_name: fullName, starts_on: startsOn,
      })
      if (collectNow) {
        await api.post(`/admin/memberships/${created.id}/record_payment/`, {
          payment_method: method,
        })
      }
      toast(`${created.code} — ${chosen?.name}`)
      onDone()
    } catch (err) {
      setError(err.fields?.phone || err.fields?.plan || err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title="Sell a membership"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn--ghost" onClick={onClose}>Cancel</button>
          <button className="btn" onClick={submit} disabled={busy || !plan}>
            {busy ? 'Saving…' : collectNow ? `Take ${rupees(chosen?.price)}` : 'Save as unpaid'}
          </button>
        </>
      }
    >
      <form onSubmit={submit}>
        {error && <div className="notice notice--error">{error}</div>}
        {sellable.length === 0 && (
          <div className="notice notice--info">
            No scheme is on sale. Add one under Membership plans first.
          </div>
        )}

        <div className="field">
          <label htmlFor="plan">Scheme</label>
          <select id="plan" value={plan} onChange={(e) => setPlan(e.target.value)}>
            {sellable.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — {rupees(p.price)} / {p.duration_days} days
              </option>
            ))}
          </select>
          {chosen && (
            <span className="hint">
              {Number(chosen.included_hours) > 0 && `${Number(chosen.included_hours)} hours included. `}
              {Number(chosen.discount_percent) > 0 && `${Number(chosen.discount_percent)}% off sessions.`}
            </span>
          )}
        </div>

        <div className="field-grid">
          <div className="field">
            <label htmlFor="phone">Phone</label>
            <input id="phone" type="tel" value={phone} required
              onChange={(e) => setPhone(e.target.value)} />
            <span className="hint">An existing customer is matched on this number.</span>
          </div>
          <div className="field">
            <label htmlFor="full_name">Name</label>
            <input id="full_name" type="text" value={fullName}
              onChange={(e) => setFullName(e.target.value)} />
          </div>
        </div>

        <div className="field">
          <label htmlFor="starts_on">Term starts</label>
          <input id="starts_on" type="date" value={startsOn}
            onChange={(e) => setStartsOn(e.target.value)} />
        </div>

        <div className="field field--check">
          <input id="collect" type="checkbox" checked={collectNow}
            onChange={(e) => setCollectNow(e.target.checked)} />
          <label htmlFor="collect">Take the fee now</label>
        </div>

        {collectNow && (
          <>
            <span className="pay-label">How was it paid?</span>
            <div className="pay-methods">
              {METHODS.map((m) => (
                <button key={m.value} type="button"
                  className={`pay-method ${method === m.value ? 'is-active' : ''}`}
                  onClick={() => setMethod(m.value)}>
                  <Icon name={m.icon} size={20} />
                  <strong>{m.label}</strong>
                </button>
              ))}
            </div>
          </>
        )}
      </form>
    </Modal>
  )
}

/** Settle an unpaid term. */
function FeeModal({ membership, onClose, onDone }) {
  const [method, setMethod] = useState('cash')
  const [amount, setAmount] = useState(Number(membership.price).toFixed(2))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const toast = useToast()

  const submit = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.post(`/admin/memberships/${membership.id}/record_payment/`, {
        payment_method: method, amount_paid: amount,
      })
      toast(`${membership.code} — ${rupees(amount)} ${method === 'cash' ? 'cash' : 'UPI'}`)
      onDone()
    } catch (err) {
      setError(err.fields?.payment_method || err.fields?.amount_paid || err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={`Membership fee — ${membership.customer_name}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn--ghost" onClick={onClose}>Cancel</button>
          <button className="btn" onClick={submit} disabled={busy}>
            {busy ? 'Saving…' : `Take ${rupees(amount)}`}
          </button>
        </>
      }
    >
      <form onSubmit={submit}>
        {error && <div className="notice notice--error">{error}</div>}
        <div className="pay-summary">
          <div>
            <span className="small muted">Scheme</span>
            <strong>{membership.plan_name}</strong>
          </div>
          <div>
            <span className="small muted">Term</span>
            <strong>{formatDate(membership.starts_on)} – {formatDate(membership.ends_on)}</strong>
          </div>
          <div>
            <span className="small muted">Fee</span>
            <strong className="pay-summary__due">{rupees(membership.price)}</strong>
          </div>
        </div>

        <span className="pay-label">How was it paid?</span>
        <div className="pay-methods">
          {METHODS.map((m) => (
            <button key={m.value} type="button"
              className={`pay-method ${method === m.value ? 'is-active' : ''}`}
              onClick={() => setMethod(m.value)}>
              <Icon name={m.icon} size={20} />
              <strong>{m.label}</strong>
            </button>
          ))}
        </div>

        <div className="field" style={{ marginTop: '1rem' }}>
          <label htmlFor="amount_paid">Amount collected</label>
          <input id="amount_paid" type="number" step="0.01" min="0"
            value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
      </form>
    </Modal>
  )
}

/** The hour ledger for one term, and the form that adds a line to it. */
function UsageModal({ membership, onClose, onChanged }) {
  const [ledger, setLedger] = useState(null)
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [credit, setCredit] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const toast = useToast()

  const load = () => {
    api.get(`/admin/memberships/${membership.id}/usage/`).then(setLedger).catch(() => {})
  }
  useEffect(load, [membership.id])

  const submit = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const signed = credit ? -Math.abs(Number(amount)) : Math.abs(Number(amount))
      await api.post(`/admin/memberships/${membership.id}/usage/`, {
        hours: signed, note, kind: credit ? 'credit' : 'adjustment',
      })
      toast(credit ? `${Math.abs(signed)} hrs credited back` : `${signed} hrs drawn`)
      setAmount('')
      setNote('')
      load()
      onChanged()
    } catch (err) {
      setError(err.fields?.hours || err.fields?.note || err.fields?.detail || err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={`Hours — ${membership.customer_name}`} onClose={onClose} wide>
      {!ledger ? <Loading rows={3} /> : (
        <>
          <div className="pay-summary">
            <div>
              <span className="small muted">Allowance</span>
              <strong>{hours(ledger.included_hours)}</strong>
            </div>
            <div>
              <span className="small muted">Used</span>
              <strong>{hours(ledger.hours_used)}</strong>
            </div>
            <div>
              <span className="small muted">Left</span>
              <strong className="pay-summary__due">{hours(ledger.hours_remaining)}</strong>
            </div>
          </div>

          {membership.has_hour_allowance && (
            <form onSubmit={submit} className="usage-form">
              {error && <div className="notice notice--error">{error}</div>}
              <div className="field-grid">
                <div className="field">
                  <label htmlFor="usage-hours">Hours</label>
                  <input id="usage-hours" type="number" step="0.5" min="0" value={amount}
                    onChange={(e) => setAmount(e.target.value)} placeholder="1.5" />
                </div>
                <div className="field">
                  <label htmlFor="usage-note">What for?</label>
                  <input id="usage-note" type="text" value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Walk-in on PC-02" />
                </div>
              </div>
              <div className="field field--check">
                <input id="usage-credit" type="checkbox" checked={credit}
                  onChange={(e) => setCredit(e.target.checked)} />
                <label htmlFor="usage-credit">Give hours back instead</label>
              </div>
              <button className="btn btn--sm" onClick={submit}
                disabled={busy || !Number(amount) || !note.trim()}>
                {busy ? 'Saving…' : credit ? 'Credit hours back' : 'Draw hours'}
              </button>
            </form>
          )}

          <h4 className="usage-heading">Ledger</h4>
          {ledger.entries.length === 0 ? (
            <Empty>No hours drawn from this term yet.</Empty>
          ) : (
            <table className="data">
              <thead>
                <tr><th>When</th><th>Hours</th><th>Kind</th><th>Note</th></tr>
              </thead>
              <tbody>
                {ledger.entries.map((e) => (
                  <tr key={e.id}>
                    <td className="small muted nowrap">{formatDate(e.created_at)}</td>
                    <td>
                      <strong style={{ color: Number(e.hours) < 0 ? 'var(--ok)' : 'inherit' }}>
                        {Number(e.hours) > 0 ? '+' : ''}{Number(e.hours)}
                      </strong>
                    </td>
                    <td className="small">{e.kind_display}</td>
                    <td className="small muted">
                      {e.booking_code && <><strong>{e.booking_code}</strong> · </>}
                      {e.note}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </Modal>
  )
}

/** Cancelling and waiving both need a reason on the record. */
function ReasonModal({ title, label, confirmLabel, onSubmit, onClose }) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const submit = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await onSubmit(reason)
    } catch (err) {
      setError(err.fields?.reason || err.message)
      setBusy(false)
    }
  }

  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn--ghost" onClick={onClose}>Cancel</button>
          <button className="btn" onClick={submit} disabled={busy || !reason.trim()}>
            {busy ? 'Saving…' : confirmLabel}
          </button>
        </>
      }
    >
      <form onSubmit={submit}>
        {error && <div className="notice notice--error">{error}</div>}
        <div className="field">
          <label htmlFor="reason">{label}</label>
          <input id="reason" type="text" value={reason} autoFocus
            onChange={(e) => setReason(e.target.value)} />
          <span className="hint">Recorded against the membership.</span>
        </div>
      </form>
    </Modal>
  )
}

export default function Memberships() {
  const { items, loading, load } = useResource('/admin/memberships/', { auto: false })
  const [plans, setPlans] = useState([])
  const [summary, setSummary] = useState(null)
  const [search, setSearch] = useState('')
  const [state, setState] = useState('')
  const [selling, setSelling] = useState(false)
  const [collecting, setCollecting] = useState(null)
  const [cancelling, setCancelling] = useState(null)
  const [waiving, setWaiving] = useState(null)
  const [renewing, setRenewing] = useState(null)
  const [viewingUsage, setViewingUsage] = useState(null)
  const [pausing, setPausing] = useState(null)
  const [busy, setBusy] = useState(null)
  const toast = useToast()

  const query = useMemo(() => {
    const q = new URLSearchParams()
    if (search.trim()) q.set('search', search.trim())
    if (state) q.set('state', state)
    return `?${q}`
  }, [search, state])

  const refresh = () => {
    load(query)
    api.get('/admin/memberships/summary/').then(setSummary).catch(() => {})
  }

  useEffect(() => {
    api.get('/admin/membership-plans/')
      .then((r) => setPlans(Array.isArray(r) ? r : r.results || []))
      .catch(() => {})
    // The headline numbers are independent of the filter, so they load once
    // here and are refreshed by `refresh()` after anything that moves them.
    api.get('/admin/memberships/summary/').then(setSummary).catch(() => {})
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => load(query), 200)
    return () => clearTimeout(timer)
  }, [query, load])

  const act = async (membership, path, body, message) => {
    setBusy(membership.id)
    try {
      await api.post(`/admin/memberships/${membership.id}/${path}/`, body || {})
      toast(message)
      refresh()
    } catch (err) {
      toast(err.fields?.detail || err.message, 'error')
    } finally {
      setBusy(null)
    }
  }

  const renew = async () => {
    setBusy('renew')
    try {
      const next = await api.post(`/admin/memberships/${renewing.id}/renew/`, {})
      toast(`Renewed to ${formatDate(next.ends_on)} — fee still to collect`)
      setRenewing(null)
      refresh()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <PageHead
        title="Memberships"
        subtitle={summary
          ? `${summary.active} active · ${summary.expiring_soon} expiring this week`
          : `${items.length} terms`}
      >
        <button className="btn" onClick={() => setSelling(true)}>
          <Icon name="star" size={15} /> Sell membership
        </button>
      </PageHead>

      {summary && (
        <div className="stat-grid" style={{ marginBottom: '1.1rem' }}>
          <Stat label="Active members" value={summary.active} tone="ok" />
          <Stat label="Expiring in 7 days" value={summary.expiring_soon}
            sub="Worth a reminder call" />
          <Stat label="Fees unpaid" value={summary.unpaid} />
          <Stat label="Hours drawn" value={summary.hours_drawn_this_month}
            sub="This month, across all members" />
          <Stat label="This month" value={rupees(summary.revenue_this_month)}
            tone="flame" sub="Membership fees collected" />
          {(summary.due_to_renew > 0 || summary.paused > 0) && (
            <Stat label="Needs a look"
              value={summary.due_to_renew + summary.paused}
              sub={[
                summary.due_to_renew && `${summary.due_to_renew} due to roll`,
                summary.paused && `${summary.paused} paused`,
              ].filter(Boolean).join(' · ')} />
          )}
        </div>
      )}

      <div className="toolbar">
        <input type="search" placeholder="Name, phone or code…" value={search}
          onChange={(e) => setSearch(e.target.value)} aria-label="Search memberships" />
        <select value={state} onChange={(e) => setState(e.target.value)} aria-label="Filter">
          {FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
        <span className="spacer" />
        <button className="btn btn--ghost btn--sm" onClick={refresh}>Refresh</button>
      </div>

      <div className="card card--pad0">
        {loading ? <Loading /> : items.length === 0 ? (
          <Empty>No memberships match this filter.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Member</th><th>Scheme</th><th>Hours</th><th>Term</th>
                  <th>Status</th><th>Fee</th><th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <strong>{m.customer_name}</strong>
                      <div className="small muted">{m.customer_phone} · {m.code}</div>
                    </td>
                    <td>
                      {m.plan_name}
                      <div className="small muted">
                        {Number(m.included_hours) > 0 && `${Number(m.included_hours)} hrs`}
                        {Number(m.included_hours) > 0 && Number(m.discount_percent) > 0 && ' · '}
                        {Number(m.discount_percent) > 0 && `${Number(m.discount_percent)}% off`}
                      </div>
                    </td>
                    <td><UsageBar membership={m} /></td>
                    <td className="small nowrap">
                      {formatDate(m.starts_on)} – {formatDate(m.ends_on)}
                      {m.state === 'active' && (
                        <div className="muted">{m.days_remaining} days left</div>
                      )}
                    </td>
                    <td>
                      <Pill tone={STATE_TONE[m.state]}>{m.state}</Pill>
                      {m.auto_renew && <div className="small muted">auto-renews</div>}
                      {m.paused_days > 0 && m.state !== 'paused' && (
                        <div className="small muted">{m.paused_days}d frozen</div>
                      )}
                    </td>
                    <td>
                      <strong>{rupees(m.price)}</strong>
                      <div className="small muted">
                        {m.payment_status === 'paid'
                          ? `${m.payment_method === 'cash' ? 'Cash' : (m.payment_method || '').toUpperCase()} ${rupees(m.amount_paid)}`
                          : m.payment_status}
                      </div>
                    </td>
                    <td className="actions">
                      {m.payment_status === 'unpaid' && m.status === 'active' && (
                        <>
                          <button className="btn btn--sm" onClick={() => setCollecting(m)}>
                            Take fee
                          </button>
                          <button className="btn btn--ghost btn--sm" onClick={() => setWaiving(m)}>
                            Waive
                          </button>
                        </>
                      )}
                      {m.has_hour_allowance && (
                        <button className="btn btn--ghost btn--sm"
                          onClick={() => setViewingUsage(m)}>Hours</button>
                      )}
                      {m.status === 'active' && m.payment_status !== 'unpaid' && (
                        <>
                          <button className="btn btn--ghost btn--sm" disabled={busy === 'renew'}
                            onClick={() => setRenewing(m)}>Renew</button>
                          <button className="btn btn--ghost btn--sm" disabled={busy === m.id}
                            onClick={() => setPausing(m)}>Pause</button>
                        </>
                      )}
                      {m.status === 'paused' && (
                        <button className="btn btn--sm" disabled={busy === m.id}
                          onClick={() => act(m, 'resume', {}, 'Membership resumed')}>
                          Resume
                        </button>
                      )}
                      {m.status !== 'cancelled' && (
                        <button className="btn btn--ghost btn--sm" disabled={busy === m.id}
                          onClick={() => act(m, 'set_auto_renew', { auto_renew: !m.auto_renew },
                            m.auto_renew ? 'Auto-renew off' : 'Auto-renew on')}>
                          {m.auto_renew ? 'Auto-renew off' : 'Auto-renew'}
                        </button>
                      )}
                      {m.status !== 'cancelled' && (
                        <button className="btn btn--danger btn--sm"
                          onClick={() => setCancelling(m)}>Cancel</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selling && (
        <SellModal
          plans={plans}
          onClose={() => setSelling(false)}
          onDone={() => { setSelling(false); refresh() }}
        />
      )}
      {collecting && (
        <FeeModal
          membership={collecting}
          onClose={() => setCollecting(null)}
          onDone={() => { setCollecting(null); refresh() }}
        />
      )}
      {waiving && (
        <ReasonModal
          title={`Waive the fee — ${waiving.customer_name}`}
          label="Why is it being waived?"
          confirmLabel="Waive fee"
          onClose={() => setWaiving(null)}
          onSubmit={async (reason) => {
            await api.post(`/admin/memberships/${waiving.id}/waive/`, { reason })
            toast('Fee waived')
            setWaiving(null)
            refresh()
          }}
        />
      )}
      {cancelling && (
        <ReasonModal
          title={`Cancel ${cancelling.customer_name}'s membership?`}
          label="Why is it being cancelled?"
          confirmLabel="Cancel membership"
          onClose={() => setCancelling(null)}
          onSubmit={async (reason) => {
            await api.post(`/admin/memberships/${cancelling.id}/cancel/`, { reason })
            toast('Membership cancelled')
            setCancelling(null)
            refresh()
          }}
        />
      )}
      {viewingUsage && (
        <UsageModal
          membership={viewingUsage}
          onClose={() => setViewingUsage(null)}
          onChanged={refresh}
        />
      )}
      {pausing && (
        <ReasonModal
          title={`Pause ${pausing.customer_name}'s membership?`}
          label="Why is it being paused?"
          confirmLabel="Pause membership"
          onClose={() => setPausing(null)}
          onSubmit={async (reason) => {
            await api.post(`/admin/memberships/${pausing.id}/pause/`, { reason })
            toast('Paused — the days stop ticking until it resumes')
            setPausing(null)
            refresh()
          }}
        />
      )}
      {renewing && (
        <ConfirmModal
          title={`Renew ${renewing.customer_name}?`}
          body={`A new ${renewing.plan_name} term starts the day after ${formatDate(renewing.ends_on)}, at today's rate. The fee is collected separately.`}
          confirmLabel="Renew"
          onConfirm={renew}
          onClose={() => setRenewing(null)}
          busy={busy === 'renew'}
        />
      )}
    </>
  )
}
