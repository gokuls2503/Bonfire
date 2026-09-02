import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { api, tokens } from './api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [ready, setReady] = useState(false)

  const load = useCallback(async () => {
    if (!tokens.access) { setReady(true); return }
    try {
      setUser(await api.get('/admin/me/'))
    } catch {
      tokens.clear()
      setUser(null)
    } finally {
      setReady(true)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const signIn = async (username, password) => {
    await api.login(username, password)
    setUser(await api.get('/admin/me/'))
  }

  const signOut = () => {
    api.logout()
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, ready, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
