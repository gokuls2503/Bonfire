import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, ApiError } from '../lib/api'
import { rupees, formatDateTime, timeUntil } from '../lib/format'
import Icon from '../components/Icon'
import './tournaments.css'

function RegisterForm({ tournament, onDone }) {
  const solo = tournament.team_size === 1
  const [form, setForm] = useState({
    team_name: '', captain_name: '', phone: '', email: '', roster: '',
  })
  const [errors, setErrors] = useState({})
  const [banner, setBanner] = useState(null)
  const [busy, setBusy] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    setErrors({})
    setBanner(null)
    setBusy(true)
    try {
      await api.register({
        tournament: tournament.id,
        team_name: solo ? form.captain_name.trim() : form.team_name.trim(),
        captain_name: form.captain_name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        roster: form.roster.trim(),
      })
      onDone()
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fields)
        setBanner(err.message)
      } else setBanner('Could not register. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="register-card card" onSubmit={submit}>
      <h3>{solo ? 'Enter the bracket' : 'Register your team'}</h3>
      <p className="small muted">
        {Number(tournament.entry_fee)
          ? `Entry ${rupees(tournament.entry_fee)}, paid at the counter on the day.`
          : 'Free entry. Just turn up on time.'}
      </p>

      {banner && <div className="notice notice--error">{banner}</div>}

      {!solo && (
        <div className="field">
          <label htmlFor="team_name">Team name</label>
          <input
            id="team_name"
            required
            value={form.team_name}
            onChange={(e) => setForm({ ...form, team_name: e.target.value })}
          />
          {errors.team_name && <span className="error">{errors.team_name}</span>}
        </div>
      )}

      <div className="field">
        <label htmlFor="captain_name">{solo ? 'Your name' : 'Captain name'}</label>
        <input
          id="captain_name"
          required
          autoComplete="name"
          value={form.captain_name}
          onChange={(e) => setForm({ ...form, captain_name: e.target.value })}
        />
        {errors.captain_name && <span className="error">{errors.captain_name}</span>}
      </div>

      <div className="field">
        <label htmlFor="reg-phone">Phone number</label>
        <input
          id="reg-phone"
          required
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
        />
        {errors.phone && <span className="error">{errors.phone}</span>}
      </div>

      <div className="field">
        <label htmlFor="reg-email">Email <span className="muted">(optional)</span></label>
        <input
          id="reg-email"
          type="email"
          autoComplete="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
      </div>

      {!solo && (
        <div className="field">
          <label htmlFor="roster">Roster</label>
          <textarea
            id="roster"
            placeholder={`One player per line, with in-game ID.\ne.g. Aditya / adi#4412`}
            value={form.roster}
            onChange={(e) => setForm({ ...form, roster: e.target.value })}
          />
          <span className="small muted">{tournament.team_size} players including you.</span>
        </div>
      )}

      <button className="btn btn--block" disabled={busy}>
        {busy ? 'Submitting…' : 'Submit registration'}
      </button>
      <p className="small muted center">
        We'll call to confirm your slot. Slots are held in registration order.
      </p>
    </form>
  )
}

export default function TournamentDetail() {
  const { slug } = useParams()
  const [t, setT] = useState(null)
  const [notFound, setNotFound] = useState(false)
  const [registered, setRegistered] = useState(false)

  useEffect(() => {
    let cancelled = false
    api
      .tournament(slug)
      .then((res) => !cancelled && setT(res))
      .catch(() => !cancelled && setNotFound(true))
    return () => { cancelled = true }
  }, [slug])

  if (notFound) {
    return (
      <div className="shell section">
        <div className="empty">
          <p>That tournament doesn't exist.</p>
          <Link to="/tournaments" className="btn btn--sm" style={{ marginTop: '1rem' }}>
            All tournaments
          </Link>
        </div>
      </div>
    )
  }

  if (!t) return <div className="loader"><div className="loader__flame" /></div>

  const prizes = t.prize_breakdown?.split('\n').filter(Boolean) || []

  return (
    <>
      <header className="tourney-hero">
        {t.banner && <img src={t.banner} alt="" className="tourney-hero__bg" />}
        <div className="glow page-head__glow" />
        <div className="shell tourney-hero__inner">
          <Link to="/tournaments" className="small muted back-link">
            <Icon name="arrow" size={14} style={{ transform: 'rotate(180deg)' }} /> All tournaments
          </Link>
          <div className="row row--wrap" style={{ gap: '0.5rem', marginTop: '1rem' }}>
            <span className="tag tag--flame">{t.game}</span>
            <span className="tag">{t.format_display}</span>
            {t.team_size > 1 && <span className="tag">{t.team_size}v{t.team_size}</span>}
            <span className={`tag ${t.is_registration_open ? 'tag--ok' : 'tag--bad'}`}>
              {t.is_registration_open ? 'Registration open' : t.status_display}
            </span>
          </div>
          <h1>{t.title}</h1>
          {t.tagline && <p className="lead">{t.tagline}</p>}
        </div>
      </header>

      <div className="shell tourney-detail">
        <div className="tourney-detail__main">
          <div className="stat-strip">
            <div>
              <span className="small muted">Starts</span>
              <strong>{formatDateTime(t.starts_at)}</strong>
              <span className="small flame-text">{timeUntil(t.starts_at)}</span>
            </div>
            <div>
              <span className="small muted">Prize pool</span>
              <strong className="flame-text">{rupees(t.prize_pool)}</strong>
            </div>
            <div>
              <span className="small muted">Entry fee</span>
              <strong>{Number(t.entry_fee) ? rupees(t.entry_fee) : 'Free'}</strong>
            </div>
            <div>
              <span className="small muted">Slots</span>
              <strong>{t.confirmed_team_count} / {t.max_teams}</strong>
              <span className="small muted">{t.slots_left} left</span>
            </div>
          </div>

          {t.description && (
            <section>
              <h2>About</h2>
              {t.description.split('\n\n').map((p, i) => <p key={i} className="lead">{p}</p>)}
            </section>
          )}

          {prizes.length > 0 && (
            <section>
              <h2>Prizes</h2>
              <ul className="prize-list">
                {prizes.map((line, i) => (
                  <li key={i}>
                    <span className={`prize-rank r${i}`}>{i + 1}</span>
                    {line}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {t.rules && (
            <section>
              <h2>Rules</h2>
              {t.rules.split('\n').filter(Boolean).map((p, i) => <p key={i} className="muted">{p}</p>)}
            </section>
          )}
        </div>

        <aside className="tourney-detail__aside">
          {registered ? (
            <div className="card center done">
              <div className="done__mark"><Icon name="check" size={32} /></div>
              <h3>Registration in</h3>
              <p className="muted small">
                You're on the list. We'll call to confirm your slot and take the entry fee
                at the counter on the day.
              </p>
              <Link to="/tournaments" className="btn btn--ghost btn--sm">More tournaments</Link>
            </div>
          ) : t.is_registration_open ? (
            <RegisterForm tournament={t} onDone={() => setRegistered(true)} />
          ) : (
            <div className="card center">
              <Icon name="trophy" size={30} style={{ color: 'var(--flame-400)' }} />
              <h3 style={{ margin: '0.75rem 0' }}>
                {t.status === 'completed' ? 'This one is done' : 'Registration closed'}
              </h3>
              <p className="muted small">
                {t.is_recurring_weekly
                  ? 'This runs every week — the next edition will be up shortly.'
                  : 'Keep an eye on the tournaments page for the next one.'}
              </p>
              <Link to="/tournaments" className="btn btn--sm" style={{ marginTop: '1rem' }}>
                See what's next
              </Link>
            </div>
          )}
        </aside>
      </div>
    </>
  )
}
