import { useState } from 'react'
import { api } from '../lib/api'
import { useResource } from '../lib/useResource'
import { formatDate } from '../lib/format'
import Crud from '../components/Crud'
import { Checkbox, Loading, PageHead, useToast } from '../components/ui'

function HoursEditor() {
  const { items, loading, load } = useResource('/admin/business-hours/')
  const [busy, setBusy] = useState(null)
  const toast = useToast()

  const save = async (row, patch) => {
    setBusy(row.id)
    try {
      await api.patch(`/admin/business-hours/${row.id}/`, patch)
      load()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setBusy(null)
    }
  }

  if (loading) return <Loading />

  return (
    <section className="card card--pad0" style={{ marginBottom: '1.5rem' }}>
      <header className="card__head"><h3>Weekly opening hours</h3></header>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr><th>Day</th><th>Opens</th><th>Closes</th><th>Closed all day</th></tr>
          </thead>
          <tbody>
            {items.map((h) => (
              <tr key={h.id}>
                <td><strong>{h.weekday_display}</strong></td>
                <td>
                  <input type="time" value={h.opens_at?.slice(0, 5) || ''} disabled={busy === h.id}
                    onChange={(e) => save(h, { opens_at: e.target.value })}
                    aria-label={`${h.weekday_display} opening time`}
                    style={{ background: 'var(--ink-900)', border: '1px solid var(--ink-500)',
                      borderRadius: 'var(--r-sm)', padding: '0.3rem 0.5rem' }} />
                </td>
                <td>
                  <input type="time" value={h.closes_at?.slice(0, 5) || ''} disabled={busy === h.id}
                    onChange={(e) => save(h, { closes_at: e.target.value })}
                    aria-label={`${h.weekday_display} closing time`}
                    style={{ background: 'var(--ink-900)', border: '1px solid var(--ink-500)',
                      borderRadius: 'var(--r-sm)', padding: '0.3rem 0.5rem' }} />
                </td>
                <td>
                  <input type="checkbox" checked={h.is_closed} disabled={busy === h.id}
                    onChange={(e) => save(h, { is_closed: e.target.checked })}
                    aria-label={`${h.weekday_display} closed`}
                    style={{ width: 16, height: 16, accentColor: 'var(--flame-500)' }} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="small muted" style={{ padding: '0.9rem 1.15rem' }}>
        A closing time earlier than the opening time is treated as past-midnight
        (10:00 → 00:00 means "open till midnight").
      </p>
    </section>
  )
}

export default function Hours() {
  return (
    <>
      <PageHead title="Hours & closures" subtitle="Drives which slots the public booking page offers" />
      <HoursEditor />
      <Crud
        title=""
        subtitle=""
        path="/admin/closures/"
        addLabel="Add closure"
        labelOf={(c) => formatDate(c.date)}
        emptyText="No closures scheduled."
        intro="Add a date here to block bookings for a holiday, private event or early close."
        defaults={{ is_full_day: true }}
        fields={[
          { name: 'date', label: 'Date', type: 'date', required: true },
          { name: 'reason', label: 'Reason', hint: 'Shown to customers when they pick that date.' },
          { name: 'is_full_day', label: 'Closed all day', type: 'checkbox' },
          { name: 'opens_at', label: 'Opens at (if partial)', type: 'time', nullable: true },
          { name: 'closes_at', label: 'Closes at (if partial)', type: 'time', nullable: true },
        ]}
        columns={[
          { key: 'date', label: 'Date', render: (c) => <strong>{formatDate(c.date)}</strong> },
          { key: 'reason', label: 'Reason', render: (c) => c.reason || '—' },
          { key: 'is_full_day', label: 'Scope', render: (c) =>
            c.is_full_day ? 'Closed all day'
              : `${c.opens_at?.slice(0, 5) || '—'} – ${c.closes_at?.slice(0, 5) || '—'}` },
        ]}
      />
    </>
  )
}
