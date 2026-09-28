import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { api } from '../lib/api'
import { rupees, formatTime, timeUntil } from '../lib/format'
import { Loading, Pill, STATUS_TONE, useToast } from '../components/ui'
import Icon from '../components/Icon'
import './dashboard.css'

function Stat({ label, value, sub, tone, icon }) {
  return (
    <div className={`stat ${tone ? `stat--${tone}` : ''}`}>
      {icon && <span className="stat__icon"><Icon name={icon} size={17} /></span>}
      <span className="stat__label">{label}</span>
      <strong className="stat__value">{value}</strong>
      {sub && <span className="stat__sub">{sub}</span>}
    </div>
  )
}

function chartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="chart-tip">
      <strong>{label}</strong>
      {payload.map((p) => (
        <div key={p.dataKey}>
          {p.dataKey === 'revenue' ? rupees(p.value) : `${p.value} bookings`}
        </div>
      ))}
    </div>
  )
}

export default function Dashboard({ onData }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(null)
  const toast = useToast()

  const load = async () => {
    try {
      const res = await api.get('/admin/dashboard/')
      setData(res)
      onData?.(res)
    } catch (err) {
      setError(err.message)
    }
  }

  useEffect(() => {
    load()
    const timer = setInterval(load, 60000)
    return () => clearInterval(timer)
  }, [])

  const act = async (booking, action, label) => {
    setBusy(`${booking.id}-${action}`)
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

  if (error) return <div className="notice notice--error">{error}</div>
  if (!data) return <Loading rows={8} />

  const a = data.attention

  return (
    <div className="dashboard">
      <div className="row row--wrap" style={{ marginBottom: '1.5rem' }}>
        <div>
          <h1>Today at the hub</h1>
          <p className="muted small" style={{ marginTop: '0.35rem' }}>
            Live view, refreshed every minute.
          </p>
        </div>
        <span className="spacer" />
        <Link to="/sales" className="btn btn--ghost">
          <Icon name="flame" size={15} /> {rupees(data.month.revenue)} this month
        </Link>
        <Link to="/bookings?new=1" className="btn">
          <Icon name="calendar" size={15} /> New booking
        </Link>
      </div>

      {(a.pending_bookings > 0 || a.unread_messages > 0 || a.pending_registrations > 0 || a.stations_down > 0) && (
        <div className="attention">
          {a.pending_bookings > 0 && (
            <Link to="/bookings?status=pending">
              <Icon name="clock" size={15} /> {a.pending_bookings} booking{a.pending_bookings > 1 ? 's' : ''} to confirm
            </Link>
          )}
          {a.pending_registrations > 0 && (
            <Link to="/registrations?status=pending">
              <Icon name="ticket" size={15} /> {a.pending_registrations} tournament registration{a.pending_registrations > 1 ? 's' : ''}
            </Link>
          )}
          {a.unread_messages > 0 && (
            <Link to="/messages">
              <Icon name="mail" size={15} /> {a.unread_messages} unread message{a.unread_messages > 1 ? 's' : ''}
            </Link>
          )}
          {a.stations_down > 0 && (
            <Link to="/stations" className="is-bad">
              <Icon name="close" size={15} /> {a.stations_down} station{a.stations_down > 1 ? 's' : ''} down
            </Link>
          )}
        </div>
      )}

      <div className="stat-grid">
        <Stat icon="calendar" label="Bookings today" value={data.today.bookings}
          sub={`${data.today.completed} done · ${data.today.pending} pending`} />
        <Stat icon="bolt" label="Playing now" value={data.today.checked_in}
          sub={`${data.stations.available} of ${data.stations.total} stations free`} tone="ok" />
        <Stat icon="flame" label="Revenue today" value={rupees(data.today.revenue)}
          sub={`${rupees(data.today.cash)} cash · ${rupees(data.today.online)} online`}
          tone="flame" />
        <Stat icon="users" label="Customers" value={data.customers.total}
          sub={`+${data.customers.new_this_week} this week`} />
      </div>

      <div className="dash-grid">
        <section className="card card--pad0">
          <header className="card__head">
            <h3>The floor</h3>
            <span className="spacer" />
            <Link to="/floor" className="btn btn--ghost btn--sm">Open floor view</Link>
          </header>
          <div className="floor-grid">
            {data.stations.breakdown.map((s) => (
              <div key={s.id} className={`floor-tile floor-tile--${s.status}`}>
                <strong>{s.name}</strong>
                <span className="small">{s.type}</span>
                {s.current_booking ? (
                  <span className="floor-tile__who">
                    {s.current_booking.full_name}
                    <em>till {formatTime(s.current_booking.end_at)}</em>
                  </span>
                ) : (
                  <span className="floor-tile__who muted">
                    {s.status_note || s.status}
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>

        <section className="card card--pad0">
          <header className="card__head">
            <h3>Next up</h3>
            <span className="spacer" />
            <Link to="/bookings" className="btn btn--ghost btn--sm">All bookings</Link>
          </header>
          {data.next_up.length === 0 ? (
            <div className="empty">Nothing else booked today. Walk-ins welcome.</div>
          ) : (
            <ul className="next-list">
              {data.next_up.map((b) => (
                <li key={b.id}>
                  <div className="next-list__time">
                    <strong>{formatTime(b.start_at)}</strong>
                    <span className="small muted">{timeUntil(b.start_at)}</span>
                  </div>
                  <div className="next-list__who">
                    <strong>{b.full_name}</strong>
                    <span className="small muted">
                      {b.station_type_name}{b.seats > 1 ? ` × ${b.seats}` : ''} ·{' '}
                      <span className="mono">{b.code}</span> · {b.phone}
                    </span>
                  </div>
                  <Pill tone={STATUS_TONE[b.status]}>{b.status_display}</Pill>
                  <div className="next-list__actions">
                    {b.status === 'pending' && (
                      <button className="btn btn--sm" disabled={busy === `${b.id}-confirm`}
                        onClick={() => act(b, 'confirm', 'confirmed')}>Confirm</button>
                    )}
                    {b.status === 'confirmed' && (
                      <button className="btn btn--sm" disabled={busy === `${b.id}-check_in`}
                        onClick={() => act(b, 'check_in', 'checked in')}>Check in</button>
                    )}
                    <button className="btn btn--ghost btn--sm" disabled={busy === `${b.id}-cancel`}
                      onClick={() => act(b, 'cancel', 'cancelled')}>Cancel</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="dash-grid dash-grid--split">
        <section className="card">
          <h3 style={{ marginBottom: '1rem' }}>Last 7 days</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.trend_7d} margin={{ top: 4, right: 4, left: -22, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f1f27" vertical={false} />
              <XAxis dataKey="label" stroke="#6b6a66" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="#6b6a66" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip content={chartTooltip} cursor={{ fill: 'rgba(0, 120, 240, 0.07)' }} />
              <Bar dataKey="bookings" fill="#0078f0" radius={[4, 4, 0, 0]} maxBarSize={38} />
            </BarChart>
          </ResponsiveContainer>
        </section>

        <section className="card">
          <h3 style={{ marginBottom: '1rem' }}>Next tournament</h3>
          {data.next_tournament ? (
            <div className="stack" style={{ gap: '0.75rem' }}>
              <div>
                <Pill tone="flame">{data.next_tournament.game}</Pill>
                <h2 style={{ margin: '0.6rem 0 0.3rem' }}>{data.next_tournament.title}</h2>
                <p className="muted small">{data.next_tournament.tagline}</p>
              </div>
              <div className="mini-stats">
                <div><span className="small muted">Teams in</span>
                  <strong>{data.next_tournament.confirmed_team_count}/{data.next_tournament.max_teams}</strong></div>
                <div><span className="small muted">Prize pool</span>
                  <strong>{rupees(data.next_tournament.prize_pool)}</strong></div>
                <div><span className="small muted">Starts</span>
                  <strong>{timeUntil(data.next_tournament.starts_at)}</strong></div>
              </div>
              <Link to={`/registrations?tournament=${data.next_tournament.id}`} className="btn btn--ghost btn--sm">
                Manage registrations
              </Link>
            </div>
          ) : (
            <div className="empty">
              No tournament scheduled.
              <br />
              <Link to="/tournaments?new=1" className="btn btn--sm" style={{ marginTop: '1rem' }}>
                Create one
              </Link>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
