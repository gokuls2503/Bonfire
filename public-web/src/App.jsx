import { useEffect } from 'react'
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom'
import { SiteProvider, useSite } from './lib/SiteContext'
import { Footer, Nav } from './components/Layout'
import Home from './pages/Home'
import Book from './pages/Book'
import Rates from './pages/Rates'
import Tournaments from './pages/Tournaments'
import TournamentDetail from './pages/TournamentDetail'
import Visit from './pages/Visit'
import MyBooking from './pages/MyBooking'
import NotFound from './pages/NotFound'

function ScrollToTop() {
  const { pathname, hash } = useLocation()
  useEffect(() => {
    if (hash) {
      document.querySelector(hash)?.scrollIntoView({ behavior: 'smooth' })
      return
    }
    window.scrollTo(0, 0)
  }, [pathname, hash])
  return null
}

function Head() {
  const { data } = useSite()
  useEffect(() => {
    if (!data?.settings) return
    const s = data.settings
    document.title = s.seo_title || `${s.brand_name} | ${s.tagline}`
    const setMeta = (name, content, attr = 'name') => {
      if (!content) return
      let tag = document.querySelector(`meta[${attr}="${name}"]`)
      if (!tag) {
        tag = document.createElement('meta')
        tag.setAttribute(attr, name)
        document.head.appendChild(tag)
      }
      tag.setAttribute('content', content)
    }
    setMeta('description', s.seo_description)
    setMeta('og:title', s.seo_title || s.brand_name, 'property')
    setMeta('og:description', s.seo_description, 'property')
    setMeta('og:image', s.og_image || s.logo, 'property')
    setMeta('og:type', 'website', 'property')
    setMeta('theme-color', '#08080a')
    if (s.favicon) {
      let link = document.querySelector('link[rel="icon"]')
      if (!link) {
        link = document.createElement('link')
        link.rel = 'icon'
        document.head.appendChild(link)
      }
      link.href = s.favicon
    }
  }, [data])
  return null
}

function Shell() {
  const { data, error, loading } = useSite()

  if (loading) {
    return (
      <div className="loader">
        <div className="loader__flame" />
        <p className="muted small">Stoking the fire…</p>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="loader">
        <h2>Site is warming up</h2>
        <p className="muted" style={{ maxWidth: '40ch', textAlign: 'center' }}>
          We couldn't reach the server. Refresh in a moment, or call us to book.
        </p>
        <button className="btn" onClick={() => window.location.reload()}>Retry</button>
      </div>
    )
  }

  return (
    <>
      <Head />
      <Nav />
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/book" element={<Book />} />
          <Route path="/rates" element={<Rates />} />
          <Route path="/tournaments" element={<Tournaments />} />
          <Route path="/tournaments/:slug" element={<TournamentDetail />} />
          <Route path="/visit" element={<Visit />} />
          <Route path="/my-booking" element={<MyBooking />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <Footer />
    </>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <SiteProvider>
        <ScrollToTop />
        <Shell />
      </SiteProvider>
    </BrowserRouter>
  )
}
