import { useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api'
import { useResource } from '../lib/useResource'
import { rupees, formatDateTime } from '../lib/format'
import {
  Checkbox, ConfirmModal, Empty, Input, Loading, Modal, PageHead, Pill,
  Select, Textarea, useToast,
} from '../components/ui'
import Icon from '../components/Icon'
import './products.css'

const KINDS = [
  { value: 'consumable', label: 'Consumable (snacks, drinks)' },
  { value: 'rental', label: 'Rental (kit that comes back)' },
]

const REASONS = [
  { value: 'restock', label: 'Restocked' },
  { value: 'correction', label: 'Count correction' },
  { value: 'damage', label: 'Damaged or lost' },
  { value: 'return', label: 'Returned to supplier' },
]

const ICONS = ['star', 'flame', 'gamepad', 'monitor', 'wheel', 'vr', 'headset', 'bolt']

function ProductForm({ item, categories, onSaved, onClose }) {
  const editing = Boolean(item)
  const [form, setForm] = useState({
    name: item?.name || '',
    sku: item?.sku || '',
    category: item?.category || categories[0]?.id || '',
    kind: item?.kind || 'consumable',
    pricing_mode: item?.pricing_mode || 'flat',
    price: item?.price ?? '',
    description: item?.description || '',
    track_stock: item?.track_stock ?? true,
    stock_quantity: item?.stock_quantity ?? 0,
    low_stock_threshold: item?.low_stock_threshold ?? 5,
    sort_order: item?.sort_order ?? 0,
    is_active: item?.is_active ?? true,
    image: null,
  })
  const [errors, setErrors] = useState({})
  const [banner, setBanner] = useState(null)
  const [busy, setBusy] = useState(false)
  const toast = useToast()

  const set = (key) => (e) =>
    setForm((f) => {
      const value =
        e.target.type === 'checkbox' ? e.target.checked
        : e.target.type === 'file' ? e.target.files[0]
        : e.target.value
      const next = { ...f, [key]: value }
      // A consumable is never billed by the hour — the API rejects it.
      if (key === 'kind' && value === 'consumable') next.pricing_mode = 'flat'
      return next
    })

  const submit = async (event) => {
    event.preventDefault()
    setBusy(true)
    setBanner(null)
    setErrors({})
    try {
      const body = new FormData()
      for (const [key, value] of Object.entries(form)) {
        if (key === 'image') {
          if (value instanceof File) body.append('image', value)
          continue
        }
        body.append(key, typeof value === 'boolean' ? String(value) : value)
      }
      if (editing) await api.upload(`/admin/products/${item.id}/`, body, 'PATCH')
      else await api.upload('/admin/products/', body, 'POST')
      toast(editing ? 'Item updated' : 'Item added')
      onSaved()
    } catch (err) {
      setErrors(err.fields || {})
      setBanner(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={editing ? `Edit ${item.name}` : 'Add an item'}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn--ghost" onClick={onClose}>Cancel</button>
          <button className="btn" onClick={submit} disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <form onSubmit={submit}>
        {banner && <div className="notice notice--error">{banner}</div>}

        <div className="field-grid">
          <Input label="Name" name="name" required value={form.name}
            onChange={set('name')} error={errors.name} />
          <Select label="Category" name="category" value={form.category}
            onChange={set('category')} error={errors.category}
            options={categories.map((c) => ({ value: c.id, label: c.name }))} />
        </div>

        <div className="field-grid">
          <Select label="Type" name="kind" value={form.kind} onChange={set('kind')}
            options={KINDS} error={errors.kind} />
          <Select label="Charged" name="pricing_mode" value={form.pricing_mode}
            onChange={set('pricing_mode')} error={errors.pricing_mode}
            options={
              form.kind === 'consumable'
                ? [{ value: 'flat', label: 'Flat charge' }]
                : [
                    { value: 'flat', label: 'Flat charge' },
                    { value: 'hourly', label: 'Per hour of the session' },
                  ]
            }
            hint={form.pricing_mode === 'hourly'
              ? 'Multiplied by the length of the session it joins.'
              : undefined} />
        </div>

        <div className="field-grid">
          <Input label="Price (₹)" name="price" type="number" step="0.01" min="0" required
            value={form.price} onChange={set('price')} error={errors.price}
            hint={form.pricing_mode === 'hourly' ? 'Per hour' : 'Per unit'} />
          <Input label="Shelf / barcode label" name="sku" value={form.sku}
            onChange={set('sku')} hint="Optional." />
        </div>

        <Input label="Description" name="description" value={form.description}
          onChange={set('description')} />

        <div className="field">
          <label htmlFor="product-image">Photo</label>
          <input id="product-image" type="file" accept="image/*" onChange={set('image')} />
          <span className="hint">Optional. Shows on the counter screen.</span>
        </div>

        <hr style={{ border: 0, borderTop: '1px solid var(--ink-600)', margin: '1.25rem 0' }} />

        <Checkbox label="Track stock for this item" name="track_stock"
          checked={form.track_stock} onChange={set('track_stock')} />
        {form.track_stock && (
          <div className="field-grid">
            <Input
              label={form.kind === 'rental' ? 'Units owned' : 'Units in stock'}
              name="stock_quantity" type="number" required
              value={form.stock_quantity} onChange={set('stock_quantity')}
              error={errors.stock_quantity}
              hint={form.kind === 'rental'
                ? 'How many you own in total. Availability is worked out live.'
                : 'Use the Stock button later rather than editing this.'} />
            <Input label="Warn at or below" name="low_stock_threshold" type="number" min="0"
              value={form.low_stock_threshold} onChange={set('low_stock_threshold')} />
          </div>
        )}

        <div className="field-grid">
          <Input label="Sort order" name="sort_order" type="number"
            value={form.sort_order} onChange={set('sort_order')} />
        </div>
        <Checkbox label="Available at the counter" name="is_active"
          checked={form.is_active} onChange={set('is_active')} />
      </form>
    </Modal>
  )
}

function StockModal({ product, onSaved, onClose }) {
  const [change, setChange] = useState('')
  const [reason, setReason] = useState('restock')
  const [note, setNote] = useState('')
  const [movements, setMovements] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const toast = useToast()

  useEffect(() => {
    api.get(`/admin/products/${product.id}/movements/`).then(setMovements).catch(() => setMovements([]))
  }, [product.id])

  const submit = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.post(`/admin/products/${product.id}/adjust_stock/`, {
        change: Number(change), reason, note,
      })
      toast(`${product.name} stock ${Number(change) > 0 ? 'increased' : 'reduced'}`)
      onSaved()
    } catch (err) {
      setError(err.fields?.change || err.fields?.reason || err.message)
    } finally {
      setBusy(false)
    }
  }

  const preview = Number(product.stock_quantity) + (Number(change) || 0)

  return (
    <Modal
      title={`Stock — ${product.name}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn--ghost" onClick={onClose}>Close</button>
          <button className="btn" onClick={submit} disabled={busy || !change}>
            {busy ? 'Saving…' : 'Apply change'}
          </button>
        </>
      }
    >
      <form onSubmit={submit}>
        {error && <div className="notice notice--error">{error}</div>}

        <div className="stock-now">
          <div>
            <span className="small muted">{product.kind === 'rental' ? 'Owned' : 'In stock'}</span>
            <strong>{product.stock_quantity}</strong>
          </div>
          {product.kind === 'rental' && (
            <>
              <div>
                <span className="small muted">Out now</span>
                <strong className="warn">{product.units_out}</strong>
              </div>
              <div>
                <span className="small muted">Free</span>
                <strong className="ok">{product.available_stock}</strong>
              </div>
            </>
          )}
          {change !== '' && (
            <div>
              <span className="small muted">After this change</span>
              <strong className="ember">{preview}</strong>
            </div>
          )}
        </div>

        <div className="quick-adjust">
          {[+12, +24, -1, -5].map((n) => (
            <button key={n} type="button" className="btn btn--ghost btn--sm"
              onClick={() => setChange(String(n))}>
              {n > 0 ? `+${n}` : n}
            </button>
          ))}
        </div>

        <Input label="Change" name="change" type="number" required value={change}
          onChange={(e) => setChange(e.target.value)}
          hint="Positive to add, negative to remove. e.g. 24 or -3" />
        <Select label="Reason" name="reason" value={reason}
          onChange={(e) => setReason(e.target.value)} options={REASONS} />
        <Input label="Note" name="note" value={note} onChange={(e) => setNote(e.target.value)}
          hint="Optional — e.g. 'Weekly delivery'." />

        {movements !== null && movements.length > 0 && (
          <>
            <hr style={{ border: 0, borderTop: '1px solid var(--ink-600)', margin: '1.25rem 0' }} />
            <span className="pay-label">Recent changes</span>
            <ul className="movement-list">
              {movements.slice(0, 8).map((m) => (
                <li key={m.id}>
                  <strong className={m.change > 0 ? 'ok' : 'warn'}>
                    {m.change > 0 ? `+${m.change}` : m.change}
                  </strong>
                  <span>{m.reason_display}</span>
                  {m.note && <span className="muted small">{m.note}</span>}
                  <span className="spacer" />
                  <span className="small muted">→ {m.resulting_stock}</span>
                  <span className="small muted">{formatDateTime(m.created_at)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </form>
    </Modal>
  )
}

function CategoryModal({ categories, onChanged, onClose }) {
  const [name, setName] = useState('')
  const [icon, setIcon] = useState('star')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const toast = useToast()

  const add = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.post('/admin/product-categories/', {
        name, icon, sort_order: categories.length + 1, is_active: true,
      })
      toast('Category added')
      setName('')
      onChanged()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const remove = async (category) => {
    try {
      await api.del(`/admin/product-categories/${category.id}/`)
      toast('Category deleted')
      onChanged()
    } catch {
      toast('Move or delete its items first.', 'error')
    }
  }

  return (
    <Modal title="Categories" onClose={onClose}>
      <ul className="category-list">
        {categories.map((c) => (
          <li key={c.id}>
            <Icon name={c.icon} size={16} />
            <strong>{c.name}</strong>
            <span className="small muted">{c.product_count} items</span>
            <span className="spacer" />
            <button className="btn btn--danger btn--sm" onClick={() => remove(c)}>Delete</button>
          </li>
        ))}
        {categories.length === 0 && <Empty>No categories yet.</Empty>}
      </ul>

      <hr style={{ border: 0, borderTop: '1px solid var(--ink-600)', margin: '1.25rem 0' }} />
      <form onSubmit={add}>
        {error && <div className="notice notice--error">{error}</div>}
        <div className="field-grid">
          <Input label="New category" name="name" required value={name}
            onChange={(e) => setName(e.target.value)} hint="e.g. Combos, Merch" />
          <Select label="Icon" name="icon" value={icon} onChange={(e) => setIcon(e.target.value)}
            options={ICONS.map((i) => ({ value: i, label: i }))} />
        </div>
        <button className="btn" disabled={busy || !name.trim()}>
          {busy ? 'Adding…' : 'Add category'}
        </button>
      </form>
    </Modal>
  )
}

export default function Products() {
  const products = useResource('/admin/products/')
  const categories = useResource('/admin/product-categories/')

  const [category, setCategory] = useState('')
  const [kind, setKind] = useState('')
  const [search, setSearch] = useState('')
  const [lowOnly, setLowOnly] = useState(false)

  const [editing, setEditing] = useState(null)
  const [stocking, setStocking] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [showCategories, setShowCategories] = useState(false)
  const [busy, setBusy] = useState(false)
  const toast = useToast()

  const refresh = () => { products.load(); categories.load() }

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase()
    return products.items.filter((p) => {
      if (category && String(p.category) !== String(category)) return false
      if (kind && p.kind !== kind) return false
      if (lowOnly && !p.is_low_stock) return false
      if (term && !`${p.name} ${p.sku} ${p.category_name}`.toLowerCase().includes(term)) return false
      return true
    })
  }, [products.items, category, kind, search, lowOnly])

  const lowCount = products.items.filter((p) => p.is_low_stock).length
  const rentalsOut = products.items.filter((p) => p.units_out > 0)

  const remove = async () => {
    setBusy(true)
    try {
      await api.del(`/admin/products/${deleting.id}/`)
      toast('Item deleted')
      setDeleting(null)
      refresh()
    } catch {
      toast('This item is on a past bill. Untick "Available at the counter" instead.', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageHead
        title="Shop"
        subtitle={`${products.items.length} items across ${categories.items.length} categories`}
      >
        <button className="btn btn--ghost" onClick={() => setShowCategories(true)}>
          <Icon name="star" size={15} /> Categories
        </button>
        <button className="btn" onClick={() => setEditing({})}>
          <Icon name="flame" size={15} /> Add item
        </button>
      </PageHead>

      {(lowCount > 0 || rentalsOut.length > 0) && (
        <div className="sales-flags">
          {lowCount > 0 && (
            <button className={`sales-flag sales-flag--warn ${lowOnly ? 'is-on' : ''}`}
              onClick={() => setLowOnly((v) => !v)}>
              <Icon name="clock" size={15} />
              {lowCount} item{lowCount > 1 ? 's' : ''} running low
              {lowOnly ? ' — showing only these' : ''}
            </button>
          )}
          {rentalsOut.map((p) => (
            <span key={p.id} className="sales-flag sales-flag--info">
              <Icon name="gamepad" size={15} />
              {p.name}: {p.units_out} of {p.stock_quantity} out
            </span>
          ))}
        </div>
      )}

      <div className="toolbar">
        <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
          <option value="">All categories</option>
          {categories.items.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Type">
          <option value="">Consumables and rentals</option>
          <option value="consumable">Consumables only</option>
          <option value="rental">Rentals only</option>
        </select>
        <input type="search" placeholder="Name or shelf label…" value={search}
          onChange={(e) => setSearch(e.target.value)} aria-label="Search items" />
        <span className="spacer" />
        <button className="btn btn--ghost btn--sm" onClick={refresh}>Refresh</button>
      </div>

      <div className="card card--pad0">
        {products.loading ? <Loading /> : visible.length === 0 ? (
          <Empty>
            {products.items.length === 0
              ? 'No items yet. Add snacks, drinks, or kit you rent out.'
              : 'Nothing matches this filter.'}
          </Empty>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th></th><th>Item</th><th>Type</th><th>Price</th>
                  <th>Stock</th><th>Live</th><th></th>
                </tr>
              </thead>
              <tbody>
                {visible.map((p) => (
                  <tr key={p.id} className={p.is_low_stock ? 'is-low' : ''}>
                    <td>
                      {p.image
                        ? <img src={p.image} alt="" className="product-thumb" />
                        : <span className="product-thumb product-thumb--blank">
                            <Icon name={p.kind === 'rental' ? 'gamepad' : 'flame'} size={15} />
                          </span>}
                    </td>
                    <td>
                      <strong>{p.name}</strong>
                      <div className="small muted">
                        {p.category_name}{p.sku && ` · ${p.sku}`}
                      </div>
                    </td>
                    <td>
                      <Pill tone={p.kind === 'rental' ? 'info' : ''}>
                        {p.kind === 'rental' ? 'Rental' : 'Consumable'}
                      </Pill>
                    </td>
                    <td className="nowrap">
                      <strong>{rupees(p.price)}</strong>
                      {p.pricing_mode === 'hourly' && (
                        <div className="small muted">per hour</div>
                      )}
                    </td>
                    <td className="nowrap">
                      {!p.track_stock ? (
                        <span className="muted small">Not tracked</span>
                      ) : p.kind === 'rental' ? (
                        <>
                          <strong className={p.available_stock <= 0 ? 'bad' : ''}>
                            {p.available_stock}
                          </strong>
                          <span className="muted"> / {p.stock_quantity} free</span>
                          {p.units_out > 0 && (
                            <div className="small warn">{p.units_out} out now</div>
                          )}
                        </>
                      ) : (
                        <>
                          <strong className={p.is_low_stock ? 'warn' : ''}>
                            {p.stock_quantity}
                          </strong>
                          {p.is_low_stock && <div className="small warn">running low</div>}
                        </>
                      )}
                    </td>
                    <td>
                      <Pill tone={p.is_active ? 'ok' : 'bad'}>
                        {p.is_active ? 'Live' : 'Hidden'}
                      </Pill>
                    </td>
                    <td className="actions">
                      {p.track_stock && (
                        <button className="btn btn--ghost btn--sm"
                          onClick={() => setStocking(p)}>Stock</button>
                      )}
                      <button className="btn btn--ghost btn--sm"
                        onClick={() => setEditing(p)}>Edit</button>
                      <button className="btn btn--danger btn--sm"
                        onClick={() => setDeleting(p)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <ProductForm
          item={editing.id ? editing : null}
          categories={categories.items}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); refresh() }}
        />
      )}
      {stocking && (
        <StockModal
          product={stocking}
          onClose={() => setStocking(null)}
          onSaved={() => { setStocking(null); refresh() }}
        />
      )}
      {showCategories && (
        <CategoryModal
          categories={categories.items}
          onChanged={refresh}
          onClose={() => setShowCategories(false)}
        />
      )}
      {deleting && (
        <ConfirmModal
          title={`Delete ${deleting.name}?`}
          body="If this item appears on any past bill it cannot be deleted — hide it instead."
          onConfirm={remove}
          onClose={() => setDeleting(null)}
          busy={busy}
        />
      )}
    </>
  )
}
