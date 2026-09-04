import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../lib/api'
import { useResource } from '../lib/useResource'
import { rupees, formatTime, formatDay, toDateKey, duration } from '../lib/format'
import {
  ConfirmModal, Empty, Input, Loading, Modal, PageHead, Pill, Select,
  STATUS_TONE, Textarea, useToast,
} from '../components/ui'
import PaymentModal from '../components/PaymentModal'
import Icon from '../components/Icon'

const STATUSES = [
  ['', 'All statuses'],
  ['pending', 'Pending'],
  ['confirmed', 'Confirmed'],
  ['checked_in', 'Checked in'],
  ['completed', 'Completed'],
  ['cancelled', 'Cancelled'],
  ['no_show', 'No show'],
]

function BookingForm({ booking, stationTypes, stations, plans, onSaved, onClose }) {
  const editing = Boolean(booking)
  const [form, setForm] = useState(() => ({
    full_name: booking?.full_name || '',
    phone: booking?.phone || '',
    email: booking?.email || '',
    station_type: booking?.station_type || stationTypes[0]?.id || '',
    station: booking?.station || '',
    pricing_plan: booking?.pricing_plan || '',
    start_at: booking
      ? new Date(booking.start_at).toISOString().slice(0, 16)
      : new Date(Date.now() + 30 * 60000 - new Date().getTimezoneOffset() * 60000)
          .toISOString().slice(0, 16),
    duration_minutes: booking?.duration_minutes || 60,
    seats: booking?.seats || 1,
    status: booking?.status || 'confirmed',
    payment_status: booking?.payment_status || 'unpaid',
    amount_due: booking?.amount_due || '',
    source: booking?.source || 'walkin',
    staff_notes: booking?.staff_notes || '',
  }))
  const [errors, setErrors] = useState({})
  const [banner, setBanner] = useState(null)
  const [busy, setBusy] = useState(false)
  const toast = useToast()

  const typePlans = plans.filter((p) => p.station_type === Number(form.station_type))
  const typeStations = stations.filter((s) => s.station_type === Number(form.station_type))

  const set = (key) => (e) => {
    const value = e.target.type === 'number' ? e.target.value : e.target.value
    setForm((f) => {
      const next = { ...f, [key]: value }
      if (key === 'station_type') { next.station = ''; next.pricing_plan = '' }
      if (key === 'pricing_plan') {
        const plan = plans.find((p) => p.id === Number(value))
        if (plan) {
          next.duration_minutes = plan.duration_minutes
          next.amount_due = (Number(plan.price) * Number(next.seats || 1)).toFixed(2)
        }
      }
      if (key === 'seats') {
        const plan = plans.find((p) => p.id === Number(next.pricing_plan))
        if (plan) next.amount_due = (Number(plan.price) * Number(value || 1)).toFixed(2)
      }
      return next
    })
  }

  const submit = async (event) => {
    event.preventDefault()
    setErrors({})
    setBanner(null)
    setBusy(true)
    const payload = {
      ...form,
      station_type: Number(form.station_type),
      station: form.station ? Number(form.station) : null,
      pricing_plan: form.pricing_plan ? Number(form.pricing_plan) : null,
      seats: Number(form.seats),
      duration_minutes: Number(form.duration_minutes),
      amount_due: form.amount_due === '' ? 0 : form.amount_due,
      start_at: new Date(form.start_at).toISOString(),
    }
    try {
      if (editing) await api.patch(`/admin/bookings/${booking.id}/`, payload)
      else await api.post('/admin/bookings/', payload)
      toast(editing ? 'Booking updated' : 'Booking created')
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
      title={editing ? `Edit ${booking.code}` : 'New booking'}
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn btn--ghost" onClick={onClose}>Cancel</button>
          <button className="btn" onClick={submit} disabled={busy}>
            {busy ? 'Saving…' : editing ? 'Save changes' : 'Create booking'}
          </button>
        </>
      }
    >
      <form onSubmit={submit}>
        {banner && <div className="notice notice--error">{banner}</div>}

        <div className="field-grid">
          <Input label="Name" name="full_name" required value={form.full_name}
            onChange={set('full_name')} error={errors.full_name} />
          <Input label="Phone" name="phone" type="tel" required value={form.phone}
            onChange={set('phone')} error={errors.phone} />
        </div>
        <Input label="Email" name="email" type="email" value={form.email}
          onChange={set('email')} error={errors.email} />

        <div className="field-grid">
          <Select label="Station type" name="station_type" value={form.station_type}
            onChange={set('station_type')} error={errors.station_type}
            options={stationTypes.map((t) => ({ value: t.id, label: t.name }))} />
          <Select label="Plan" name="pricing_plan" value={form.pricing_plan}
            onChange={set('pricing_plan')} error={errors.pricing_plan}>
            <option value="">Custom duration</option>
            {typePlans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — {rupees(p.price)} / {duration(p.duration_minutes)}
              </option>
            ))}
          </Select>
        </div>

        <div className="field-grid">
          <Input label="Starts at" name="start_at" type="datetime-local" required
            value={form.start_at} onChange={set('start_at')} error={errors.start_at} />
          <Input label="Duration (minutes)" name="duration_minutes" type="number" min="15" step="15"
            value={form.duration_minutes} onChange={set('duration_minutes')} />
        </div>

        <div className="field-grid">
          <Input label="Stations booked" name="seats" type="number" min="1"
            value={form.seats} onChange={set('seats')} error={errors.seats} />
          <Select label="Assigned station" name="station" value={form.station}
            onChange={set('station')} hint="Leave blank until check-in.">
            <option value="">Unassigned</option>
            {typeStations.map((s) => (
              <option key={s.id} value={s.id}>{s.name} ({s.status})</option>
            ))}
          </Select>
        </div>

        <div className="field-grid">
          <Select label="Status" name="status" value={form.status} onChange={set('status')}
            options={STATUSES.filter(([v]) => v).map(([value, label]) => ({ value, label }))} />
          <Select label="Payment" name="payment_status" value={form.payment_status}
            onChange={set('payment_status')}
            options={[
              { value: 'unpaid', label: 'Unpaid' },
              { value: 'paid', label: 'Paid at counter' },
              { value: 'waived', label: 'Waived' },
            ]} />
        </div>

        <div className="field-grid">
          <Input label="Amount due" name="amount_due" type="number" step="0.01" min="0"
            value={form.amount_due} onChange={set('amount_due')} />
          <Select label="Source" name="source" value={form.source} onChange={set('source')}
            options={[
              { value: 'walkin', label: 'Walk-in' },
              { value: 'phone', label: 'Phone' },
              { value: 'website', label: 'Website' },
            ]} />
        </div>

        <Textarea label="Staff notes" name="staff_notes" value={form.staff_notes}
          onChange={set('staff_notes')} />
      </form>
    </Modal>
  )
}

export default function Bookings() {
  const [params, setParams] = useSearchParams()
  const { items, loading, load } = useResource('/admin/bookings/', { auto: false })
  const [stationTypes, setStationTypes] = useState([])
  const [stations, setStations] = useState([])
  const [plans, setPlans] = useState([])

  const [status, setStatus] = useState(params.get('status') || '')
  const [date, setDate] = useState(params.get('date') || toDateKey(new Date()))
  const [scope, setScope] = useState(params.get('date') ? 'day' : 'upcoming')
  const [search, setSearch] = useState('')

  const [editing, setEditing] = useState(null)
  const [creating, setCreating] = useState(params.get('new') === '1')
  const [deleting, setDeleting] = useState(null)
  const [paying, setPaying] = useState(null)
  const [settling, setSettling] = useState(null)
  const [busy, setBusy] = useState(null)
  const toast = useToast()

  useEffect(() => {
    Promise.all([
      api.get('/admin/station-types/'),
      api.get('/admin/stations/'),
      api.get('/admin/pricing-plans/'),
    ]).then(([t, s, p]) => {
      setStationTypes(Array.isArray(t) ? t : t.results || [])
      setStations(Array.isArray(s) ? s : s.results || [])
      setPlans(Array.isArray(p) ? p : p.results || [])
    })
  }, [])

  const query = useMemo(() => {
    const q = new URLSearchParams()
    if (status) q.set('status', status)
    if (scope === 'day') q.set('date', date)
    if (scope === 'upcoming') q.set('upcoming', '1')
    if (search.trim()) q.set('search', search.trim())
    q.set('ordering', scope === 'upcoming' ? 'start_at' : '-start_at')
    return `?${q}`
  }, [status, date, scope, search])

  useEffect(() => {
    const timer = setTimeout(() => load(query), 200)
    return () => clearTimeout(timer)
  }, [query, load])

  const refresh = () => load(query)

  const act = async (booking, action, label, body = {}) => {
    setBusy(`${booking.id}-${action}`)
    try {
      await api.post(`/admin/bookings/${booking.id}/${action}/`, body)
      toast(`${booking.code} ${label}`)
      refresh()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setBusy(null)
    }
  }

  const remove = async () => {
    setBusy('delete')
    try {
      await api.del(`/admin/bookings/${deleting.id}/`)
      toast(`${deleting.code} deleted`)
      setDeleting(null)
      refresh()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setBusy(null)
    }
  }

  const dayTotal = items
    .filter((b) => b.status === 'completed')
    .reduce((sum, b) => sum + Number(b.amount_collected || 0), 0)

  return (
    <>
      <PageHead
        title="Bookings"
        subtitle={`${items.length} shown${scope === 'day' ? ` · ${rupees(dayTotal)} collected` : ''}`}
      >
        <button className="btn" onClick={() => setCreating(true)}>
          <Icon name="calendar" size={15} /> New booking
        </button>
      </PageHead>

      <div className="toolbar">
        <div className="seg">
          {[['upcoming', 'Upcoming'], ['day', 'By date'], ['all', 'All']].map(([key, label]) => (
            <button key={key} className={scope === key ? 'is-active' : ''}
              onClick={() => setScope(key)}>{label}</button>
          ))}
        </div>
        {scope === 'day' && (
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date" />
        )}
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          {STATUSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <input type="search" placeholder="Customer code, booking code, name or phone…" value={search}
          onChange={(e) => setSearch(e.target.value)} aria-label="Search bookings" />
        <span className="spacer" />
        <button className="btn btn--ghost btn--sm" onClick={refresh}>Refresh</button>
      </div>

      <div className="card card--pad0">
        {loading ? <Loading /> : items.length === 0 ? (
          <Empty>No bookings match this filter.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Code</th><th>Customer</th><th>When</th><th>Station</th>
                  <th>Status</th><th>Amount</th><th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((b) => (
                  <tr key={b.id}>
                    <td className="mono">{b.code}</td>
                    <td>
                      <strong>{b.full_name}</strong>
                      <div className="small muted">{b.phone}</div>
                    </td>
                    <td className="nowrap">
                      {formatDay(b.start_at)}
                      <div className="small muted">
                        {formatTime(b.start_at)} – {formatTime(b.end_at)}
                      </div>
                    </td>
                    <td>
                      {b.station_type_name}{b.seats > 1 ? ` × ${b.seats}` : ''}
                      {b.station_name && <div className="small mono muted">{b.station_name}</div>}
                    </td>
                    <td>
                      <Pill tone={STATUS_TONE[b.status]}>{b.status_display}</Pill>
                      <div style={{ marginTop: '0.25rem' }}>
                        <Pill tone={STATUS_TONE[b.payment_status]}>
                          {b.payment_status === 'paid' && b.payment_method
                            ? b.payment_method === 'cash' ? 'Cash' : b.payment_method.toUpperCase()
                            : b.payment_status}
                        </Pill>
                      </div>
                    </td>
                    <td className="nowrap">
                      {rupees(b.amount_due)}
                      {Number(b.amount_collected) > 0 && (
                        <div className="small muted">got {rupees(b.amount_collected)}</div>
                      )}
                    </td>
                    <td className="actions">
                      {b.status === 'pending' && (
                        <button className="btn btn--sm" disabled={busy === `${b.id}-confirm`}
                          onClick={() => act(b, 'confirm', 'confirmed')}>Confirm</button>
                      )}
                      {b.status === 'confirmed' && (
                        <button className="btn btn--sm" disabled={busy === `${b.id}-check_in`}
                          onClick={() => act(b, 'check_in', 'checked in')}>Check in</button>
                      )}
                      {b.status === 'checked_in' && (
                        <button className="btn btn--sm" onClick={() => setPaying(b)}>
                          Close out
                        </button>
                      )}
                      {b.status === 'completed' && b.payment_status === 'unpaid' && (
                        <button className="btn btn--sm"
                          onClick={() => setSettling(b)}>Take payment</button>
                      )}
                      <button className="btn btn--ghost btn--sm" onClick={() => setEditing(b)}>Edit</button>
                      {!['completed', 'cancelled'].includes(b.status) && (
                        <button className="btn btn--ghost btn--sm" disabled={busy === `${b.id}-cancel`}
                          onClick={() => act(b, 'cancel', 'cancelled')}>Cancel</button>
                      )}
                      <button className="btn btn--danger btn--sm" onClick={() => setDeleting(b)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {(creating || editing) && (
        <BookingForm
          booking={editing}
          stationTypes={stationTypes}
          stations={stations}
          plans={plans}
          onClose={() => { setCreating(false); setEditing(null); setParams({}) }}
          onSaved={() => { setCreating(false); setEditing(null); setParams({}); refresh() }}
        />
      )}

      {deleting && (
        <ConfirmModal
          title={`Delete ${deleting.code}?`}
          body="This removes the booking permanently. Cancelling instead keeps the record."
          onConfirm={remove}
          onClose={() => setDeleting(null)}
          busy={busy === 'delete'}
        />
      )}

      {(paying || settling) && (
        <PaymentModal
          booking={paying || settling}
          mode={settling ? 'settle' : 'complete'}
          onClose={() => { setPaying(null); setSettling(null) }}
          onDone={() => { setPaying(null); setSettling(null); refresh() }}
        />
      )}
    </>
  )
}
