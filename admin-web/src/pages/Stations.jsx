import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { useResource } from '../lib/useResource'
import {
  Checkbox, ConfirmModal, Empty, Input, Loading, Modal, PageHead, Pill, Select,
  STATUS_TONE, Textarea, useToast,
} from '../components/ui'
import Icon from '../components/Icon'

const STATUSES = ['available', 'occupied', 'reserved', 'maintenance', 'offline']
const ICONS = ['monitor', 'gamepad', 'wheel', 'vr', 'headset']

function StationTypeForm({ item, onSaved, onClose }) {
  const editing = Boolean(item)
  const [form, setForm] = useState({
    name: item?.name || '',
    short_description: item?.short_description || '',
    description: item?.description || '',
    icon: item?.icon || 'monitor',
    max_players_per_station: item?.max_players_per_station || 1,
    sort_order: item?.sort_order ?? 0,
    is_active: item?.is_active ?? true,
  })
  const [errors, setErrors] = useState({})
  const [banner, setBanner] = useState(null)
  const [busy, setBusy] = useState(false)
  const toast = useToast()

  const set = (key) => (e) =>
    setForm((f) => ({ ...f, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  const submit = async (event) => {
    event.preventDefault()
    setBusy(true)
    setBanner(null)
    try {
      const payload = {
        ...form,
        max_players_per_station: Number(form.max_players_per_station),
        sort_order: Number(form.sort_order),
      }
      if (editing) await api.patch(`/admin/station-types/${item.id}/`, payload)
      else await api.post('/admin/station-types/', payload)
      toast(editing ? 'Platform updated' : 'Platform added')
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
      title={editing ? `Edit ${item.name}` : 'Add a platform'}
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
        <Input label="Name" name="name" required value={form.name} onChange={set('name')}
          error={errors.name} hint="e.g. Gaming PC, PS5 Console, Racing Rig" />
        <Input label="One-line pitch" name="short_description" value={form.short_description}
          onChange={set('short_description')} />
        <Textarea label="Description" name="description" value={form.description}
          onChange={set('description')} />
        <div className="field-grid">
          <Select label="Icon" name="icon" value={form.icon} onChange={set('icon')}
            options={ICONS.map((i) => ({ value: i, label: i }))} />
          <Input label="Players per station" name="max_players_per_station" type="number" min="1"
            value={form.max_players_per_station} onChange={set('max_players_per_station')} />
        </div>
        <div className="field-grid">
          <Input label="Sort order" name="sort_order" type="number"
            value={form.sort_order} onChange={set('sort_order')} />
        </div>
        <Checkbox label="Show on the public site" name="is_active"
          checked={form.is_active} onChange={set('is_active')} />
      </form>
    </Modal>
  )
}

function StationForm({ item, types, onSaved, onClose }) {
  const editing = Boolean(item)
  const [form, setForm] = useState({
    name: item?.name || '',
    station_type: item?.station_type || types[0]?.id || '',
    specs: item?.specs || '',
    peripherals: item?.peripherals || '',
    status: item?.status || 'available',
    status_note: item?.status_note || '',
    sort_order: item?.sort_order ?? 0,
    is_active: item?.is_active ?? true,
    is_bookable: item?.is_bookable ?? true,
  })
  const [errors, setErrors] = useState({})
  const [banner, setBanner] = useState(null)
  const [busy, setBusy] = useState(false)
  const toast = useToast()

  const set = (key) => (e) =>
    setForm((f) => ({ ...f, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  const submit = async (event) => {
    event.preventDefault()
    setBusy(true)
    setBanner(null)
    try {
      const payload = {
        ...form,
        station_type: Number(form.station_type),
        sort_order: Number(form.sort_order),
      }
      if (editing) await api.patch(`/admin/stations/${item.id}/`, payload)
      else await api.post('/admin/stations/', payload)
      toast(editing ? 'Station updated' : 'Station added')
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
      title={editing ? `Edit ${item.name}` : 'Add a station'}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn--ghost" onClick={onClose}>Cancel</button>
          <button className="btn" onClick={submit} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </>
      }
    >
      <form onSubmit={submit}>
        {banner && <div className="notice notice--error">{banner}</div>}
        <div className="field-grid">
          <Input label="Station name" name="name" required value={form.name} onChange={set('name')}
            error={errors.name} hint="e.g. PC-06" />
          <Select label="Platform" name="station_type" value={form.station_type}
            onChange={set('station_type')} error={errors.station_type}
            options={types.map((t) => ({ value: t.id, label: t.name }))} />
        </div>
        <Textarea label="Specs" name="specs" value={form.specs} onChange={set('specs')}
          hint="Shown on the public site for this platform." />
        <Input label="Peripherals" name="peripherals" value={form.peripherals}
          onChange={set('peripherals')} />
        <div className="field-grid">
          <Select label="Status" name="status" value={form.status} onChange={set('status')}
            options={STATUSES.map((s) => ({ value: s, label: s }))} />
          <Input label="Sort order" name="sort_order" type="number"
            value={form.sort_order} onChange={set('sort_order')} />
        </div>
        <Input label="Status note" name="status_note" value={form.status_note}
          onChange={set('status_note')} hint="e.g. GPU RMA, back Friday" />
        <Checkbox label="Active" name="is_active" checked={form.is_active} onChange={set('is_active')} />
        <Checkbox label="Bookable online" name="is_bookable" checked={form.is_bookable}
          onChange={set('is_bookable')} />
      </form>
    </Modal>
  )
}

export default function Stations() {
  const types = useResource('/admin/station-types/')
  const stations = useResource('/admin/stations/')
  const [typeModal, setTypeModal] = useState(null)
  const [stationModal, setStationModal] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [busy, setBusy] = useState(false)
  const toast = useToast()

  const refresh = () => { types.load(); stations.load() }

  const setStatus = async (station, status) => {
    try {
      await api.post(`/admin/stations/${station.id}/set_status/`, { status })
      toast(`${station.name} → ${status}`)
      stations.load()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  const remove = async () => {
    setBusy(true)
    try {
      await api.del(`/admin/${deleting.kind}/${deleting.item.id}/`)
      toast('Deleted')
      setDeleting(null)
      refresh()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageHead
        title="Stations"
        subtitle={`${stations.items.filter((s) => s.is_active).length} active across ${types.items.length} platforms`}
      >
        <button className="btn btn--ghost" onClick={() => setTypeModal({})}>
          <Icon name="star" size={15} /> Add platform
        </button>
        <button className="btn" onClick={() => setStationModal({})}>
          <Icon name="monitor" size={15} /> Add station
        </button>
      </PageHead>

      <div className="notice notice--info">
        Adding hardware later? Create the station here and the public site, availability
        calculator and booking capacity all pick it up immediately.
      </div>

      {types.loading ? <Loading /> : types.items.map((type) => {
        const own = stations.items.filter((s) => s.station_type === type.id)
        return (
          <section key={type.id} className="card card--pad0" style={{ marginBottom: '1.25rem' }}>
            <header className="card__head">
              <Icon name={type.icon} size={18} />
              <h3>{type.name}</h3>
              <Pill tone={type.is_active ? 'ok' : 'bad'}>
                {type.is_active ? 'Live' : 'Hidden'}
              </Pill>
              <span className="small muted">{own.length} stations</span>
              <span className="spacer" />
              <button className="btn btn--ghost btn--sm" onClick={() => setTypeModal(type)}>Edit platform</button>
              <button className="btn btn--danger btn--sm"
                onClick={() => setDeleting({ kind: 'station-types', item: type, label: type.name })}>
                Delete
              </button>
            </header>
            {own.length === 0 ? (
              <Empty>No stations on this platform yet.</Empty>
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr><th>Station</th><th>Specs</th><th>Status</th><th>Online booking</th><th></th></tr>
                  </thead>
                  <tbody>
                    {own.map((s) => (
                      <tr key={s.id}>
                        <td className="mono"><strong>{s.name}</strong></td>
                        <td className="small muted" style={{ maxWidth: 340 }}>
                          {s.specs || '—'}
                          {s.peripherals && <div>{s.peripherals}</div>}
                        </td>
                        <td>
                          <select value={s.status} onChange={(e) => setStatus(s, e.target.value)}
                            aria-label={`Status for ${s.name}`}
                            style={{
                              background: 'var(--ink-900)', border: '1px solid var(--ink-500)',
                              borderRadius: 'var(--r-sm)', padding: '0.25rem 0.4rem', fontSize: '0.8rem',
                            }}>
                            {STATUSES.map((st) => <option key={st} value={st}>{st}</option>)}
                          </select>
                          {s.status_note && <div className="small muted">{s.status_note}</div>}
                        </td>
                        <td>
                          <Pill tone={s.is_bookable && s.is_active ? 'ok' : 'bad'}>
                            {s.is_active ? (s.is_bookable ? 'Bookable' : 'Walk-in only') : 'Inactive'}
                          </Pill>
                        </td>
                        <td className="actions">
                          <button className="btn btn--ghost btn--sm" onClick={() => setStationModal(s)}>Edit</button>
                          <button className="btn btn--danger btn--sm"
                            onClick={() => setDeleting({ kind: 'stations', item: s, label: s.name })}>
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )
      })}

      {typeModal && (
        <StationTypeForm
          item={typeModal.id ? typeModal : null}
          onClose={() => setTypeModal(null)}
          onSaved={() => { setTypeModal(null); refresh() }}
        />
      )}
      {stationModal && (
        <StationForm
          item={stationModal.id ? stationModal : null}
          types={types.items}
          onClose={() => setStationModal(null)}
          onSaved={() => { setStationModal(null); refresh() }}
        />
      )}
      {deleting && (
        <ConfirmModal
          title={`Delete ${deleting.label}?`}
          body="This cannot be undone. If it has bookings attached, deactivate it instead."
          onConfirm={remove}
          onClose={() => setDeleting(null)}
          busy={busy}
        />
      )}
    </>
  )
}
