import { useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api'
import { useResource } from '../lib/useResource'
import { rupees, formatDateTime, formatDay, formatTime } from '../lib/format'
import {
  Empty, Loading, Modal, PageHead, Pill, STATUS_TONE, useToast,
} from '../components/ui'

const TIER_TONE = { walkin: '', member: 'info', vip: 'ember', banned: 'bad' }

export default function Customers() {
  const { items, total, loading, load } = useResource('/admin/customers/', { auto: false })
  const [search, setSearch] = useState('')
  const [tier, setTier] = useState('')
  const [viewing, setViewing] = useState(null)
  const [history, setHistory] = useState(null)
  const toast = useToast()

  const query = useMemo(() => {
    const q = new URLSearchParams()
    if (search.trim()) q.set('search', search.trim())
    if (tier) q.set('tier', tier)
    return `?${q}`
  }, [search, tier])

  useEffect(() => {
    const timer = setTimeout(() => load(query), 200)
    return () => clearTimeout(timer)
  }, [query, load])

  const openHistory = async (customer) => {
    setViewing(customer)
    setHistory(null)
    try {
      setHistory(await api.get(`/admin/customers/${customer.id}/bookings/`))
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  const setTierFor = async (customer, next) => {
    try {
      await api.patch(`/admin/customers/${customer.id}/`, { tier: next })
      toast(`${customer.full_name} → ${next}`)
      load(query)
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  return (
    <>
      <PageHead title="Customers" subtitle={`${total} on record`} />

      <div className="toolbar">
        <input type="search" placeholder="Name, phone or gamer tag…" value={search}
          onChange={(e) => setSearch(e.target.value)} aria-label="Search customers" />
        <select value={tier} onChange={(e) => setTier(e.target.value)} aria-label="Tier">
          <option value="">All tiers</option>
          <option value="walkin">Walk-in</option>
          <option value="member">Member</option>
          <option value="vip">VIP</option>
          <option value="banned">Banned</option>
        </select>
      </div>

      <div className="card card--pad0">
        {loading ? <Loading /> : items.length === 0 ? (
          <Empty>No customers yet. They're created automatically from bookings.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Name</th><th>Phone</th><th>Tier</th>
                  <th>Bookings</th><th>Hours</th><th>Since</th><th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <strong>{c.full_name}</strong>
                      {c.gamer_tag && <div className="small muted">{c.gamer_tag}</div>}
                    </td>
                    <td className="mono small">{c.phone}</td>
                    <td>
                      <select value={c.tier} onChange={(e) => setTierFor(c, e.target.value)}
                        aria-label={`Tier for ${c.full_name}`}
                        style={{
                          background: 'var(--ink-900)', border: '1px solid var(--ink-500)',
                          borderRadius: 'var(--r-sm)', padding: '0.25rem 0.4rem', fontSize: '0.8rem',
                        }}>
                        <option value="walkin">Walk-in</option>
                        <option value="member">Member</option>
                        <option value="vip">VIP</option>
                        <option value="banned">Banned</option>
                      </select>
                    </td>
                    <td>{c.total_bookings}</td>
                    <td>{c.total_hours_played}h</td>
                    <td className="small muted nowrap">{formatDay(c.created_at)}</td>
                    <td className="actions">
                      <button className="btn btn--ghost btn--sm" onClick={() => openHistory(c)}>
                        History
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {viewing && (
        <Modal title={viewing.full_name} onClose={() => setViewing(null)} wide>
          <div className="row row--wrap" style={{ gap: '1.5rem', marginBottom: '1.25rem' }}>
            <div><span className="small muted">Phone</span><div className="mono">{viewing.phone}</div></div>
            {viewing.email && <div><span className="small muted">Email</span><div>{viewing.email}</div></div>}
            <div><span className="small muted">Tier</span>
              <div><Pill tone={TIER_TONE[viewing.tier]}>{viewing.tier}</Pill></div></div>
            <div><span className="small muted">Total hours</span>
              <div>{viewing.total_hours_played}h across {viewing.total_bookings} bookings</div></div>
          </div>
          {viewing.notes && <p className="muted small">{viewing.notes}</p>}

          {history === null ? <Loading rows={3} /> : history.length === 0 ? (
            <Empty>No bookings recorded.</Empty>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr><th>Code</th><th>When</th><th>Station</th><th>Status</th><th>Paid</th></tr>
                </thead>
                <tbody>
                  {history.map((b) => (
                    <tr key={b.id}>
                      <td className="mono">{b.code}</td>
                      <td className="nowrap small">
                        {formatDay(b.start_at)} {formatTime(b.start_at)}
                      </td>
                      <td className="small">
                        {b.station_type_name}{b.seats > 1 ? ` × ${b.seats}` : ''}
                      </td>
                      <td><Pill tone={STATUS_TONE[b.status]}>{b.status_display}</Pill></td>
                      <td className="small">{rupees(b.amount_collected || b.amount_due)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Modal>
      )}
    </>
  )
}
