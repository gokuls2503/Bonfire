import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { useSite } from '../lib/SiteContext'
import { timeLabel } from '../lib/format'
import Icon from './Icon'
import './layout.css'

const NAV = [
  { to: '/', label: 'Home', end: true },
  { to: '/rates', label: 'Rates' },
  { to: '/tournaments', label: 'Tournaments' },
  { to: '/visit', label: 'Visit' },
]

function Logo({ compact }) {
  const { data } = useSite()
  const logo = data?.settings?.logo
  return (
    <Link to="/" className="brand" aria-label="Bonfire Gaming Hub — home">
      <img src={logo || '/logo.png'} alt="" className="brand__mark" />
      {!compact && (
        <span className="brand__text">
          <strong>Bonfire</strong>
          <em>Gaming Hub</em>
        </span>
      )}
    </Link>
  )
}

export function Nav() {
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const { data } = useSite()
  const location = useLocation()

  useEffect(() => setOpen(false), [location.pathname])

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  const announcement = data?.settings?.announcement_is_active && data.settings.announcement

  return (
    <>
      {announcement && (
        <div className="announce">
          <div className="shell announce__inner">
            <Icon name="bolt" size={15} />
            <span>{announcement}</span>
          </div>
        </div>
      )}
      <header className={`nav ${scrolled ? 'nav--solid' : ''}`}>
        <div className="shell nav__inner">
          <Logo />
          <nav className="nav__links" aria-label="Primary">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => `nav__link ${isActive ? 'is-active' : ''}`}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="nav__actions">
            {data?.is_open_now !== undefined && (
              <span className={`status-dot ${data.is_open_now ? 'is-open' : ''}`}>
                <i />
                {data.is_open_now ? 'Open now' : 'Closed'}
              </span>
            )}
            <Link to="/book" className="btn btn--sm">Book a station</Link>
          </div>
          <button
            className="nav__burger"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
          >
            <Icon name={open ? 'close' : 'menu'} size={24} />
          </button>
        </div>
      </header>

      {open && (
        <div className="mobile-menu">
          <nav>
            {NAV.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end}>
                {item.label}
              </NavLink>
            ))}
            <NavLink to="/my-booking">My booking</NavLink>
          </nav>
          <Link to="/book" className="btn btn--block">Book a station</Link>
        </div>
      )}
    </>
  )
}

export function Footer() {
  const { data } = useSite()
  const s = data?.settings
  const hours = data?.business_hours || []
  const socials = [
    ['instagram', s?.instagram_url],
    ['youtube', s?.youtube_url],
    ['discord', s?.discord_url],
    ['x', s?.x_url],
  ].filter(([, url]) => url)

  return (
    <footer className="footer">
      <div className="shell footer__grid">
        <div className="footer__brand">
          <Logo />
          <p className="muted small">{s?.tagline}</p>
          {socials.length > 0 && (
            <div className="footer__socials">
              {socials.map(([name, url]) => (
                <a key={name} href={url} target="_blank" rel="noreferrer noopener" aria-label={name}>
                  <Icon name={name} size={18} />
                </a>
              ))}
            </div>
          )}
        </div>

        <div>
          <h4>Explore</h4>
          <ul>
            <li><Link to="/rates">Rates &amp; stations</Link></li>
            <li><Link to="/tournaments">Tournaments</Link></li>
            <li><Link to="/book">Book a slot</Link></li>
            <li><Link to="/my-booking">Find my booking</Link></li>
            <li><Link to="/visit">Visit us</Link></li>
          </ul>
        </div>

        <div>
          <h4>Hours</h4>
          <ul className="footer__hours">
            {hours.map((h) => (
              <li key={h.weekday}>
                <span>{h.weekday_display.slice(0, 3)}</span>
                <span className="muted">
                  {h.is_closed ? 'Closed' : `${timeLabel(h.opens_at)} – ${timeLabel(h.closes_at)}`}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h4>Find us</h4>
          <ul>
            {s?.full_address && <li className="muted">{s.full_address}</li>}
            {s?.phone && <li><a href={`tel:${s.phone}`}>{s.phone}</a></li>}
            {s?.email && <li><a href={`mailto:${s.email}`}>{s.email}</a></li>}
          </ul>
        </div>
      </div>
      <div className="shell footer__base">
        <span className="small muted">
          © {new Date().getFullYear()} {s?.brand_name || 'Bonfire Gaming Hub'}. All rights reserved.
        </span>
        <span className="small muted">Built for the squad.</span>
      </div>
    </footer>
  )
}
