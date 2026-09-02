import { useCallback, useEffect, useState } from 'react'
import { api, rows as unwrap, count as unwrapCount } from './api'

/** Standard list/refresh wrapper for the admin's DRF collections. */
export function useResource(path, { auto = true } = {}) {
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(auto)
  const [error, setError] = useState(null)

  const load = useCallback(
    async (query = '') => {
      setLoading(true)
      setError(null)
      try {
        const res = await api.get(`${path}${query}`)
        setItems(unwrap(res))
        setTotal(unwrapCount(res))
      } catch (err) {
        setError(err.message)
        setItems([])
      } finally {
        setLoading(false)
      }
    },
    [path],
  )

  useEffect(() => { if (auto) load() }, [auto, load])

  return { items, total, loading, error, load, setItems }
}
