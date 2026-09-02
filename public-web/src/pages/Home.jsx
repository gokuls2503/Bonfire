import { Link } from 'react-router-dom'
import { useSite } from '../lib/SiteContext'
import { rupees, duration, formatDateTime, timeUntil, timeLabel } from '../lib/format'
import Icon from '../components/Icon'
import './home.css'

function Hero({ settings, stationTypes, isOpen }) {
  const totalStations = stationTypes.reduce((sum, t) => sum + t.station_count, 0)
  return (
    <section className="hero">
      <div className="ember-grid" />
      <div className="glow hero__glow-a" />
      <div className="glow hero__glow-b" />
      <div className="shell hero__inner">
        <div className="hero__copy reveal">
          {settings.hero_eyebrow && (
            <span className="hero__eyebrow">
              <i className={isOpen ? 'is-open' : ''} />
              {isOpen ? 'Open now — walk in or book ahead' : settings.hero_eyebrow}
            </span>
          )}
          <h1>
            {settings.hero_headline?.split(' ').map((word, i) => (
              <span key={i} className={i % 2 === 1 ? 'flame-text' : undefined}>
                {word}{' '}
              </span>
            ))}
          </h1>
          <p className="lead hero__sub">{settings.hero_subline}</p>
          <div className="row row--wrap hero__cta">
            <Link to="/book" className="btn">
              {settings.hero_cta_label || 'Book a station'}
              <Icon name="arrow" size={18} />
            </Link>
            <Link to="/tournaments" className="btn btn--ghost">
              <Icon name="trophy" size={18} />
              Weekly tournaments
            </Link>
          </div>
          <div className="hero__stats">
            <div><strong>{totalStations}</strong><span>Stations</span></div>
            <div><strong>{stationTypes.length}</strong><span>Platforms</span></div>
            <div><strong>Weekly</strong><span>Tournaments</span></div>
          </div>
        </div>

        <div className="hero__visual reveal" aria-hidden="true">
          <img src={settings.hero_image || settings.logo || '/logo.png'} alt="" />
          <div className="hero__visual-ring" />
        </div>
      </div>
    </section>
  )
}

function Marquee({ games }) {
  if (!games.length) return null
  const strip = [...games, ...games]
  return (
    <div className="marquee" aria-hidden="true">
      <div className="marquee__track">
        {strip.map((g, i) => (
          <span key={i}>
            {g.title}
            <i>◆</i>
          </span>
        ))}
      </div>
    </div>
  )
}

function StationTypes({ types }) {
  return (
    <section className="section" id="stations">
      <div className="shell">
        <div className="section-head">
          <span className="eyebrow">The setup</span>
          <h2>Pick your weapon</h2>
          <p>
            Every seat is built to run modern titles without an apology. No shared GPUs,
            no 60Hz panels, no "it usually works".
          </p>
        </div>

        <div className="grid grid--2">
          {types.map((type) => (
            <article key={type.id} className="station-card card card--hover">
              <div className="station-card__head">
                <span className="station-card__icon">
                  <Icon name={type.icon} size={26} />
                </span>
                <div>
                  <h3>{type.name}</h3>
                  <span className="tag tag--ember">
                    {type.station_count} available
                  </span>
                </div>
              </div>
              <p className="muted">{type.description || type.short_description}</p>

              {type.stations?.[0]?.specs && (
                <div className="station-card__specs">
                  <span className="small muted">Spec</span>
                  <p>{type.stations[0].specs}</p>
                  {type.stations[0].peripherals && (
                    <p className="small muted">{type.stations[0].peripherals}</p>
                  )}
                </div>
              )}

              <div className="station-card__seats">
                {type.stations?.map((s) => (
                  <span key={s.id} className={`seat seat--${s.status}`} title={`${s.name} — ${s.status}`}>
                    {s.name}
                  </span>
                ))}
              </div>

              <div className="station-card__foot">
                <span>
                  from <strong>{rupees(Math.min(...(type.pricing_plans.map((p) => Number(p.price)) || [0])))}</strong>
                </span>
                <Link to={`/book?type=${type.id}`} className="btn btn--sm">Book this</Link>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

function Pricing({ types }) {
  return (
    <section className="section pricing-section" id="rates">
      <div className="shell">
        <div className="section-head">
          <span className="eyebrow">Rates</span>
          <h2>Honest pricing</h2>
          <p>Pay at the counter. No membership fee, no surprise charges, no minimum spend.</p>
        </div>

        <div className="grid grid--2">
          {types.map((type) => (
            <div key={type.id} className="price-block">
              <div className="price-block__head">
                <Icon name={type.icon} size={20} />
                <h3>{type.name}</h3>
              </div>
              <ul className="price-list">
                {type.pricing_plans.map((plan) => (
                  <li key={plan.id} className={plan.badge ? 'is-highlight' : ''}>
                    <div>
                      <strong>{plan.name}</strong>
                      {plan.badge && <span className="tag tag--ember">{plan.badge}</span>}
                      {plan.description && <p className="small muted">{plan.description}</p>}
                    </div>
                    <div className="price-list__amount">
                      {plan.compare_at_price && (
                        <s className="small muted">{rupees(plan.compare_at_price)}</s>
                      )}
                      <strong>{rupees(plan.price)}</strong>
                      <span className="small muted">{duration(plan.duration_minutes)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="center muted small pricing-note">
          Rates are per station. PS5 sessions cover up to 2 players on one screen.
        </p>
      </div>
    </section>
  )
}

function Tournaments({ tournaments }) {
  if (!tournaments.length) return null
  return (
    <section className="section tournaments-section">
      <div className="shell">
        <div className="section-head row" style={{ maxWidth: 'none', alignItems: 'flex-end' }}>
          <div style={{ maxWidth: 640 }}>
            <span className="eyebrow">Every week</span>
            <h2>Something to win</h2>
            <p>
              Real brackets, real prize pools, real bragging rights. Register online,
              show up 20 minutes early, bring your A-game.
            </p>
          </div>
          <div className="spacer" />
          <Link to="/tournaments" className="btn btn--ghost btn--sm">See all</Link>
        </div>

        <div className="grid grid--3">
          {tournaments.slice(0, 3).map((t) => (
            <article key={t.id} className="tourney-card card card--hover">
              {t.banner ? (
                <img src={t.banner} alt="" className="tourney-card__banner" />
              ) : (
                <div className="tourney-card__banner tourney-card__banner--fallback">
                  <Icon name="trophy" size={38} />
                </div>
              )}
              <div className="tourney-card__body">
                <div className="row row--wrap" style={{ gap: '0.5rem' }}>
                  <span className="tag tag--ember">{t.game}</span>
                  {t.team_size > 1 && <span className="tag">{t.team_size}v{t.team_size}</span>}
                </div>
                <h3>{t.title}</h3>
                <p className="small muted">{t.tagline}</p>
                <dl className="tourney-card__meta">
                  <div>
                    <dt>When</dt>
                    <dd>{formatDateTime(t.starts_at)}</dd>
                  </div>
                  <div>
                    <dt>Prize pool</dt>
                    <dd className="flame-text">{rupees(t.prize_pool)}</dd>
                  </div>
                  <div>
                    <dt>Entry</dt>
                    <dd>{Number(t.entry_fee) ? rupees(t.entry_fee) : 'Free'}</dd>
                  </div>
                  <div>
                    <dt>Slots</dt>
                    <dd>{t.slots_left} of {t.max_teams} left</dd>
                  </div>
                </dl>
                <Link to={`/tournaments/${t.slug}`} className="btn btn--sm btn--block">
                  {t.is_registration_open ? 'Register' : 'Details'}
                </Link>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

function Games({ games }) {
  if (!games.length) return null
  return (
    <section className="section section--tight">
      <div className="shell">
        <div className="section-head">
          <span className="eyebrow">Installed &amp; ready</span>
          <h2>The library</h2>
        </div>
        <div className="game-grid">
          {games.map((g) => (
            <div key={g.id} className={`game-chip ${g.is_featured ? 'is-featured' : ''}`}>
              {g.cover && <img src={g.cover} alt="" />}
              <div>
                <strong>{g.title}</strong>
                <span className="small muted">{g.platform_names.join(' · ') || g.genre}</span>
              </div>
            </div>
          ))}
        </div>
        <p className="muted small" style={{ marginTop: '1.5rem' }}>
          Want something that isn't here? Ask at the counter — we install on request.
        </p>
      </div>
    </section>
  )
}

function About({ settings, gallery }) {
  return (
    <section className="section about-section">
      <div className="shell about-grid">
        <div>
          <span className="eyebrow">The place</span>
          <h2>{settings.about_heading}</h2>
          {settings.about_body?.split('\n\n').map((para, i) => (
            <p key={i} className="lead" style={{ marginTop: '1.25rem' }}>{para}</p>
          ))}
          <div className="perks">
            {[
              ['wifi', 'Fibre internet', 'Low ping, no throttle'],
              ['bolt', 'Power backup', 'A cut never ends your match'],
              ['users', 'Squad-friendly', 'Five rigs side by side'],
              ['clock', 'Open late', 'Weekend nights run past midnight'],
            ].map(([icon, title, sub]) => (
              <div key={title} className="perk">
                <Icon name={icon} size={18} />
                <div>
                  <strong>{title}</strong>
                  <span className="small muted">{sub}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
        {gallery.length > 0 && (
          <div className="about-gallery">
            {gallery.slice(0, 5).map((img, i) => (
              <figure key={img.id} className={`about-gallery__item i${i}`}>
                <img src={img.image} alt={img.caption || ''} loading="lazy" />
                {img.caption && <figcaption>{img.caption}</figcaption>}
              </figure>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

function Testimonials({ items }) {
  if (!items.length) return null
  return (
    <section className="section section--tight">
      <div className="shell">
        <div className="section-head">
          <span className="eyebrow">Word of mouth</span>
          <h2>What the regulars say</h2>
        </div>
        <div className="grid grid--3">
          {items.map((t) => (
            <blockquote key={t.id} className="quote card">
              <div className="quote__stars" aria-label={`${t.rating} out of 5`}>
                {Array.from({ length: t.rating }).map((_, i) => (
                  <Icon key={i} name="star" size={15} />
                ))}
              </div>
              <p>“{t.quote}”</p>
              <footer>
                {t.avatar && <img src={t.avatar} alt="" />}
                <div>
                  <strong>{t.name}</strong>
                  {t.handle && <span className="small muted">{t.handle}</span>}
                </div>
              </footer>
            </blockquote>
          ))}
        </div>
      </div>
    </section>
  )
}

function FAQs({ faqs }) {
  if (!faqs.length) return null
  return (
    <section className="section" id="faq">
      <div className="shell faq-grid">
        <div className="section-head" style={{ marginBottom: 0 }}>
          <span className="eyebrow">Good to know</span>
          <h2>Questions, answered</h2>
          <p>Anything else, just call or drop us a message.</p>
        </div>
        <div className="faq-list">
          {faqs.map((f) => (
            <details key={f.id}>
              <summary>
                {f.question}
                <Icon name="arrow" size={17} />
              </summary>
              <p>{f.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}

function CTA({ settings }) {
  return (
    <section className="cta">
      <div className="glow cta__glow" />
      <div className="shell cta__inner">
        <h2>Grab a seat before the squad does</h2>
        <p className="lead">{settings.booking_note}</p>
        <div className="row row--wrap" style={{ justifyContent: 'center' }}>
          <Link to="/book" className="btn">Book a station</Link>
          {settings.whatsapp && (
            <a
              className="btn btn--ghost"
              href={`https://wa.me/${settings.whatsapp.replace(/\D/g, '')}`}
              target="_blank"
              rel="noreferrer noopener"
            >
              <Icon name="phone" size={17} />
              WhatsApp us
            </a>
          )}
        </div>
      </div>
    </section>
  )
}

export default function Home() {
  const { data } = useSite()
  const s = data.settings
  const types = data.station_types

  return (
    <>
      <Hero settings={s} stationTypes={types} isOpen={data.is_open_now} />
      <Marquee games={data.featured_games.filter((g) => g.is_featured)} />
      <StationTypes types={types} />
      <Pricing types={types} />
      <Tournaments tournaments={data.upcoming_tournaments} />
      <Games games={data.featured_games} />
      <About settings={s} gallery={data.gallery} />
      <Testimonials items={data.testimonials} />
      <FAQs faqs={data.faqs} />
      <CTA settings={s} />
    </>
  )
}
