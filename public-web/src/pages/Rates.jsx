import { Link } from 'react-router-dom'
import { useSite } from '../lib/SiteContext'
import { rupees, duration, timeLabel } from '../lib/format'
import Icon from '../components/Icon'
import './rates.css'

/** "30 days" is what the owner set; "a month" is what a customer reads. */
const term = (days) => {
  const d = Number(days || 0)
  if (d === 30 || d === 31) return 'a month'
  if (d === 90) return '3 months'
  if (d === 365) return 'a year'
  if (d === 7) return 'a week'
  return `${d} days`
}

/** What the member actually gets, in the order they care about it. */
function benefits(plan) {
  const out = []
  if (Number(plan.included_hours) > 0) {
    out.push(`${Number(plan.included_hours)} hours of play included`)
  }
  if (Number(plan.discount_percent) > 0) {
    out.push(`${Number(plan.discount_percent)}% off every session after that`)
  }
  return out.concat(plan.perks || [])
}

function Memberships({ plans }) {
  if (!plans?.length) return null

  return (
    <section className="memberships" id="memberships">
      <div className="row row--wrap" style={{ marginBottom: '1.5rem', alignItems: 'flex-end' }}>
        <span className="station-card__icon"><Icon name="flame" size={24} /></span>
        <div>
          <h2>Monthly memberships</h2>
          <p className="muted small" style={{ marginTop: '0.4rem' }}>
            For the regulars. Pay once a month, play cheaper all month.
          </p>
        </div>
      </div>

      <div className="grid grid--3">
        {plans.map((plan) => (
          <div key={plan.id} className={`card card--hover member-card ${plan.badge ? 'member-card--featured' : ''}`}>
            {plan.badge && <span className="tag tag--flame">{plan.badge}</span>}
            <h3 style={{ margin: '0.75rem 0 0.35rem' }}>{plan.name}</h3>
            {plan.description && <p className="small muted">{plan.description}</p>}

            <div className="member-card__price">
              {plan.compare_at_price && (
                <s className="muted small">{rupees(plan.compare_at_price)}</s>
              )}
              <div className="flame-text member-card__figure">{rupees(plan.price)}</div>
              <span className="small muted">for {term(plan.duration_days)}</span>
            </div>

            <ul className="perks">
              {benefits(plan).map((perk) => (
                <li key={perk}>
                  <Icon name="check" size={14} />
                  <span>{perk}</span>
                </li>
              ))}
            </ul>

            {plan.platforms?.length > 0 && (
              <p className="small muted member-card__platforms">
                Covers {plan.platforms.join(' and ')}
              </p>
            )}
          </div>
        ))}
      </div>

      <p className="small muted member-note">
        Memberships are set up at the counter — bring the phone number you book with and
        we will start your month on the spot. Hours reset each term, and the discount
        applies to the whole bill, including the second controller.
      </p>
    </section>
  )
}

export default function Rates() {
  const { data } = useSite()
  const types = data.station_types

  return (
    <>
      <header className="page-head">
        <div className="glow page-head__glow" />
        <div className="shell">
          <span className="eyebrow">Rates &amp; hardware</span>
          <h1>What it costs</h1>
          <p className="lead">
            PC rates are per station, per session. A PS5 is one screen a group shares,
            so it is priced per controller — the more of you play, the less each one
            costs. Pay at the counter, cash or UPI, nothing taken online.
          </p>
        </div>
      </header>

      <div className="shell section section--tight">
        {types.map((type) => (
          <section key={type.id} style={{ marginBottom: '4rem' }}>
            <div className="row row--wrap" style={{ marginBottom: '1.5rem', alignItems: 'flex-end' }}>
              <span className="station-card__icon"><Icon name={type.icon} size={24} /></span>
              <div>
                <h2>{type.name}</h2>
                <p className="muted small" style={{ marginTop: '0.4rem' }}>
                  {type.station_count} stations · {type.short_description}
                </p>
              </div>
              <span className="spacer" />
              <Link to={`/book?type=${type.id}`} className="btn btn--sm">Book {type.name}</Link>
            </div>

            <div className="grid grid--4">
              {type.pricing_plans.map((plan) => (
                <div key={plan.id} className={`card ${plan.badge ? 'card--hover' : ''}`}>
                  {plan.badge && <span className="tag tag--flame">{plan.badge}</span>}
                  <h3 style={{ margin: '0.75rem 0 0.35rem' }}>{plan.name}</h3>
                  <p className="small muted">{duration(plan.duration_minutes)}</p>
                  <div style={{ margin: '1rem 0 0.5rem' }}>
                    {plan.compare_at_price && <s className="muted small">{rupees(plan.compare_at_price)}</s>}
                    <div className="flame-text rate-figure">
                      {rupees(
                        type.prices_per_controller
                          ? plan.controller_rates?.[0]?.price_per_controller ?? plan.price
                          : plan.price,
                      )}
                    </div>
                    {type.prices_per_controller && (
                      <span className="small muted">per controller, on your own</span>
                    )}
                  </div>

                  {/* A console is one screen a group shares, so the honest
                      headline is what each controller costs at each group size,
                      not a single price that only applies to a solo player. */}
                  {type.prices_per_controller && plan.controller_rates?.length > 0 && (
                    <table className="rate-tiers">
                      <tbody>
                        {plan.controller_rates.map((r) => (
                          <tr key={r.id}>
                            <th>{r.controllers} {r.controllers === 1 ? 'player' : 'players'}</th>
                            <td><strong>{rupees(r.price_per_controller)}</strong> each</td>
                            <td className="muted">{rupees(r.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {plan.description && <p className="small muted">{plan.description}</p>}
                  {plan.available_from && (
                    <p className="small" style={{ color: 'var(--warn)' }}>
                      <Icon name="clock" size={13} style={{ verticalAlign: '-2px' }} />{' '}
                      {timeLabel(plan.available_from)} – {timeLabel(plan.available_to)}
                    </p>
                  )}
                  {/* Say it here rather than letting someone reach the booking
                      flow, look for this rate and not find it. */}
                  {plan.is_bookable === false && (
                    <p className="small muted">Walk in and ask for it — not bookable online.</p>
                  )}
                </div>
              ))}
            </div>

            {type.stations?.[0]?.specs && (
              <div className="card" style={{ marginTop: '1.5rem' }}>
                <span className="eyebrow" style={{ marginBottom: '0.75rem' }}>Hardware</span>
                <p style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: '0.95rem' }}>
                  {type.stations[0].specs}
                </p>
                {type.stations[0].peripherals && (
                  <p className="muted small">{type.stations[0].peripherals}</p>
                )}
                <div className="station-card__seats" style={{ marginTop: '1rem' }}>
                  {type.stations.map((s) => (
                    <span key={s.id} className={`seat seat--${s.status}`}>{s.name}</span>
                  ))}
                </div>
              </div>
            )}
          </section>
        ))}

        <Memberships plans={data.membership_plans} />

        <div className="card center">
          <h3>Booking a party or a private session?</h3>
          <p className="muted" style={{ margin: '0.75rem 0 1.25rem' }}>
            We take over the whole floor for birthdays, LAN nights and team events.
            Tell us the date and headcount.
          </p>
          <Link to="/visit#contact" className="btn">Get in touch</Link>
        </div>
      </div>
    </>
  )
}
