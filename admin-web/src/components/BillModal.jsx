import { useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api'
import { rupees } from '../lib/format'
import Icon from './Icon'
import { Empty, Loading, Modal, Pill, useToast } from './ui'
import './bill.css'

/**
 * The running bill for one session: station time plus anything added to it.
 *
 * Rentals are held while the bill is open and released automatically when the
 * session is closed out, so the availability shown here is live.
 */
export default function BillModal({ booking, onClose, onChanged }) {
  const [items, setItems] = useState(null)
  const [shop, setShop] = useState(null)
  const [category, setCategory] = useState('')
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(null)
  const toast = useToast()

  const load = async () => {
    const [lines, menu] = await Promise.all([
      api.get(`/admin/bill-items/?booking=${booking.id}`),
      api.get('/admin/shop/summary/'),
    ])
    setItems(Array.isArray(lines) ? lines : lines.results || [])
    setShop(menu)
  }

  useEffect(() => {
    load().catch((err) => toast(err.message, 'error'))
  }, [booking.id])

  const add = async (product) => {
    setBusy(`add-${product.id}`)
    try {
      await api.post('/admin/bill-items/', {
        booking: booking.id, product: product.id, quantity: 1,
      })
      await load()
      onChanged?.()
    } catch (err) {
      toast(err.fields?.quantity || err.message, 'error')
    } finally {
      setBusy(null)
    }
  }

  const setQuantity = async (item, quantity) => {
    setBusy(`qty-${item.id}`)
    try {
      if (quantity < 1) {
        await api.del(`/admin/bill-items/${item.id}/`)
      } else {
        await api.patch(`/admin/bill-items/${item.id}/`, { quantity })
      }
      await load()
      onChanged?.()
    } catch (err) {
      toast(err.fields?.quantity || err.message, 'error')
    } finally {
      setBusy(null)
    }
  }

  const returnEarly = async (item) => {
    setBusy(`ret-${item.id}`)
    try {
      await api.post(`/admin/bill-items/${item.id}/mark_returned/`, {})
      toast(`${item.name} returned`)
      await load()
      onChanged?.()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setBusy(null)
    }
  }

  const itemsTotal = (items || []).reduce((sum, i) => sum + Number(i.line_total), 0)
  const stationCharge = Number(booking.amount_due || 0)

  const menu = useMemo(() => {
    if (!shop) return []
    const term = search.trim().toLowerCase()
    return shop.products.filter((p) => {
      if (!p.is_active) return false
      if (category && String(p.category) !== String(category)) return false
      if (term && !p.name.toLowerCase().includes(term)) return false
      return true
    })
  }, [shop, category, search])

  const soldOut = (p) => p.track_stock && p.available_stock <= 0

  return (
    <Modal
      title={`Bill — ${booking.code}`}
      onClose={onClose}
      wide
      footer={
        <>
          <div className="bill-total">
            <span className="small muted">Total</span>
            <strong>{rupees(stationCharge + itemsTotal)}</strong>
          </div>
          <span className="spacer" />
          <button className="btn" onClick={onClose}>Done</button>
        </>
      }
    >
      {items === null || shop === null ? <Loading rows={5} /> : (
        <div className="bill">
          <section className="bill__lines">
            <div className="bill__line bill__line--station">
              <div>
                <strong>{booking.station_type_name}</strong>
                <div className="small muted">
                  Station time{booking.seats > 1 ? ` × ${booking.seats}` : ''}
                  {booking.duration_minutes ? ` · ${booking.duration_minutes} min` : ''}
                </div>
              </div>
              <span className="spacer" />
              <strong>{rupees(stationCharge)}</strong>
            </div>

            {items.length === 0 ? (
              <Empty>Nothing added yet. Pick from the menu on the right.</Empty>
            ) : (
              items.map((item) => (
                <div key={item.id} className="bill__line">
                  <div className="bill__line-main">
                    <strong>{item.name}</strong>
                    <div className="small muted">
                      {rupees(item.unit_price)}
                      {item.pricing_mode === 'hourly' && ` × ${item.hours}h`}
                      {item.kind === 'rental' && (
                        item.is_out
                          ? <> · <span className="warn">out</span></>
                          : <> · <span className="ok">returned</span></>
                      )}
                    </div>
                  </div>

                  <div className="qty">
                    <button type="button" disabled={busy === `qty-${item.id}`}
                      onClick={() => setQuantity(item, item.quantity - 1)}
                      aria-label={`Fewer ${item.name}`}>−</button>
                    <span>{item.quantity}</span>
                    <button type="button" disabled={busy === `qty-${item.id}`}
                      onClick={() => setQuantity(item, item.quantity + 1)}
                      aria-label={`More ${item.name}`}>+</button>
                  </div>

                  <strong className="bill__line-total">{rupees(item.line_total)}</strong>

                  {item.is_out && (
                    <button className="btn btn--ghost btn--sm" disabled={busy === `ret-${item.id}`}
                      onClick={() => returnEarly(item)}>Return</button>
                  )}
                </div>
              ))
            )}

            <div className="bill__summary">
              <div><span>Station</span><span>{rupees(stationCharge)}</span></div>
              <div><span>Items</span><span>{rupees(itemsTotal)}</span></div>
              <div className="bill__summary-total">
                <span>Total due</span><span>{rupees(stationCharge + itemsTotal)}</span>
              </div>
            </div>
          </section>

          <section className="bill__menu">
            <div className="bill__menu-filters">
              <input type="search" placeholder="Search the menu…" value={search}
                onChange={(e) => setSearch(e.target.value)} aria-label="Search the menu" />
              <div className="seg" style={{ flexWrap: 'wrap' }}>
                <button className={category === '' ? 'is-active' : ''}
                  onClick={() => setCategory('')}>All</button>
                {shop.categories.map((c) => (
                  <button key={c.id} className={String(category) === String(c.id) ? 'is-active' : ''}
                    onClick={() => setCategory(c.id)}>{c.name}</button>
                ))}
              </div>
            </div>

            <div className="menu-grid">
              {menu.map((p) => (
                <button
                  key={p.id}
                  className={`menu-item ${soldOut(p) ? 'is-out' : ''}`}
                  disabled={soldOut(p) || busy === `add-${p.id}`}
                  onClick={() => add(p)}
                  title={soldOut(p) ? 'None left' : `Add ${p.name}`}
                >
                  <span className="menu-item__name">{p.name}</span>
                  <span className="menu-item__price">
                    {rupees(p.price)}{p.pricing_mode === 'hourly' && <em>/hr</em>}
                  </span>
                  <span className="menu-item__stock">
                    {!p.track_stock
                      ? '—'
                      : soldOut(p)
                        ? 'none left'
                        : p.kind === 'rental'
                          ? `${p.available_stock} free`
                          : `${p.stock_quantity} left`}
                  </span>
                </button>
              ))}
              {menu.length === 0 && <Empty>No items match.</Empty>}
            </div>
          </section>
        </div>
      )}
    </Modal>
  )
}
