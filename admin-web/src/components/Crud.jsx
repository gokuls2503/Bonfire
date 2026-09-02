import { useState } from 'react'
import { api } from '../lib/api'
import { useResource } from '../lib/useResource'
import {
  Checkbox, ConfirmModal, Empty, Input, Loading, Modal, PageHead, Select, Textarea, useToast,
} from './ui'
import Icon from './Icon'

/**
 * Table + modal CRUD for the simple admin collections.
 *
 * fields: [{ name, label, type, options, hint, required, span, accept }]
 *   type: text | number | textarea | select | checkbox | date | time | datetime-local | file | url | email
 * columns: [{ key, label, render(item) }]
 */
export default function Crud({
  title,
  subtitle,
  path,
  fields,
  columns,
  emptyText = 'Nothing here yet.',
  addLabel = 'Add',
  labelOf = (item) => item.name || item.title || `#${item.id}`,
  defaults = {},
  intro,
  transform,
}) {
  const { items, loading, load } = useResource(path)
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [busy, setBusy] = useState(false)
  const toast = useToast()

  const hasFile = fields.some((f) => f.type === 'file')

  const blank = () =>
    fields.reduce((acc, f) => {
      acc[f.name] = f.type === 'checkbox' ? (defaults[f.name] ?? true) : (defaults[f.name] ?? '')
      return acc
    }, {})

  const open = (item) => {
    if (!item) return setEditing({ __new: true, ...blank() })
    const seeded = fields.reduce((acc, f) => {
      const value = item[f.name]
      acc[f.name] = f.type === 'file' ? '' : value === null || value === undefined ? '' : value
      return acc
    }, {})
    setEditing({ ...seeded, id: item.id })
  }

  const save = async (event) => {
    event.preventDefault()
    setBusy(true)
    try {
      const isNew = editing.__new
      let body
      if (hasFile) {
        body = new FormData()
        for (const f of fields) {
          const value = editing[f.name]
          if (f.type === 'file') {
            if (value instanceof File) body.append(f.name, value)
          } else if (f.type === 'checkbox') {
            body.append(f.name, value ? 'true' : 'false')
          } else if (Array.isArray(value)) {
            value.forEach((v) => body.append(f.name, v))
          } else if (value !== '' && value !== null) {
            body.append(f.name, value)
          }
        }
        await api.upload(
          isNew ? path : `${path}${editing.id}/`,
          body,
          isNew ? 'POST' : 'PATCH',
        )
      } else {
        body = fields.reduce((acc, f) => {
          let value = editing[f.name]
          if (f.type === 'number') value = value === '' ? null : Number(value)
          if (value === '' && f.nullable) value = null
          acc[f.name] = value
          return acc
        }, {})
        if (transform) body = transform(body)
        if (isNew) await api.post(path, body)
        else await api.patch(`${path}${editing.id}/`, body)
      }
      toast(isNew ? 'Created' : 'Saved')
      setEditing(null)
      load()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    setBusy(true)
    try {
      await api.del(`${path}${deleting.id}/`)
      toast('Deleted')
      setDeleting(null)
      load()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const set = (field) => (e) => {
    const value =
      field.type === 'checkbox' ? e.target.checked
      : field.type === 'file' ? e.target.files[0]
      : field.multiple ? [...e.target.selectedOptions].map((o) => Number(o.value))
      : e.target.value
    setEditing((v) => ({ ...v, [field.name]: value }))
  }

  return (
    <>
      <PageHead title={title} subtitle={subtitle ?? `${items.length} total`}>
        <button className="btn" onClick={() => open(null)}>
          <Icon name="star" size={15} /> {addLabel}
        </button>
      </PageHead>

      {intro && <div className="notice notice--info">{intro}</div>}

      <div className="card card--pad0">
        {loading ? <Loading /> : items.length === 0 ? <Empty>{emptyText}</Empty> : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  {columns.map((c) => <th key={c.key}>{c.label}</th>)}
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    {columns.map((c) => (
                      <td key={c.key}>{c.render ? c.render(item) : item[c.key]}</td>
                    ))}
                    <td className="actions">
                      <button className="btn btn--ghost btn--sm" onClick={() => open(item)}>Edit</button>
                      <button className="btn btn--danger btn--sm" onClick={() => setDeleting(item)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <Modal
          title={editing.__new ? addLabel : `Edit ${labelOf(items.find((i) => i.id === editing.id) || {})}`}
          onClose={() => setEditing(null)}
          footer={
            <>
              <button className="btn btn--ghost" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
            </>
          }
        >
          <form onSubmit={save}>
            {fields.map((f) => {
              const common = {
                key: f.name,
                label: f.label,
                name: f.name,
                hint: f.hint,
                required: f.required,
                value: f.type === 'file' ? undefined : editing[f.name] ?? '',
                onChange: set(f),
              }
              if (f.type === 'checkbox') {
                return <Checkbox key={f.name} label={f.label} name={f.name}
                  checked={Boolean(editing[f.name])} onChange={set(f)} />
              }
              if (f.type === 'textarea') return <Textarea {...common} />
              if (f.type === 'select') {
                return (
                  <Select {...common} multiple={f.multiple}
                    value={f.multiple ? editing[f.name] || [] : common.value}>
                    {!f.required && !f.multiple && <option value="">—</option>}
                    {f.options.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </Select>
                )
              }
              if (f.type === 'file') {
                return (
                  <div className="field" key={f.name}>
                    <label htmlFor={f.name}>{f.label}</label>
                    <input id={f.name} name={f.name} type="file" accept={f.accept || 'image/*'}
                      onChange={set(f)} />
                    {f.hint && <span className="hint">{f.hint}</span>}
                  </div>
                )
              }
              return <Input {...common} type={f.type || 'text'} step={f.step} min={f.min} />
            })}
          </form>
        </Modal>
      )}

      {deleting && (
        <ConfirmModal
          title={`Delete ${labelOf(deleting)}?`}
          body="This cannot be undone."
          onConfirm={remove}
          onClose={() => setDeleting(null)}
          busy={busy}
        />
      )}
    </>
  )
}
