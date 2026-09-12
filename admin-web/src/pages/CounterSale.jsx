import { useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api'
import { rupees, formatDateTime } from '../lib/format'
import { Empty, Loading, PageHead, Pill, useToast } from '../components/ui'
import { ChangeDue, DiscountBlock, TenderBlock, useCheckout } from '../components/checkout'
import Icon from '../components/Icon'
import '../components/bill.css'
import '../components/payment.css'
import './counter.css'

export default function CounterSale() {
  const [shop, setShop] = useState(null)
  const [cart, setCart] = useState([])
  const [category, setCategory] = useState('')
  const [search, setSearch] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [recent, setRecent] = useState([])
  const toast = useToast()

  const load = async () => {
    const [menu, sales] = await Promise.all([
      api.get('/admin/shop/summary/'),
      api.get('/admin/counter-sales/?ordering=-created_at'),
    ])
    setShop(menu)
    setRecent((Array.isArray(sales) ? sales : sales.results || []).slice(0, 8))
  }

  useEffect(() => { load().catch((err) => toast(err.message, 'error')) }, [])

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

  /** How many of this product are already in the cart. */
  const inCart = (id) => cart.find((c) => c.product.id === id)?.quantity || 0

  const remaining = (product) => {
    if (!product.track_stock) return Infinity
    return (product.available_stock ?? 0) - inCart(product.id)
  }

  const add = (product) => {
    if (remaining(product) <= 0) return
    setCart((c) => {
      const existing = c.find((row) => row.product.id === product.id)
      if (existing) {
        return c.map((row) =>
          row.product.id === product.id ? { ...row, quantity: row.quantity + 1 } : row,
        )
      }
      return [...c, { product, quantity: 1 }]
    })
  }

  const setQuantity = (productId, quantity) => {
    setCart((c) =>
      quantity < 1
        ? c.filter((row) => row.product.id !== productId)
        : c.map((row) => (row.product.id === productId ? { ...row, quantity } : row)),
    )
  }

  const total = cart.reduce(
    (sum, row) => sum + Number(row.product.price) * row.quantity, 0,
  )
  const checkout = useCheckout(total)

  const submitSale = async () => {
    if (!cart.length) return
    setBusy(true)
    try {
      const sale = await api.post('/admin/shop/quick-sale/', {
        full_name: name.trim(),
        phone: phone.trim(),
        items: cart.map((row) => ({ product: row.product.id, quantity: row.quantity })),
        ...checkout.body(),
      })
      toast(`${sale.code} — ${checkout.summary()}`)
      setCart([])
      setName('')
      setPhone('')
      checkout.reset()
      await load()
    } catch (err) {
      toast(
        err.fields?.items || err.fields?.payments || err.fields?.discount_reason || err.message,
        'error',
      )
    } finally {
      setBusy(false)
    }
  }

  if (!shop) return <Loading rows={8} />

  return (
    <>
      <PageHead
        title="Counter sale"
        subtitle="Ring up a walk-in who isn't booking a station"
      />

      <div className="counter">
        <section className="counter__menu card">
          <div className="bill__menu-filters" style={{ marginBottom: '1rem' }}>
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

          <div className="menu-grid menu-grid--wide">
            {menu.map((p) => {
              const left = remaining(p)
              return (
                <button key={p.id} className={`menu-item ${left <= 0 ? 'is-out' : ''}`}
                  disabled={left <= 0} onClick={() => add(p)}>
                  <span className="menu-item__name">{p.name}</span>
                  <span className="menu-item__price">
                    {rupees(p.price)}{p.pricing_mode === 'hourly' && <em>/hr</em>}
                  </span>
                  <span className="menu-item__stock">
                    {!p.track_stock ? '—' : left <= 0 ? 'none left' : `${left} left`}
                  </span>
                </button>
              )
            })}
            {menu.length === 0 && <Empty>No items match.</Empty>}
          </div>
        </section>

        <section className="counter__cart card">
          <h3>This sale</h3>

          {cart.length === 0 ? (
            <Empty>Tap items to build the sale.</Empty>
          ) : (
            <div className="counter__lines">
              {cart.map((row) => (
                <div key={row.product.id} className="bill__line">
                  <div className="bill__line-main">
                    <strong>{row.product.name}</strong>
                    <div className="small muted">{rupees(row.product.price)} each</div>
                  </div>
                  <div className="qty">
                    <button type="button"
                      onClick={() => setQuantity(row.product.id, row.quantity - 1)}
                      aria-label={`Fewer ${row.product.name}`}>−</button>
                    <span>{row.quantity}</span>
                    <button type="button"
                      disabled={remaining(row.product) <= 0}
                      onClick={() => setQuantity(row.product.id, row.quantity + 1)}
                      aria-label={`More ${row.product.name}`}>+</button>
                  </div>
                  <strong className="bill__line-total">
                    {rupees(Number(row.product.price) * row.quantity)}
                  </strong>
                </div>
              ))}
            </div>
          )}

          <div className="counter__total">
            <span>{checkout.discount > 0 ? 'After discount' : 'Total'}</span>
            <strong>{rupees(checkout.net)}</strong>
          </div>
          {checkout.discount > 0 && (
            <span className="small" style={{ color: 'var(--warn)', marginTop: '-0.5rem' }}>
              was {rupees(total)}, less {rupees(checkout.discount)}
            </span>
          )}

          {cart.length > 0 && (
            <>
              <DiscountBlock checkout={checkout} />
              <TenderBlock checkout={checkout} compact />
              {checkout.tender === 'cash' && checkout.net > 0 && (
                <ChangeDue net={checkout.net} />
              )}
            </>
          )}

          <details className="counter__who">
            <summary>Attach to a customer (optional)</summary>
            <div className="field" style={{ marginTop: '0.75rem' }}>
              <label htmlFor="sale-name">Name</label>
              <input id="sale-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="sale-phone">Phone</label>
              <input id="sale-phone" type="tel" value={phone}
                onChange={(e) => setPhone(e.target.value)} />
              <span className="hint">
                Adds the spend to their record and gives them a customer code.
              </span>
            </div>
          </details>

          <button className="btn btn--block"
            disabled={busy || !cart.length || !checkout.canTender}
            onClick={submitSale}>
            {busy ? 'Saving…' : `Take ${rupees(checkout.net)}`}
          </button>
        </section>
      </div>

      <section className="card card--pad0" style={{ marginTop: '1rem' }}>
        <header className="card__head"><h3>Recent counter sales</h3></header>
        {recent.length === 0 ? (
          <Empty>No counter sales yet.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr><th>Ref</th><th>Items</th><th>Customer</th><th>Paid</th><th>When</th></tr>
              </thead>
              <tbody>
                {recent.map((s) => (
                  <tr key={s.id}>
                    <td className="mono">{s.code}</td>
                    <td className="small muted">
                      {s.items.map((i) => `${i.quantity}x ${i.name}`).join(', ')}
                    </td>
                    <td>{s.full_name || <span className="muted">Walk-in</span>}</td>
                    <td>
                      <strong>{rupees(s.amount_collected)}</strong>{' '}
                      <Pill tone={s.payment_method === 'cash' ? 'ok' : 'info'}>
                        {s.payment_method === 'cash' ? 'Cash' : (s.payment_method || '').toUpperCase()}
                      </Pill>
                    </td>
                    <td className="small muted nowrap">{formatDateTime(s.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}
