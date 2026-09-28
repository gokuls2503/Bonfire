import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import Icon from './Icon'
import './shell.css'

const NAV = [
  {
    section: 'Operations',
    items: [
      { to: '/', label: 'Dashboard', icon: 'bolt', end: true },
      { to: '/bookings', label: 'Bookings', icon: 'calendar' },
      { to: '/counter-sale', label: 'Counter sale', icon: 'ticket' },
      { to: '/sales', label: 'Sales', icon: 'flame' },
      { to: '/floor', label: 'Floor', icon: 'monitor' },
      { to: '/customers', label: 'Customers', icon: 'users' },
      { to: '/memberships', label: 'Memberships', icon: 'badge' },
    ],
  },
  {
    section: 'Events',
    items: [
      { to: '/tournaments', label: 'Tournaments', icon: 'trophy' },
      { to: '/registrations', label: 'Registrations', icon: 'ticket' },
    ],
  },
  {
    section: 'Setup',
    items: [
      { to: '/stations', label: 'Stations', icon: 'gamepad' },
      { to: '/products', label: 'Shop items', icon: 'star' },
      { to: '/pricing', label: 'Pricing', icon: 'bolt' },
      { to: '/membership-plans', label: 'Membership plans', icon: 'badge' },
      { to: '/hours', label: 'Hours & closures', icon: 'clock' },
      { to: '/games', label: 'Game library', icon: 'star' },
    ],
  },
  {
    section: 'Website',
    items: [
      { to: '/content', label: 'Site content', icon: 'flame' },
      { to: '/messages', label: 'Messages', icon: 'mail' },
    ],
  },
]

export default function Shell({ children, alerts }) {
  const { user, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const location = useLocation()

  useEffect(() => setOpen(false), [location.pathname])

  return (
    <div className="shell">
      <aside className={`sidebar ${open ? 'is-open' : ''}`}>
        <div className="sidebar__brand">
          <img src="/logo.png" alt="" />
          <div>
            <strong>Bonfire</strong>
            <span>Admin</span>
          </div>
        </div>

        <nav className="sidebar__nav">
          {NAV.map((group) => (
            <div key={group.section} className="sidebar__group">
              <span className="sidebar__label">{group.section}</span>
              {group.items.map((item) => {
                const badge = alerts?.[item.to]
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) => `sidebar__link ${isActive ? 'is-active' : ''}`}
                  >
                    <Icon name={item.icon} size={17} />
                    {item.label}
                    {badge > 0 && <span className="sidebar__badge">{badge}</span>}
                  </NavLink>
                )
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar__foot">
          <a
            href="http://localhost:5173"
            target="_blank"
            rel="noreferrer noopener"
            className="sidebar__link"
          >
            <Icon name="arrow" size={16} /> View public site
          </a>
          <div className="sidebar__user">
            <div className="sidebar__avatar">{(user?.full_name || '?')[0].toUpperCase()}</div>
            <div>
              <strong>{user?.full_name}</strong>
              <span className="small muted">{user?.is_superuser ? 'Owner' : 'Staff'}</span>
            </div>
            <button className="icon-btn" onClick={signOut} title="Sign out" aria-label="Sign out">
              <Icon name="close" size={16} />
            </button>
          </div>
        </div>
      </aside>

      {open && <div className="sidebar__scrim" onClick={() => setOpen(false)} />}

      <div className="shell__main">
        <header className="topbar">
          <button className="icon-btn topbar__burger" onClick={() => setOpen((v) => !v)} aria-label="Menu">
            <Icon name="menu" size={20} />
          </button>
          <span className="topbar__now">
            {new Date().toLocaleDateString('en-IN', {
              weekday: 'long', day: 'numeric', month: 'long',
            })}
          </span>
          <span className="spacer" />
        </header>
        <main className="shell__content">{children}</main>
      </div>
    </div>
  )
}
