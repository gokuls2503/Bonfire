import { Link } from 'react-router-dom'
import { useSite } from '../lib/SiteContext'
import { rupees, duration, timeLabel } from '../lib/format'
import Icon from '../components/Icon'

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
            Every rate is per station, per session. Pay at the counter — cash or UPI,
            nothing taken online.
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
                  {plan.badge && <span className="tag tag--ember">{plan.badge}</span>}
                  <h3 style={{ margin: '0.75rem 0 0.35rem' }}>{plan.name}</h3>
                  <p className="small muted">{duration(plan.duration_minutes)}</p>
                  <div style={{ margin: '1rem 0 0.5rem' }}>
                    {plan.compare_at_price && <s className="muted small">{rupees(plan.compare_at_price)}</s>}
                    <div className="flame-text" style={{ fontFamily: 'var(--font-display)', fontSize: '2.4rem', lineHeight: 1 }}>
                      {rupees(plan.price)}
                    </div>
                  </div>
                  {plan.description && <p className="small muted">{plan.description}</p>}
                  {plan.available_from && (
                    <p className="small" style={{ color: 'var(--warn)' }}>
                      <Icon name="clock" size={13} style={{ verticalAlign: '-2px' }} />{' '}
                      {timeLabel(plan.available_from)} – {timeLabel(plan.available_to)}
                    </p>
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
