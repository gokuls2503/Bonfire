import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../lib/api'
import { useResource } from '../lib/useResource'
import { formatDateTime } from '../lib/format'
import {
  ConfirmModal, Empty, Loading, Modal, PageHead, Pill, STATUS_TONE, useToast,
} from '../components/ui'

const STATUSES = ['pending', 'confirmed', 'waitlist', 'rejected', 'withdrawn']

export default function Registrations() {
  const [params, setParams] = useSearchParams()
  const { items, loading, load } = useResource('/admin/registrations/', { auto: false })
  const [tournaments, setTournaments] = useState([])
  const [tournament, setTournament] = useState(params.get('tournament') || '')
  const [status, setStatus] = useState(params.get('status') || '')
  const [viewing, setViewing] = useState(null)
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
        ...(payment ? { payment_status: payment } : {}),
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
                    <td><Pill tone={STATUS_TONE[r.payment_status]}>{r.payment_status}</Pill></td>
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
                        <button className="btn btn--sm" disabled={busy === r.id}
                          onClick={() => setRegStatus(r, 'confirmed', 'paid')}>Mark paid</button>
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
