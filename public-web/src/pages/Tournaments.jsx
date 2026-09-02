import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { rupees, formatDateTime, timeUntil } from '../lib/format'
import Icon from '../components/Icon'
import './tournaments.css'

const SCOPES = [
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'past', label: 'Past results' },
]

export default function Tournaments() {
  const [scope, setScope] = useState('upcoming')
  const [items, setItems] = useState(null)

  useEffect(() => {
    let cancelled = false
    setItems(null)
    api
      .tournaments(scope)
      .then((res) => !cancelled && setItems(res))
      .catch(() => !cancelled && setItems([]))
    return () => { cancelled = true }
  }, [scope])

  return (
    <>
      <header className="page-head">
        <div className="glow page-head__glow" />
        <div className="shell">
          <span className="eyebrow">Compete</span>
          <h1>Weekly tournaments</h1>
          <p className="lead">
            A bracket every week across PC and console. Small entry fee, real prize pool,
            and a leaderboard that actually gets updated.
          </p>
        </div>
      </header>

      <div className="shell section section--tight">
        <div className="scope-tabs">
          {SCOPES.map((s) => (
            <button
              key={s.key}
              className={scope === s.key ? 'is-active' : ''}
              onClick={() => setScope(s.key)}
            >
              {s.label}
            </button>
          ))}
        </div>

        {items === null && <p className="muted">Loading…</p>}

        {items?.length === 0 && (
          <div className="empty">
            {scope === 'upcoming'
              ? 'No tournaments announced right now — check back soon or follow us on Instagram.'
              : 'No past events yet.'}
          </div>
        )}

        <div className="tourney-list">
          {items?.map((t) => (
            <article key={t.id} className="tourney-row card card--hover">
              <div className="tourney-row__date">
                <span>{new Date(t.starts_at).toLocaleDateString('en-IN', { month: 'short' })}</span>
                <strong>{new Date(t.starts_at).getDate()}</strong>
                <span className="small muted">
                  {new Date(t.starts_at).toLocaleDateString('en-IN', { weekday: 'short' })}
                </span>
              </div>

              <div className="tourney-row__main">
                <div className="row row--wrap" style={{ gap: '0.5rem' }}>
                  <span className="tag tag--ember">{t.game}</span>
                  <span className="tag">{t.format_display}</span>
                  {t.team_size > 1 && <span className="tag">{t.team_size}v{t.team_size}</span>}
                  {t.is_recurring_weekly && <span className="tag">Weekly</span>}
                </div>
                <h3>{t.title}</h3>
                <p className="muted">{t.tagline || t.description?.slice(0, 140)}</p>
                <div className="row row--wrap small muted" style={{ gap: '1.25rem' }}>
                  <span><Icon name="clock" size={14} /> {formatDateTime(t.starts_at)}</span>
                  <span><Icon name="users" size={14} /> {t.confirmed_team_count}/{t.max_teams} in</span>
                  {t.venue_note && <span><Icon name="pin" size={14} /> {t.venue_note}</span>}
                </div>
              </div>

              <div className="tourney-row__aside">
                <div className="tourney-row__prize">
                  <span className="small muted">Prize pool</span>
                  <strong className="flame-text">{rupees(t.prize_pool)}</strong>
                  <span className="small muted">
                    Entry {Number(t.entry_fee) ? rupees(t.entry_fee) : 'free'}
                  </span>
                </div>
                {t.is_registration_open ? (
                  <>
                    <Link to={`/tournaments/${t.slug}`} className="btn btn--sm btn--block">Register</Link>
                    <span className="small muted center">{t.slots_left} slots left · {timeUntil(t.starts_at)}</span>
                  </>
                ) : (
                  <Link to={`/tournaments/${t.slug}`} className="btn btn--ghost btn--sm btn--block">
                    {t.status === 'completed' ? 'Results' : 'Details'}
                  </Link>
                )}
              </div>
            </article>
          ))}
        </div>
      </div>
    </>
  )
}
