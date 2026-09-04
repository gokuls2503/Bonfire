import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../lib/api'
import { useResource } from '../lib/useResource'
import { formatDateTime, rupees } from '../lib/format'
import {
  ConfirmModal, Empty, Loading, Modal, PageHead, Pill, STATUS_TONE, useToast,
} from '../components/ui'
import Icon from '../components/Icon'
import '../components/payment.css'

const STATUSES = ['pending', 'confirmed', 'waitlist', 'rejected', 'withdrawn']

// Cash and UPI only, matching the counter. See PaymentModal for why.
const METHODS = [
  { value: 'cash', label: 'Cash', icon: 'flame' },
  { value: 'upi', label: 'UPI', icon: 'bolt' },
]

/** Entry fees are revenue too, so they need the same cash/online split. */
function EntryFeeModal({ registration, tournaments, onDone, onClose }) {
  const fee = Number(
    tournaments.find((t) => t.id === registration.tournament)?.entry_fee ?? 0,
  )
  const [method, setMethod] = useState('cash')
  const [amount, setAmount] = useState(fee.toFixed(2))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const toast = useToast()

  const submit = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.post(`/admin/registrations/${registration.id}/set_status/`, {
        status: 'confirmed',
        payment_status: 'paid',
        payment_method: method,
        amount_paid: amount,
      })
      toast(`${registration.team_name} — ${rupees(amount)} ${method === 'cash' ? 'cash' : method.toUpperCase()}`)
      onDone()
    } catch (err) {
      setError(err.fields?.payment_method || err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={`Entry fee — ${registration.team_name}`}
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
            <span className="small muted">Captain</span>
            <strong>{registration.captain_name}</strong>
          </div>
          <div>
            <span className="small muted">Tournament</span>
            <strong>{registration.tournament_title}</strong>
          </div>
          <div>
            <span className="small muted">Entry fee</span>
            <strong className="pay-summary__due">{rupees(fee)}</strong>
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

export default function Registrations() {
  const [params, setParams] = useSearchParams()
  const { items, loading, load } = useResource('/admin/registrations/', { auto: false })
  const [tournaments, setTournaments] = useState([])
  const [tournament, setTournament] = useState(params.get('tournament') || '')
  const [status, setStatus] = useState(params.get('status') || '')
  const [viewing, setViewing] = useState(null)
  const [collecting, setCollecting] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [busy, setBusy] = useState(null)
  const toast = useToast()

  useEffect(() => {
    api.get('/admin/tournaments/').then((r) => setTournaments(Array.isArray(r) ? r : r.results || []))
  }, [])

  const query = useMemo(() => {
    const q = new URLSearchParams()
    if (tournament) q.set('tournament', tournament)
    if (status) q.set('status', status)
    return `?${q}`
  }, [tournament, status])

  useEffect(() => { load(query) }, [query, load])

  const setRegStatus = async (reg, next, payment) => {
    setBusy(reg.id)
    try {
      await api.post(`/admin/registrations/${reg.id}/set_status/`, {
        status: next,
        ...(payment || {}),
      })
      toast(`${reg.team_name} → ${next}`)
      load(query)
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setBusy(null)
    }
  }

  const remove = async () => {
    setBusy('del')
    try {
      await api.del(`/admin/registrations/${deleting.id}/`)
      toast('Registration deleted')
      setDeleting(null)
      load(query)
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setBusy(null)
    }
  }

  const selected = tournaments.find((t) => String(t.id) === String(tournament))

  return (
    <>
      <PageHead
        title="Registrations"
        subtitle={selected
          ? `${selected.title} — ${selected.confirmed_team_count}/${selected.max_teams} confirmed`
          : `${items.length} across all tournaments`}
      />

      <div className="toolbar">
        <select value={tournament} onChange={(e) => { setTournament(e.target.value); setParams({}) }}
          aria-label="Tournament">
          <option value="">All tournaments</option>
          {tournaments.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <span className="spacer" />
        <button className="btn btn--ghost btn--sm" onClick={() => load(query)}>Refresh</button>
      </div>

      <div className="card card--pad0">
        {loading ? <Loading /> : items.length === 0 ? (
          <Empty>No registrations match this filter.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Team</th><th>Captain</th><th>Tournament</th>
                  <th>Status</th><th>Payment</th><th>Registered</th><th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <strong>{r.team_name}</strong>
                      {r.seed && <div className="small muted">seed {r.seed}</div>}
                    </td>
                    <td>
                      {r.captain_name}
                      <div className="small muted">{r.phone}</div>
                    </td>
                    <td className="small">{r.tournament_title}</td>
                    <td><Pill tone={STATUS_TONE[r.status]}>{r.status_display}</Pill></td>
                    <td>
                      <Pill tone={STATUS_TONE[r.payment_status]}>
                        {r.payment_status === 'paid' && r.payment_method
                          ? r.payment_method === 'cash' ? 'Cash' : r.payment_method.toUpperCase()
                          : r.payment_status}
                      </Pill>
                      {r.payment_status === 'paid' && Number(r.amount_paid) > 0 && (
                        <div className="small muted">{rupees(r.amount_paid)}</div>
                      )}
                    </td>
                    <td className="small muted nowrap">{formatDateTime(r.created_at)}</td>
                    <td className="actions">
                      {r.status === 'pending' && (
                        <>
                          <button className="btn btn--sm" disabled={busy === r.id}
                            onClick={() => setRegStatus(r, 'confirmed')}>Confirm</button>
                          <button className="btn btn--ghost btn--sm" disabled={busy === r.id}
                            onClick={() => setRegStatus(r, 'waitlist')}>Waitlist</button>
                        </>
                      )}
                      {r.status === 'confirmed' && r.payment_status === 'unpaid' && (
                        <button className="btn btn--sm" onClick={() => setCollecting(r)}>
                          Take entry fee
                        </button>
                      )}
                      {r.roster && (
                        <button className="btn btn--ghost btn--sm" onClick={() => setViewing(r)}>Roster</button>
                      )}
                      <button className="btn btn--danger btn--sm" onClick={() => setDeleting(r)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {viewing && (
        <Modal title={`${viewing.team_name} roster`} onClose={() => setViewing(null)}>
          <p className="muted small">Captain: {viewing.captain_name} · {viewing.phone}</p>
          <pre style={{
            whiteSpace: 'pre-wrap', fontFamily: 'var(--font-mono)', fontSize: '0.85rem',
            background: 'var(--ink-900)', padding: '1rem', borderRadius: 'var(--r-md)',
            border: '1px solid var(--ink-600)',
          }}>{viewing.roster}</pre>
        </Modal>
      )}
      {collecting && (
        <EntryFeeModal
          registration={collecting}
          tournaments={tournaments}
          onClose={() => setCollecting(null)}
          onDone={() => { setCollecting(null); load(query) }}
        />
      )}
      {deleting && (
        <ConfirmModal
          title={`Delete ${deleting.team_name}?`}
          body="This frees their slot in the bracket."
          onConfirm={remove}
          onClose={() => setDeleting(null)}
          busy={busy === 'del'}
        />
      )}
    </>
  )
}
