import { createContext, useContext, useEffect, useState } from 'react'
import { api } from './api'

const SiteContext = createContext(null)

export function SiteProvider({ children }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    api
      .bootstrap()
      .then((payload) => !cancelled && setData(payload))
      .catch((err) => !cancelled && setError(err))
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <SiteContext.Provider value={{ data, error, loading: !data && !error }}>
      {children}
    </SiteContext.Provider>
  )
}

export function useSite() {
  const ctx = useContext(SiteContext)
  if (!ctx) throw new Error('useSite must be used inside <SiteProvider>')
  return ctx
}
