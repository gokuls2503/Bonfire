import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../lib/api'
import { useResource } from '../lib/useResource'
import { rupees, formatDateTime, timeUntil } from '../lib/format'
import {
  Checkbox, ConfirmModal, Empty, Input, Loading, Modal, PageHead, Pill,
  Select, STATUS_TONE, Textarea, useToast,
} from '../components/ui'
import Icon from '../components/Icon'

const toLocalInput = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

function TournamentForm({ item, types, onSaved, onClose }) {
  const editing = Boolean(item)
  const [form, setForm] = useState({
    title: item?.title || '',
    game: item?.game || '',
    platform: item?.platform || '',
    tagline: item?.tagline || '',
    description: item?.description || '',
    rules: item?.rules || '',
    format: item?.format || 'single_elim',
    team_size: item?.team_size ?? 1,
    max_teams: item?.max_teams ?? 16,
    starts_at: toLocalInput(item?.starts_at) || toLocalInput(new Date(Date.now() + 86400000)),
    ends_at: toLocalInput(item?.ends_at),
    registration_closes_at: toLocalInput(item?.registration_closes_at),
    entry_fee: item?.entry_fee ?? 0,
    prize_pool: item?.prize_pool ?? 0,
    prize_breakdown: item?.prize_breakdown || '',
    status: item?.status || 'draft',
    venue_note: item?.venue_note || '',
    is_recurring_weekly: item?.is_recurring_weekly ?? false,
    is_featured: item?.is_featured ?? false,
    banner: null,
  })
  const [banner, setBanner] = useState(null)
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const toast = useToast()

  const set = (key) => (e) =>
    setForm((f) => ({
      ...f,
      [key]: e.target.type === 'checkbox' ? e.target.checked
        : e.target.type === 'file' ? e.target.files[0]
        : e.target.value,
    }))

  const submit = async (event) => {
    event.preventDefault()
    setBusy(true)
    setBanner(null)
    try {
      const body = new FormData()
      for (const [key, value] of Object.entries(form)) {
        if (key === 'banner') {
          if (value instanceof File) body.append('banner', value)
          continue
        }
        if (typeof value === 'boolean') body.append(key, value ? 'true' : 'false')
        else if (key.endsWith('_at') && value) body.append(key, new Date(value).toISOString())
        else if (value !== '' && value !== null) body.append(key, value)
      }
      if (editing) await api.upload(`/admin/tournaments/${item.id}/`, body, 'PATCH')
      else await api.upload('/admin/tournaments/', body, 'POST')
      toast(editing ? 'Tournament updated' : 'Tournament created')
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
      title={editing ? `Edit ${item.title}` : 'New tournament'}
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn btn--ghost" onClick={onClose}>Cancel</button>
          <button className="btn" onClick={submit} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </>
      }
    >
      <form onSubmit={submit}>
        {banner && <div className="notice notice--error">{banner}</div>}

        <Input label="Title" name="title" required value={form.title} onChange={set('title')}
          error={errors.title} hint="e.g. Bonfire Friday Night Valorant 5v5" />
        <div className="field-grid">
          <Input label="Game" name="game" required value={form.game} onChange={set('game')}
            error={errors.game} />
          <Select label="Platform" name="platform" value={form.platform} onChange={set('platform')}
            options={types.map((t) => ({ value: t.id, label: t.name }))}>
            <option value="">—</option>
            {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        </div>
        <Input label="Tagline" name="tagline" value={form.tagline} onChange={set('tagline')} />

        <div className="field">
          <label htmlFor="tbanner">Banner image</label>
          <input id="tbanner" type="file" accept="image/*" onChange={set('banner')} />
          <span className="hint">16:9 works best. Leave blank to keep the current one.</span>
        </div>

        <div className="field-grid">
          <Select label="Format" name="format" value={form.format} onChange={set('format')}
            options={[
              { value: 'single_elim', label: 'Single elimination' },
              { value: 'double_elim', label: 'Double elimination' },
              { value: 'round_robin', label: 'Round robin' },
              { value: 'points', label: 'Points / leaderboard' },
            ]} />
          <Select label="Status" name="status" value={form.status} onChange={set('status')}
            options={[
              { value: 'draft', label: 'Draft (hidden)' },
              { value: 'open', label: 'Registration open' },
              { value: 'full', label: 'Full' },
              { value: 'live', label: 'Live now' },
              { value: 'completed', label: 'Completed' },
              { value: 'cancelled', label: 'Cancelled' },
            ]} />
        </div>

        <div className="field-grid">
          <Input label="Team size" name="team_size" type="number" min="1"
            value={form.team_size} onChange={set('team_size')} hint="1 for solo events." />
          <Input label="Max teams" name="max_teams" type="number" min="2"
            value={form.max_teams} onChange={set('max_teams')} />
        </div>

        <div className="field-grid">
          <Input label="Starts at" name="starts_at" type="datetime-local" required
            value={form.starts_at} onChange={set('starts_at')} error={errors.starts_at} />
          <Input label="Ends at" name="ends_at" type="datetime-local"
            value={form.ends_at} onChange={set('ends_at')} />
        </div>
        <Input label="Registration closes" name="registration_closes_at" type="datetime-local"
          value={form.registration_closes_at} onChange={set('registration_closes_at')} />

        <div className="field-grid">
          <Input label="Entry fee (₹)" name="entry_fee" type="number" step="0.01" min="0"
            value={form.entry_fee} onChange={set('entry_fee')} />
          <Input label="Prize pool (₹)" name="prize_pool" type="number" step="0.01" min="0"
            value={form.prize_pool} onChange={set('prize_pool')} />
        </div>

        <Textarea label="Prize breakdown" name="prize_breakdown" value={form.prize_breakdown}
          onChange={set('prize_breakdown')} hint="One prize per line, e.g. '1st - ₹2000'" />
        <Textarea label="Description" name="description" value={form.description}
          onChange={set('description')} />
        <Textarea label="Rules" name="rules" value={form.rules} onChange={set('rules')} />
        <Input label="Venue note" name="venue_note" value={form.venue_note} onChange={set('venue_note')} />

        <Checkbox label="Runs every week" name="is_recurring_weekly"
          checked={form.is_recurring_weekly} onChange={set('is_recurring_weekly')} />
        <Checkbox label="Feature on the homepage" name="is_featured"
          checked={form.is_featured} onChange={set('is_featured')} />
      </form>
    </Modal>
  )
}

export default function Tournaments() {
  const [params, setParams] = useSearchParams()
  const { items, loading, load } = useResource('/admin/tournaments/')
  const [types, setTypes] = useState([])
  const [modal, setModal] = useState(params.get('new') === '1' ? {} : null)
  const [deleting, setDeleting] = useState(null)
  const [busy, setBusy] = useState(null)
  const toast = useToast()

  useEffect(() => {
    api.get('/admin/station-types/').then((r) => setTypes(Array.isArray(r) ? r : r.results || []))
  }, [])

  const duplicate = async (t) => {
    setBusy(t.id)
    try {
      await api.post(`/admin/tournaments/${t.id}/duplicate/`, { weeks_ahead: 1 })
      toast(`Next week's edition created as a draft`)
      load()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setBusy(null)
    }
  }

  const remove = async () => {
    setBusy('del')
    try {
      await api.del(`/admin/tournaments/${deleting.id}/`)
      toast('Tournament deleted')
      setDeleting(null)
      load()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <PageHead title="Tournaments" subtitle={`${items.length} total`}>
        <button className="btn" onClick={() => setModal({})}>
          <Icon name="trophy" size={15} /> New tournament
        </button>
      </PageHead>

      <div className="notice notice--info">
        Set a tournament to <strong>Registration open</strong> to make it visible and bookable on the
        public site. Weekly events can be cloned forward one week at a time with <strong>Clone +1 week</strong>.
      </div>

      <div className="card card--pad0">
        {loading ? <Loading /> : items.length === 0 ? (
          <Empty>No tournaments yet. Create your first weekly event.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Event</th><th>When</th><th>Teams</th><th>Prize / entry</th>
                  <th>Status</th><th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <strong>{t.title}</strong>
                      <div className="small muted">
                        {t.game} · {t.format_display}
                        {t.team_size > 1 && ` · ${t.team_size}v${t.team_size}`}
                        {t.is_recurring_weekly && ' · weekly'}
                      </div>
                    </td>
                    <td className="nowrap">
                      {formatDateTime(t.starts_at)}
                      <div className="small muted">{timeUntil(t.starts_at)}</div>
                    </td>
                    <td>
                      <strong>{t.confirmed_team_count}/{t.max_teams}</strong>
                      <div className="small muted">{t.registration_count} signed up</div>
                    </td>
                    <td className="nowrap">
                      {rupees(t.prize_pool)}
                      <div className="small muted">entry {Number(t.entry_fee) ? rupees(t.entry_fee) : 'free'}</div>
                    </td>
                    <td>
                      <Pill tone={STATUS_TONE[t.status]}>{t.status_display}</Pill>
                      {t.is_featured && <div style={{ marginTop: '0.25rem' }}><Pill tone="flame">Featured</Pill></div>}
                    </td>
                    <td className="actions">
                      <Link className="btn btn--ghost btn--sm" to={`/registrations?tournament=${t.id}`}>
                        Teams
                      </Link>
                      <button className="btn btn--ghost btn--sm" onClick={() => setModal(t)}>Edit</button>
                      {t.is_recurring_weekly && (
                        <button className="btn btn--ghost btn--sm" disabled={busy === t.id}
                          onClick={() => duplicate(t)}>Clone +1 week</button>
                      )}
                      <button className="btn btn--danger btn--sm" onClick={() => setDeleting(t)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && (
        <TournamentForm
          item={modal.id ? modal : null}
          types={types}
          onClose={() => { setModal(null); setParams({}) }}
          onSaved={() => { setModal(null); setParams({}); load() }}
        />
      )}
      {deleting && (
        <ConfirmModal
          title={`Delete ${deleting.title}?`}
          body="Registrations for this tournament are deleted with it."
          onConfirm={remove}
          onClose={() => setDeleting(null)}
          busy={busy === 'del'}
        />
      )}
    </>
  )
}
