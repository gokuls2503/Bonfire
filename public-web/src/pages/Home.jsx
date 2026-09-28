import { useLayoutEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSite } from '../lib/SiteContext'
import { rupees, duration, formatDateTime, timeUntil, timeLabel, whatsappHref } from '../lib/format'
import Icon from '../components/Icon'
import './home.css'

function Hero({ settings, stationTypes, isOpen }) {
  const totalStations = stationTypes.reduce((sum, t) => sum + t.station_count, 0)
  return (
    <section className="hero">
      <div className="flame-grid" />
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
  const trackRef = useRef(null)
  // Two copies is the minimum the -50% scroll needs, but two is only *enough*
  // when one copy is wider than the strip. With a handful of featured games it
  // is not, and the loop runs out mid-screen leaving a blank. So measure and
  // repeat until one half covers the strip; always an even count, because the
  // animation assumes the second half is identical to the first.
  const [copies, setCopies] = useState(2)

  useLayoutEffect(() => {
    const track = trackRef.current
    if (!track || !games.length) return undefined

    const fit = () => {
      const strip = track.parentElement.clientWidth
      const oneCopy = track.scrollWidth / copies
      if (!oneCopy || !strip) return
      const needed = Math.max(2, Math.ceil(strip / oneCopy) * 2)
      if (needed !== copies) setCopies(needed)
    }

    fit()
    // Re-fit on resize: a narrow copy that covered a phone will not cover a
    // desktop, and the gap would come back on rotation.
    const observer = new ResizeObserver(fit)
    observer.observe(track.parentElement)
    return () => observer.disconnect()
  }, [games, copies])

  if (!games.length) return null

  return (
    <div className="marquee" aria-hidden="true">
      <div className="marquee__track" ref={trackRef}>
        {Array.from({ length: copies }).flatMap((_, copy) =>
          games.map((g, i) => (
            <span key={`${copy}-${i}`}>
              {g.title}
              <i>◆</i>
            </span>
          )),
        )}
      </div>
    </div>
  )
}

const splitSpec = (text) =>
  (text || '').split('/').map((s) => s.trim()).filter(Boolean)

// Presentation only: sort each spec line into a row with a matching icon.
const SPEC_GROUPS = [
  { icon: 'monitor', test: /\b(hz|ips|oled|tv|monitor|display|screen)\b|"/i },
  { icon: 'keyboard', test: /\b(kb|keyboard|mouse|headset|controllers?|dualsense|pad|wheel)\b/i },
  { icon: 'chip', test: () => true },
]

function specRows(items) {
  const rows = SPEC_GROUPS.map((g) => ({ icon: g.icon, items: [] }))
  items.forEach((item) => {
    rows[SPEC_GROUPS.findIndex((g) => (typeof g.test === 'function' ? g.test(item) : g.test.test(item)))].items.push(item)
  })
  const order = ['chip', 'monitor', 'keyboard']
  return rows
    .filter((r) => r.items.length)
    .sort((a, b) => order.indexOf(a.icon) - order.indexOf(b.icon))
    .map((r) => ({
      icon: r.icon === 'keyboard' && r.items.some((i) => /controller|dualsense|pad/i.test(i)) ? 'gamepad' : r.icon,
      title: r.items.slice(0, 2).join(' / '),
      sub: r.items.slice(2).join(' / '),
    }))
}

// Built-in renders used until staff upload their own image in the admin.
const FALLBACK_ART = { monitor: '/stations/pc.jpg', gamepad: '/stations/ps5.jpg' }

// Split a tagline so its second half can take the flame gradient.
function Tagline({ text }) {
  const words = (text || '').replace(/\.$/, '').split(' ').filter(Boolean)
  if (!words.length) return null
  const cut = Math.ceil(words.length / 2)
  return (
    <p className="station-card__tagline">
      <span>{words.slice(0, cut).join(' ')}</span>{' '}
      <span className="flame-text">{words.slice(cut).join(' ')}.</span>
    </p>
  )
}

function StationTypes({ types }) {
  return (
    <section className="section stations-section" id="stations">
      <div className="stations-section__streaks" aria-hidden="true" />
      <div className="shell">
        <div className="section-head stations-section__head">
          <span className="eyebrow"><b>//</b> The setup</span>
          <h2>Pick your <span className="flame-text">weapon</span></h2>
          <p>
            Every seat is built to run modern titles without an apology. No shared GPUs,
            no 60Hz panels, no "it usually works".
          </p>
        </div>

        <div className="station-grid">
          {types.map((type) => {
            const station = type.stations?.[0]
            const specs = splitSpec(station?.specs)
            const peripherals = splitSpec(station?.peripherals).filter((p) => !specs.includes(p))
            const rows = specRows([...specs, ...peripherals])
            const free = type.stations?.filter((s) => s.status === 'available').length ?? 0
            const art = type.image || FALLBACK_ART[type.icon]
            // "From" has to quote the same money the rates page does. For a
            // console that is the cheapest per-controller rate, not plan.price,
            // which stops being the selling price once the grid takes over.
            const planPrice = (p) =>
              type.prices_per_controller
                ? Number(p.controller_rates?.[0]?.price_per_controller ?? p.price)
                : Number(p.price)
            const cheapest = [...(type.pricing_plans || [])]
              .sort((a, b) => planPrice(a) - planPrice(b))[0]

            return (
              <article key={type.id} className="station-card">
                <div className="station-card__frame">
                  <div className={`station-card__media ${art ? 'has-image' : ''}`}>
                    {art ? (
                      <img src={art} alt={type.name} loading="lazy" />
                    ) : (
                      <span className="station-card__hero-icon" aria-hidden="true">
                        <Icon name={type.icon} size={96} />
                      </span>
                    )}
                    <span className="station-card__plinth" aria-hidden="true" />
                  </div>

                  <div className="station-card__body">
                    <div className="station-card__head">
                      <span className="station-card__icon">
                        <Icon name={type.icon} size={24} />
                      </span>
                      <h3>{type.name}</h3>
                      <span className={`station-card__avail ${free ? '' : 'is-full'}`}>
                        {free} available
                      </span>
                    </div>

                    <Tagline text={type.short_description} />
                    <p className="station-card__desc">{type.description}</p>

                    {rows.length > 0 && (
                      <div className="station-card__specs">
                        <span className="station-card__label">Specifications</span>
                        <ul>
                          {rows.map((row) => (
                            <li key={row.title}>
                              <span className="station-card__spec-icon"><Icon name={row.icon} size={18} /></span>
                              <span>
                                <strong>{row.title}</strong>
                                {row.sub && <small>{row.sub}</small>}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {type.stations?.length > 0 && (
                      <div className="station-card__seats">
                        {type.stations.map((s) => (
                          <span key={s.id} className={`seat seat--${s.status}`} title={`${s.name} — ${s.status}`}>
                            {s.name}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="station-card__foot">
                      <div className="station-card__price">
                        <span>from</span>
                        <strong className="flame-text">
                          {rupees(cheapest ? planPrice(cheapest) : 0)}
                        </strong>
                        {cheapest && (
                          <span>
                            / {duration(cheapest.duration_minutes)}
                            {type.prices_per_controller && ' per controller'}
                          </span>
                        )}
                      </div>
                      <Link to={`/book?type=${type.id}`} className="station-card__cta">
                        <span>Book this</span> <Icon name="arrow" size={18} />
                      </Link>
                    </div>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
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
                  <span className="tag tag--flame">{t.game}</span>
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

// Genre -> tile colours for games without an uploaded cover.
const GENRE_HUES = {
  fps: ['#00c0f0', '#052a38'],
  'battle royale': ['#8b5cf6', '#221046'],
  sports: ['#22c55e', '#0a2c17'],
  fighting: ['#e11d48', '#3a0615'],
  racing: ['#3b82f6', '#0b1d45'],
  sandbox: ['#84cc16', '#1f2e06'],
  'open world': ['#14b8a6', '#062a26'],
  action: ['#f43f5e', '#2a0a12'],
}

const initials = (title) =>
  title.replace(/[^A-Za-z0-9 ]/g, ' ').split(' ').filter(Boolean)
    .filter((w) => !/^(of|the|and|a)$/i.test(w)).slice(0, 2).map((w) => w[0]).join('').toUpperCase()

function GameArt({ game }) {
  // Admin-uploaded cover first, then the bundled art in /public/games, then the initials tile.
  const [failed, setFailed] = useState(false)
  const src = game.cover || `/games/${game.slug}.jpg`
  if (!failed) return <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} />
  const [hue, deep] = GENRE_HUES[(game.genre || '').toLowerCase()] || ['#00a8f0', '#021826']
  return (
    <span className="game-tile__art" style={{ '--hue': hue, '--deep': deep }} aria-hidden="true">
      <b>{initials(game.title)}</b>
      <small>{game.genre}</small>
    </span>
  )
}

function Games({ games, types }) {
  if (!games.length) return null
  const iconFor = Object.fromEntries((types || []).map((t) => [t.id, t.icon]))
  return (
    <section className="section section--tight library-section">
      <div className="library-section__bg" aria-hidden="true">
        <Icon name="gamepad" size={520} />
      </div>
      <div className="shell">
        <div className="library-section__top">
          <div className="section-head library-section__head">
            <span className="eyebrow">Installed &amp; ready</span>
            <h2>The <span className="flame-text">library</span></h2>
            <p>Your favourite games, installed and ready to play. Walk in and pick one.</p>
          </div>
          <p className="library-section__motto" aria-hidden="true">Play<br />Connect<br />Compete</p>
        </div>

        <div className="game-grid">
          {games.map((g) => (
            <Link
              key={g.id}
              to={g.platforms?.length ? `/book?type=${g.platforms[0]}` : '/book'}
              className="game-tile"
              aria-label={`Book a seat for ${g.title}`}
            >
              <span className="game-tile__cover"><GameArt game={g} /></span>
              <span className="game-tile__info">
                <strong>{g.title}</strong>
                <span className="game-tile__platforms">
                  {g.platform_names.length
                    ? g.platform_names.map((name, i) => (
                        <span key={name}>
                          <Icon name={iconFor[g.platforms?.[i]] || 'monitor'} size={13} />
                          {name}
                        </span>
                      ))
                    : <span>{g.genre}</span>}
                </span>
              </span>
              <span className="game-tile__ready">
                <Icon name="check" size={11} /> Ready
              </span>
              <span className="game-tile__play" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="12" height="12"><path d="M8 5v14l11-7z" fill="currentColor" /></svg>
              </span>
            </Link>
          ))}
        </div>

        <div className="library-request">
          <span className="library-request__icon"><Icon name="gamepad" size={30} /></span>
          <div>
            <strong>Want something that isn't here?</strong>
            <span>Ask at the counter — we install on request.</span>
          </div>
          <Link to="/visit#contact" className="library-request__cta">
            <Icon name="arrow" size={14} /> Request a game
          </Link>
        </div>
      </div>
    </section>
  )
}

// Last word of the heading gets the big flame treatment ("... for / GAMERS").
function AboutHeading({ text }) {
  const words = (text || '').trim().split(' ')
  if (words.length < 2) return <h2>{text}</h2>
  return (
    <h2 className="about-heading">
      <span>{words.slice(0, -1).join(' ')}</span>
      <span className="about-heading__big flame-text">{words.at(-1)}</span>
    </h2>
  )
}

function About({ settings, gallery }) {
  // First gallery photo leads; the bundled render stands in until one is uploaded.
  const [lead, ...rest] = gallery
  const visual = lead?.image || '/about/room.jpg'
  return (
    <section className="section about-section">
      <div className="about-visual" aria-hidden={!lead}>
        <img src={visual} alt={lead?.caption || ''} loading="lazy" />
        <p className="about-visual__motto" aria-hidden="true">Play<br />Connect<br />Compete</p>
      </div>

      <div className="shell about-grid">
        <div className="about-copy">
          <span className="eyebrow">The place</span>
          <AboutHeading text={settings.about_heading} />
          {settings.about_body?.split(/\r?\n\r?\n/).map((para, i) => (
            <p key={i} className="about-copy__body">{para}</p>
          ))}
          <div className="perks">
            {[
              ['wifi', 'Fibre internet', 'Low ping, no throttle'],
              ['bolt', 'Power backup', 'A cut never ends your match'],
              ['users', 'Squad-friendly', 'Five rigs side by side'],
              ['clock', 'Open late', 'Weekend nights run past midnight'],
            ].map(([icon, title, sub]) => (
              <div key={title} className="perk">
                <span className="perk__icon"><Icon name={icon} size={22} /></span>
                <div>
                  <strong>{title}</strong>
                  <span>{sub}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {rest.length > 0 && (
          <div className="about-thumbs">
            {rest.slice(0, 4).map((img) => (
              <figure key={img.id}>
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

function FAQs({ faqs }) {
  if (!faqs.length) return null
  return (
    <section className="section" id="faq">
      <div className="shell faq-grid">
        <div className="section-head" style={{ marginBottom: 0 }}>
          <span className="eyebrow">Good to know</span>
          <h2>Questions, answered</h2>
          <p>Anything else, just call or drop us a message.</p>
          <div className="faq-visual" aria-hidden="true">
            <div className="faq-visual__stage">
              <span className="faq-visual__ghost g1">?</span>
              <span className="faq-visual__ghost g2">?</span>
              <span className="faq-visual__ghost g3">?</span>
              <span className="faq-visual__mark">?</span>
              <span className="faq-visual__plinth" />
            </div>
          </div>
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
              href={whatsappHref(settings.whatsapp)}
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
      <Tournaments tournaments={data.upcoming_tournaments} />
      <Games games={data.featured_games} types={types} />
      <About settings={s} gallery={data.gallery} />
      <FAQs faqs={data.faqs} />
      <CTA settings={s} />
    </>
  )
}
