import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useSite } from '../lib/SiteContext'
import { api, ApiError } from '../lib/api'
import { rupees, duration, toDateKey, formatDay, formatTime, telHref } from '../lib/format'
import Icon from '../components/Icon'
import './book.css'

/** The per-controller rate a plan charges at this group size, if it has one. */
const ratePer = (plan, controllers) =>
  plan?.controller_rates?.find((r) => r.controllers === controllers)?.price_per_controller

/** What one station of this plan costs for the group. Falls back to the flat
 *  price, so a station type that is not priced per controller needs no branch. */
const planPrice = (plan, controllers) => {
  const rate = ratePer(plan, controllers)
  return rate ? Number(rate) * controllers : Number(plan?.price || 0)
}

const STEPS = ['Station', 'Date & time', 'Your details', 'Done']

function DatePicker({ value, onChange, horizonDays }) {
  const days = useMemo(() => {
    const out = []
    const today = new Date()
    for (let i = 0; i < Math.min(horizonDays, 14); i += 1) {
      const d = new Date(today)
      d.setDate(today.getDate() + i)
      out.push(d)
    }
    return out
  }, [horizonDays])

  return (
    <div className="date-strip" role="radiogroup" aria-label="Choose a date">
      {days.map((d, i) => {
        const key = toDateKey(d)
        const active = key === value
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={active}
            className={`date-chip ${active ? 'is-active' : ''}`}
            onClick={() => onChange(key)}
          >
            <span className="date-chip__dow">
              {i === 0 ? 'Today' : i === 1 ? 'Tmrw' : d.toLocaleDateString('en-IN', { weekday: 'short' })}
            </span>
            <span className="date-chip__day">{d.getDate()}</span>
            <span className="date-chip__mon">{d.toLocaleDateString('en-IN', { month: 'short' })}</span>
          </button>
        )
      })}
    </div>
  )
}

export default function Book() {
  const { data } = useSite()
  const [params] = useSearchParams()
  const types = data.station_types
  const settings = data.settings

  const [step, setStep] = useState(0)
  const [typeId, setTypeId] = useState(() => Number(params.get('type')) || types[0]?.id)
  const [planId, setPlanId] = useState(null)
  const [seats, setSeats] = useState(1)
  const [controllers, setControllers] = useState(1)
  const [date, setDate] = useState(() => toDateKey(new Date()))
  const [slot, setSlot] = useState(null)

  const [avail, setAvail] = useState(null)
  const [availLoading, setAvailLoading] = useState(false)

  const [form, setForm] = useState({ full_name: '', phone: '', email: '', notes: '' })
  const [errors, setErrors] = useState({})
  const [banner, setBanner] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [confirmation, setConfirmation] = useState(null)

  const type = types.find((t) => t.id === typeId)
  // Counter-only rates (happy hour) are advertised on the rates page but never
  // offered here: this flow picks a slot days ahead and cannot know whether the
  // customer will turn up inside the deal's window.
  const bookablePlans = useMemo(
    () => type?.pricing_plans.filter((p) => p.is_bookable !== false) ?? [],
    [type],
  )
  const plan = bookablePlans.find((p) => p.id === planId)
  const minutes = plan?.duration_minutes || 60

  // Default to the first plan whenever the station type changes.
  useEffect(() => {
    if (type && !bookablePlans.some((p) => p.id === planId)) {
      setPlanId(bookablePlans[0]?.id ?? null)
    }
  }, [type, planId, bookablePlans])

  // Chosen slot stops being valid the moment date/type/duration changes.
  useEffect(() => { setSlot(null) }, [date, typeId, minutes])

  useEffect(() => {
    if (step !== 1 || !typeId) return undefined
    const controller = new AbortController()
    setAvailLoading(true)
    api
      .availability({ date, duration: minutes, stationType: typeId })
      .then((res) => { if (!controller.signal.aborted) setAvail(res) })
      .catch(() => { if (!controller.signal.aborted) setAvail(null) })
      .finally(() => { if (!controller.signal.aborted) setAvailLoading(false) })
    return () => controller.abort()
  }, [step, date, minutes, typeId])

  const slots = avail?.station_types?.[0]?.slots || []
  const capacity = avail?.station_types?.[0]?.capacity ?? type?.station_count ?? 1
  // A console is priced per controller and the rate falls as the group grows,
  // so the figure to show is the rate for THIS group size, not the plan's own.
  const perController = type?.prices_per_controller
    ? plan?.controller_rates?.find((r) => r.controllers === controllers)
    : null
  const maxControllers = type?.prices_per_controller
    ? (type.max_players_per_station || 1)
    : 1
  const total = plan
    ? (perController
        ? Number(perController.price_per_controller) * controllers * seats
        : Number(plan.price) * seats)
    : 0

  // Switching to a station type that takes fewer controllers must not leave a
  // count behind that the server would reject.
  useEffect(() => {
    setControllers((c) => Math.min(Math.max(c, 1), maxControllers))
  }, [maxControllers])

  const goTo = (n) => { setStep(n); setBanner(null); window.scrollTo({ top: 0, behavior: 'smooth' }) }

  const submit = async (event) => {
    event.preventDefault()
    setErrors({})
    setBanner(null)
    setSubmitting(true)
    try {
      const result = await api.createBooking({
        full_name: form.full_name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        notes: form.notes.trim(),
        station_type: typeId,
        pricing_plan: planId,
        controllers,
        start_at: slot.start,
        seats,
      })
      setConfirmation(result)
      goTo(3)
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fields)
        setBanner(err.message)
        // Capacity conflicts are only fixable back on the slot step.
        if (err.fields.start_at) goTo(1)
      } else {
        setBanner('Something went wrong. Please try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (!settings.booking_enabled && step < 3) {
    return (
      <div className="shell section">
        <div className="empty">
          <h2 style={{ marginBottom: '1rem' }}>Online booking is paused</h2>
          <p className="muted">
            Give us a call and we'll sort you out.{' '}
            {settings.phone && <a href={telHref(settings.phone)} className="flame-text">{settings.phone}</a>}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="book">
      <header className="page-head">
        <div className="glow page-head__glow" />
        <div className="shell">
          <span className="eyebrow">Reserve your seat</span>
          <h1>Book a station</h1>
          <p className="lead">{settings.booking_note}</p>
        </div>
      </header>

      <div className="shell book__body">
        <ol className="stepper">
          {STEPS.map((label, i) => (
            <li key={label} className={i === step ? 'is-active' : i < step ? 'is-done' : ''}>
              <span>{i < step ? <Icon name="check" size={13} /> : i + 1}</span>
              {label}
            </li>
          ))}
        </ol>

        {banner && <div className="notice notice--error">{banner}</div>}

        <div className="book__panel">
          {step === 0 && (
            <div className="book__step">
              <h2>What are you playing on?</h2>
              <div className="type-picker">
                {types.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={`type-option ${t.id === typeId ? 'is-active' : ''}`}
                    onClick={() => { setTypeId(t.id); setSeats(1) }}
                  >
                    <Icon name={t.icon} size={26} />
                    <strong>{t.name}</strong>
                    <span className="small muted">{t.station_count} stations</span>
                    {t.short_description && <p className="small muted">{t.short_description}</p>}
                  </button>
                ))}
              </div>

              <h2 style={{ marginTop: '2.5rem' }}>How long?</h2>
              <div className="plan-picker">
                {bookablePlans.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`plan-option ${p.id === planId ? 'is-active' : ''}`}
                    onClick={() => setPlanId(p.id)}
                  >
                    <div className="row" style={{ justifyContent: 'space-between' }}>
                      <strong>{p.name}</strong>
                      {p.badge && <span className="tag tag--flame">{p.badge}</span>}
                    </div>
                    <span className="plan-option__price">
                      {rupees(planPrice(p, controllers))}
                    </span>
                    <span className="small muted">
                      {duration(p.duration_minutes)}
                      {type?.prices_per_controller && controllers > 1 && (
                        <> · {rupees(ratePer(p, controllers))}/controller</>
                      )}
                    </span>
                    {p.description && <span className="small muted">{p.description}</span>}
                  </button>
                ))}
              </div>

              {type?.prices_per_controller && maxControllers > 1 && (
                <>
                  <h2 style={{ marginTop: '2.5rem' }}>How many controllers?</h2>
                  <div className="controller-picker">
                    {Array.from({ length: maxControllers }, (_, i) => i + 1).map((n) => {
                      const rate = plan?.controller_rates?.find((r) => r.controllers === n)
                      return (
                        <button
                          key={n}
                          type="button"
                          className={`controller-option ${n === controllers ? 'is-active' : ''}`}
                          onClick={() => setControllers(n)}
                        >
                          <strong>{n}</strong>
                          <span className="small muted">
                            {n === 1 ? 'controller' : 'controllers'}
                          </span>
                          {rate && (
                            <>
                              <span className="controller-option__rate">
                                {rupees(rate.price_per_controller)}
                              </span>
                              <span className="small muted">each · {rupees(rate.total)} total</span>
                            </>
                          )}
                        </button>
                      )
                    })}
                  </div>
                  <p className="small muted" style={{ marginTop: '0.75rem' }}>
                    Everyone plays on the one screen. The more controllers, the less
                    each one costs.
                  </p>
                </>
              )}

              {type && type.station_count > 1 && (
                <>
                  <h2 style={{ marginTop: '2.5rem' }}>How many stations?</h2>
                  <div className="seat-picker">
                    <button
                      type="button"
                      onClick={() => setSeats((s) => Math.max(1, s - 1))}
                      disabled={seats <= 1}
                      aria-label="Fewer stations"
                    >−</button>
                    <span>{seats}</span>
                    <button
                      type="button"
                      onClick={() => setSeats((s) => Math.min(type.station_count, s + 1))}
                      disabled={seats >= type.station_count}
                      aria-label="More stations"
                    >+</button>
                    <p className="small muted">
                      Booking {seats} of {type.station_count} {type.name}
                      {seats > 1 ? 's' : ''} — {rupees(total)} total
                    </p>
                    {/* Without the controller count this line reads as though the
                        total were the headline rate times the consoles, and a
                        reader has no way to tell 1 controller each from 4. It is
                        the count that drives the price now, so it has to show. */}
                    {type.prices_per_controller && perController && (
                      <p className="small muted seat-picker__breakdown">
                        {controllers} {controllers === 1 ? 'controller' : 'controllers'} on each
                        {seats > 1 ? ` — ${rupees(Number(perController.price_per_controller) * controllers)} per console` : ''}
                      </p>
                    )}
                  </div>
                </>
              )}

              <div className="book__actions">
                <span className="spacer" />
                <button className="btn" onClick={() => goTo(1)} disabled={!planId}>
                  Pick a time <Icon name="arrow" size={18} />
                </button>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="book__step">
              <h2>When are you coming in?</h2>
              <DatePicker value={date} onChange={setDate} horizonDays={settings.booking_horizon_days} />

              {availLoading && <p className="muted" style={{ marginTop: '1.5rem' }}>Checking availability…</p>}

              {!availLoading && avail && !avail.is_open && (
                <div className="notice notice--info" style={{ marginTop: '1.5rem' }}>
                  {avail.reason || "We're closed that day. Pick another date."}
                </div>
              )}

              {!availLoading && avail?.is_open && (
                <>
                  <div className="row row--wrap slot-legend">
                    <span><i className="dot dot--free" /> Free</span>
                    <span><i className="dot dot--tight" /> Nearly full</span>
                    <span><i className="dot dot--gone" /> Unavailable</span>
                    <span className="spacer" />
                    <span className="small muted">
                      {duration(minutes)} on {type?.name} · {seats} station{seats > 1 ? 's' : ''}
                    </span>
                  </div>

                  <div className="slot-grid">
                    {slots.map((s) => {
                      const enough = s.free >= seats
                      const usable = s.bookable && enough
                      const tight = usable && s.free <= Math.ceil(capacity / 3)
                      return (
                        <button
                          key={s.start}
                          type="button"
                          disabled={!usable}
                          className={`slot ${slot?.start === s.start ? 'is-active' : ''} ${tight ? 'is-tight' : ''}`}
                          onClick={() => setSlot(s)}
                        >
                          <strong>{s.label}</strong>
                          <span className="small">
                            {usable
                              ? `${s.free} free`
                              : !s.bookable
                                ? 'passed'
                                : s.free > 0
                                  ? `only ${s.free}`
                                  : 'full'}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                  {slots.length === 0 && <p className="muted">No slots left for this date.</p>}
                </>
              )}

              <div className="book__actions">
                <button className="btn btn--ghost" onClick={() => goTo(0)}>Back</button>
                <span className="spacer" />
                <button className="btn" onClick={() => goTo(2)} disabled={!slot}>
                  Continue <Icon name="arrow" size={18} />
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <form className="book__step" onSubmit={submit}>
              <h2>Who's it for?</h2>

              <div className="summary-card">
                <div>
                  <span className="small muted">Station</span>
                  <strong>{type?.name} × {seats}</strong>
                </div>
                <div>
                  <span className="small muted">When</span>
                  <strong>{formatDay(slot.start)}, {formatTime(slot.start)}</strong>
                </div>
                <div>
                  <span className="small muted">Duration</span>
                  <strong>{duration(minutes)}</strong>
                </div>
                <div>
                  <span className="small muted">Pay at counter</span>
                  <strong className="flame-text">{rupees(total)}</strong>
                </div>
              </div>

              <div className="field-row">
                <div className="field">
                  <label htmlFor="full_name">Your name</label>
                  <input
                    id="full_name"
                    required
                    autoComplete="name"
                    value={form.full_name}
                    onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                  />
                  {errors.full_name && <span className="error">{errors.full_name}</span>}
                </div>
                <div className="field">
                  <label htmlFor="phone">Phone number</label>
                  <input
                    id="phone"
                    required
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="10-digit mobile"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  />
                  {errors.phone && <span className="error">{errors.phone}</span>}
                </div>
              </div>

              <div className="field">
                <label htmlFor="email">Email <span className="muted">(optional)</span></label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
                {errors.email && <span className="error">{errors.email}</span>}
              </div>

              <div className="field">
                <label htmlFor="notes">Anything we should know? <span className="muted">(optional)</span></label>
                <textarea
                  id="notes"
                  placeholder="Bringing my own controller / need seats together / it's a birthday…"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </div>

              <p className="small muted">
                We'll hold your seat for 15 minutes after the slot starts. Nothing is charged now.
              </p>

              <div className="book__actions">
                <button type="button" className="btn btn--ghost" onClick={() => goTo(1)}>Back</button>
                <span className="spacer" />
                <button type="submit" className="btn" disabled={submitting}>
                  {submitting ? 'Booking…' : 'Confirm booking'}
                </button>
              </div>
            </form>
          )}

          {step === 3 && confirmation && (
            <div className="book__step center done">
              <div className="done__mark"><Icon name="check" size={38} /></div>
              <h2>You're in</h2>
              <p className="lead">
                {confirmation.station_type} held for {formatDay(confirmation.start_at)} at{' '}
                {formatTime(confirmation.start_at)}.
              </p>

              <div className="code-box">
                <span className="small muted">Booking code</span>
                <strong>{confirmation.code}</strong>
                <span className="small muted">Show this at the counter</span>
              </div>

              {confirmation.customer_code && (
                <p className="small muted">
                  Your customer code is{' '}
                  <strong className="flame-text">{confirmation.customer_code}</strong> — quote
                  it next time and we'll pull up your account.
                </p>
              )}

              <p className="muted">{confirmation.message}</p>
              <p className="lead">Amount due on arrival: <strong className="flame-text">{rupees(confirmation.amount_due)}</strong></p>

              <div className="row row--wrap" style={{ justifyContent: 'center', marginTop: '1.5rem' }}>
                <Link to="/my-booking" className="btn btn--ghost">Manage booking</Link>
                <Link to="/" className="btn">Back to home</Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
