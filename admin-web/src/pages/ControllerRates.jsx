import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { rupees, duration } from '../lib/format'
import { Loading, Modal, useToast } from '../components/ui'

/**
 * The per-controller price grid for one console plan.
 *
 * A console is one screen a group shares, so the rate is set per controller and
 * normally falls as the group grows: each person pays less, the console earns
 * more. The totals column is what the customer actually compares, so it is
 * shown live as the rates are typed.
 */
export default function ControllerRates({ plan, maxControllers = 4, onClose, onSaved }) {
  const [rows, setRows] = useState(null)
  const [busy, setBusy] = useState(false)
  const toast = useToast()

  useEffect(() => {
    api.get(`/admin/controller-rates/?plan=${plan.id}`)
      .then((res) => {
        const existing = Array.isArray(res) ? res : res.results || []
        const byCount = Object.fromEntries(existing.map((r) => [r.controllers, r]))
        setRows(
          Array.from({ length: maxControllers }, (_, i) => {
            const n = i + 1
            return {
              controllers: n,
              id: byCount[n]?.id ?? null,
              price: byCount[n] ? String(byCount[n].price_per_controller) : '',
            }
          }),
        )
      })
      .catch((err) => toast(err.message, 'error'))
  }, [plan.id, maxControllers])

  const setPrice = (n) => (e) =>
    setRows((rs) => rs.map((r) => (r.controllers === n ? { ...r, price: e.target.value } : r)))

  const save = async (event) => {
    event.preventDefault()
    setBusy(true)
    try {
      for (const row of rows) {
        const value = row.price.trim()
        if (value === '') {
          // A blank row means "not sold at this group size", so remove it
          // rather than storing a zero that would read as free.
          if (row.id) await api.del(`/admin/controller-rates/${row.id}/`)
          continue
        }
        const body = {
          plan: plan.id,
          controllers: row.controllers,
          price_per_controller: value,
        }
        if (row.id) await api.patch(`/admin/controller-rates/${row.id}/`, body)
        else await api.post('/admin/controller-rates/', body)
      }
      toast(`${plan.name} rates saved`)
      onSaved()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={`Controller rates — ${plan.name}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn--ghost" onClick={onClose}>Cancel</button>
          <button className="btn" onClick={save} disabled={busy || !rows}>
            {busy ? 'Saving…' : 'Save rates'}
          </button>
        </>
      }
    >
      {!rows ? <Loading rows={4} /> : (
        <form onSubmit={save}>
          <p className="small muted" style={{ marginBottom: '1rem' }}>
            {duration(plan.duration_minutes)} on a {plan.station_type_name}. Set what
            <strong> each</strong> controller costs at that group size. Leave a row blank
            to stop selling it at that size.
          </p>
          <table className="data">
            <thead>
              <tr><th>Controllers</th><th>Price each (₹)</th><th>Group pays</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.controllers}>
                  <td><strong>{r.controllers}</strong></td>
                  <td>
                    <input
                      type="number" step="0.01" min="0" value={r.price}
                      onChange={setPrice(r.controllers)}
                      aria-label={`Price each for ${r.controllers} controllers`}
                      style={{ width: '120px' }}
                    />
                  </td>
                  <td className={Number(r.price) ? '' : 'muted'}>
                    {Number(r.price) ? rupees(Number(r.price) * r.controllers) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </form>
      )}
    </Modal>
  )
}
