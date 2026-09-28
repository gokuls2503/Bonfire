import { useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api'
import { useResource } from '../lib/useResource'
import { formatDateTime } from '../lib/format'
import {
  ConfirmModal, Empty, Loading, Modal, PageHead, Pill, useToast,
} from '../components/ui'

export default function Messages({ onCountChange }) {
  const { items, loading, load } = useResource('/admin/messages/', { auto: false })
  const [filter, setFilter] = useState('inbox')
  const [viewing, setViewing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [busy, setBusy] = useState(false)
  const toast = useToast()

  const query = useMemo(() => {
    if (filter === 'unread') return '?is_read=false&is_archived=false'
    if (filter === 'archived') return '?is_archived=true'
    return '?is_archived=false'
  }, [filter])

  useEffect(() => { load(query) }, [query, load])

  const open = async (message) => {
    setViewing(message)
    if (!message.is_read) {
      try {
        await api.patch(`/admin/messages/${message.id}/`, { is_read: true })
        load(query)
        onCountChange?.()
      } catch { /* a failed read-receipt should not block reading */ }
    }
  }

  const archive = async (message, value = true) => {
    try {
      await api.patch(`/admin/messages/${message.id}/`, { is_archived: value })
      toast(value ? 'Archived' : 'Restored')
      setViewing(null)
      load(query)
      onCountChange?.()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  const remove = async () => {
    setBusy(true)
    try {
      await api.del(`/admin/messages/${deleting.id}/`)
      toast('Deleted')
      setDeleting(null)
      setViewing(null)
      load(query)
      onCountChange?.()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageHead title="Messages" subtitle={`${items.length} in ${filter}`} />

      <div className="toolbar">
        <div className="seg">
          {[['inbox', 'Inbox'], ['unread', 'Unread'], ['archived', 'Archived']].map(([key, label]) => (
            <button key={key} className={filter === key ? 'is-active' : ''}
              onClick={() => setFilter(key)}>{label}</button>
          ))}
        </div>
      </div>

      <div className="card card--pad0">
        {loading ? <Loading /> : items.length === 0 ? (
          <Empty>Nothing here.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr><th>From</th><th>Topic</th><th>Message</th><th>Received</th><th></th></tr>
              </thead>
              <tbody>
                {items.map((m) => (
                  <tr key={m.id} style={m.is_read ? undefined : { background: 'rgba(0, 120, 240, 0.04)' }}>
                    <td>
                      <strong>{m.name}</strong>
                      <div className="small muted">{m.phone || m.email}</div>
                    </td>
                    <td><Pill tone={m.is_read ? '' : 'flame'}>{m.topic_display}</Pill></td>
                    <td className="small muted" style={{ maxWidth: 380 }}>
                      {m.message.slice(0, 110)}{m.message.length > 110 ? '…' : ''}
                    </td>
                    <td className="small muted nowrap">{formatDateTime(m.created_at)}</td>
                    <td className="actions">
                      <button className="btn btn--ghost btn--sm" onClick={() => open(m)}>Read</button>
                      <button className="btn btn--ghost btn--sm"
                        onClick={() => archive(m, !m.is_archived)}>
                        {m.is_archived ? 'Restore' : 'Archive'}
                      </button>
                      <button className="btn btn--danger btn--sm" onClick={() => setDeleting(m)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {viewing && (
        <Modal
          title={`${viewing.name} — ${viewing.topic_display}`}
          onClose={() => setViewing(null)}
          footer={
            <>
              {viewing.phone && (
                <a className="btn btn--ghost" href={`tel:${viewing.phone}`}>Call {viewing.phone}</a>
              )}
              {viewing.email && (
                <a className="btn btn--ghost" href={`mailto:${viewing.email}`}>Reply by email</a>
              )}
              <button className="btn" onClick={() => archive(viewing)}>Archive</button>
            </>
          }
        >
          <p className="small muted">{formatDateTime(viewing.created_at)}</p>
          <p style={{ whiteSpace: 'pre-wrap', marginTop: '1rem' }}>{viewing.message}</p>
        </Modal>
      )}
      {deleting && (
        <ConfirmModal
          title={`Delete message from ${deleting.name}?`}
          body="This cannot be undone."
          onConfirm={remove}
          onClose={() => setDeleting(null)}
          busy={busy}
        />
      )}
    </>
  )
}
