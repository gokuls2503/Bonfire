import { useCallback, useState } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/auth'
import { ToastProvider } from './components/ui'
import Shell from './components/Shell'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Bookings from './pages/Bookings'
import Sales from './pages/Sales'
import Floor from './pages/Floor'
import Stations from './pages/Stations'
import Pricing from './pages/Pricing'
import Games from './pages/Games'
import Customers from './pages/Customers'
import Tournaments from './pages/Tournaments'
import Registrations from './pages/Registrations'
import Hours from './pages/Hours'
import Content from './pages/Content'
import Messages from './pages/Messages'

function NotFound() {
  return (
    <div className="empty" style={{ paddingTop: '5rem' }}>
      <h1 style={{ marginBottom: '0.75rem' }}>404</h1>
      <p>That admin page doesn't exist.</p>
    </div>
  )
}

function Console() {
  const [alerts, setAlerts] = useState({})

  const onDashboard = useCallback((data) => {
    setAlerts({
      '/bookings': data.attention.pending_bookings,
      '/messages': data.attention.unread_messages,
      '/registrations': data.attention.pending_registrations,
      '/stations': data.attention.stations_down,
    })
  }, [])

  return (
    <Shell alerts={alerts}>
      <Routes>
        <Route path="/" element={<Dashboard onData={onDashboard} />} />
        <Route path="/bookings" element={<Bookings />} />
        <Route path="/sales" element={<Sales />} />
        <Route path="/floor" element={<Floor />} />
        <Route path="/stations" element={<Stations />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/games" element={<Games />} />
        <Route path="/customers" element={<Customers />} />
        <Route path="/tournaments" element={<Tournaments />} />
        <Route path="/registrations" element={<Registrations />} />
        <Route path="/hours" element={<Hours />} />
        <Route path="/content" element={<Content />} />
        <Route path="/messages" element={<Messages />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Shell>
  )
}

function Gate() {
  const { user, ready } = useAuth()
  if (!ready) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }}>
        <div className="skeleton" style={{ width: 180, height: 18 }} />
      </div>
    )
  }
  return user ? <Console /> : <Login />
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <Gate />
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  )
}
