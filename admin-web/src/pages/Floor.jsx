import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { formatTime, rupees } from '../lib/format'
import { Loading, PageHead, Pill, STATUS_TONE, useToast } from '../components/ui'
import Icon from '../components/Icon'
import './floor.css'

const NEXT_STATUS = {
  available: 'maintenance',
  maintenance: 'available',
  offline: 'available',
  occupied: 'available',
  reserved: 'available',
}

export default function Floor() {
  const [data, setData] = useState(null)
  const [busy, setBusy] = useState(null)
  const toast = useToast()

  const load = async () => {
    try { setData(await api.get('/admin/dashboard/')) }
    catch (err) { toast(err.message, 'error') }
  }

  useEffect(() => {
    load()
    const timer = setInterval(load, 30000)
    return () => clearInterval(timer)
  }, [])

  const toggle = async (station) => {
    const next = NEXT_STATUS[station.status] || 'available'
    setBusy(station.id)
    try {
      await api.post(`/admin/stations/${station.id}/set_status/`, { status: next })
      toast(`${station.name} → ${next}`)
      await load()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setBusy(null)
    }
  }

  const act = async (booking, action, label) => {
    setBusy(`b${booking.id}`)
    try {
      await api.post(`/admin/bookings/${booking.id}/${action}/`, {})
      toast(`${booking.code} ${label}`)
      await load()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setBusy(null)
    }
  }

  if (!data) return <Loading rows={6} />

  return (
    <>
      <PageHead
        title="The floor"
        subtitle={`${data.stations.occupied} in use · ${data.stations.available} free · ${data.stations.maintenance} down`}
      >
        <button className="btn btn--ghost" onClick={load}>Refresh</button>
      </PageHead>

      <div className="floor-board">
        {data.stations.breakdown.map((s) => (
          <button
            key={s.id}
            className={`floor-card floor-card--${s.status}`}
            onClick={() => toggle(s)}
            disabled={busy === s.id}
            title={`Click to flip to ${NEXT_STATUS[s.status] || 'available'}`}
          >
            <div className="floor-card__top">
              <strong className="mono">{s.name}</strong>
              <Pill tone={STATUS_TONE[s.status]}>{s.status}</Pill>
            </div>
            <span className="small muted">{s.type}</span>
            {s.current_booking ? (
              <div className="floor-card__session">
                <strong>{s.current_booking.full_name}</strong>
                <span className="small">until {formatTime(s.current_booking.end_at)}</span>
                <span className="small mono muted">{s.current_booking.code}</span>
              </div>
            ) : (
              <div className="floor-card__session floor-card__session--idle">
                {s.status_note || (s.status === 'available' ? 'Free — ready to seat' : s.status)}
              </div>
            )}
          </button>
        ))}
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', marginTop: '1.5rem' }}>
        <section className="card card--pad0">
          <header className="card__head"><h3>Playing right now</h3></header>
          {data.live_now.length === 0 ? (
            <div className="empty">Nobody checked in.</div>
          ) : (
            <ul className="floor-list">
              {data.live_now.map((b) => (
                <li key={b.id}>
                  <div>
                    <strong>{b.full_name}</strong>
                    <div className="small muted">
                      {b.station_name || b.station_type_name} · until {formatTime(b.end_at)} ·{' '}
                      {rupees(b.amount_due)} due
                    </div>
                  </div>
                  <span className="spacer" />
                  <button className="btn btn--sm" disabled={busy === `b${b.id}`}
                    onClick={() => act(b, 'complete', 'completed & paid')}>
                    Complete
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card card--pad0">
          <header className="card__head"><h3>Arriving next</h3></header>
          {data.next_up.length === 0 ? (
            <div className="empty">Nothing on the books.</div>
          ) : (
            <ul className="floor-list">
              {data.next_up.map((b) => (
                <li key={b.id}>
                  <div>
                    <strong>{formatTime(b.start_at)} · {b.full_name}</strong>
                    <div className="small muted">
                      {b.station_type_name}{b.seats > 1 ? ` × ${b.seats}` : ''} ·{' '}
                      <span className="mono">{b.code}</span> · {b.phone}
                    </div>
                  </div>
                  <span className="spacer" />
                  <Pill tone={STATUS_TONE[b.status]}>{b.status_display}</Pill>
                  {b.status === 'pending' && (
                    <button className="btn btn--sm" disabled={busy === `b${b.id}`}
                      onClick={() => act(b, 'confirm', 'confirmed')}>Confirm</button>
                  )}
                  {b.status === 'confirmed' && (
                    <button className="btn btn--sm" disabled={busy === `b${b.id}`}
                      onClick={() => act(b, 'check_in', 'checked in')}>Check in</button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  )
}
