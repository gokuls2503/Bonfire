import { useState } from 'react'
import { useAuth } from '../lib/auth'
import { ApiError } from '../lib/api'
import './login.css'

export default function Login() {
  const { signIn } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await signIn(username.trim(), password)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not sign in.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login">
      <div className="login__glow" />
      <form className="login__card" onSubmit={submit}>
        <img src="/logo.png" alt="Bonfire Gaming Hub" className="login__logo" />
        <h1>Staff sign in</h1>
        <p className="muted small">Bonfire Gaming Hub operations console.</p>

        {error && <div className="notice notice--error" style={{ marginTop: '1.25rem' }}>{error}</div>}

        <div className="field" style={{ marginTop: '1.5rem' }}>
          <label htmlFor="username">Username</label>
          <input
            id="username"
            type="text"
            autoComplete="username"
            required
            autoFocus
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <button className="btn btn--block" disabled={busy} style={{ marginTop: '0.5rem' }}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
