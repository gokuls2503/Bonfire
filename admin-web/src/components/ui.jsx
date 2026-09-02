import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import Icon from './Icon'

/* ---------- toasts ---------- */
const ToastContext = createContext(null)

export function ToastProvider({ children }) {
  const [items, setItems] = useState([])

  const push = useCallback((message, tone = 'ok') => {
    const id = Math.random().toString(36).slice(2)
    setItems((v) => [...v, { id, message, tone }])
    setTimeout(() => setItems((v) => v.filter((t) => t.id !== id)), 4200)
  }, [])

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast toast--${t.tone}`}>
            <Icon name={t.tone === 'ok' ? 'check' : 'close'} size={16} />
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext) || (() => {})

/* ---------- modal ---------- */
export function Modal({ title, onClose, children, footer, wide }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'modal--wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal__head">
          <h3>{title}</h3>
          <span className="spacer" />
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="close" size={18} />
          </button>
        </header>
        <div className="modal__body">{children}</div>
        {footer && <footer className="modal__foot">{footer}</footer>}
      </div>
    </div>
  )
}

export function ConfirmModal({ title, body, confirmLabel = 'Delete', onConfirm, onClose, busy }) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn--ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn--danger" onClick={onConfirm} disabled={busy}>
            {busy ? 'Working…' : confirmLabel}
          </button>
        </>
      }
    >
      <p className="muted">{body}</p>
    </Modal>
  )
}

/* ---------- form primitives ---------- */
export function Field({ label, hint, error, children, id }) {
  return (
    <div className="field">
      {label && <label htmlFor={id}>{label}</label>}
      {children}
      {hint && <span className="hint">{hint}</span>}
      {error && <span className="error">{error}</span>}
    </div>
  )
}

export function Input({ label, hint, error, id, ...rest }) {
  const inputId = id || rest.name
  return (
    <Field label={label} hint={hint} error={error} id={inputId}>
      <input id={inputId} {...rest} />
    </Field>
  )
}

export function Textarea({ label, hint, error, id, ...rest }) {
  const inputId = id || rest.name
  return (
    <Field label={label} hint={hint} error={error} id={inputId}>
      <textarea id={inputId} {...rest} />
    </Field>
  )
}

export function Select({ label, hint, error, id, options = [], children, ...rest }) {
  const inputId = id || rest.name
  return (
    <Field label={label} hint={hint} error={error} id={inputId}>
      <select id={inputId} {...rest}>
        {children ||
          options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
      </select>
    </Field>
  )
}

export function Checkbox({ label, id, ...rest }) {
  const inputId = id || rest.name
  return (
    <div className="field field--check">
      <input type="checkbox" id={inputId} {...rest} />
      <label htmlFor={inputId}>{label}</label>
    </div>
  )
}

/* ---------- data display ---------- */
export function Pill({ tone = '', children }) {
  return <span className={`pill ${tone ? `pill--${tone}` : ''}`}>{children}</span>
}

export const STATUS_TONE = {
  pending: 'warn',
  confirmed: 'info',
  checked_in: 'ok',
  completed: '',
  cancelled: 'bad',
  no_show: 'bad',
  available: 'ok',
  occupied: 'warn',
  reserved: 'info',
  maintenance: 'bad',
  offline: 'bad',
  draft: '',
  open: 'ok',
  full: 'warn',
  live: 'ember',
  waitlist: 'warn',
  rejected: 'bad',
  withdrawn: 'bad',
  paid: 'ok',
  unpaid: 'warn',
  waived: '',
}

export function Loading({ rows = 5 }) {
  return (
    <div className="stack" style={{ padding: '1.25rem', gap: '0.7rem' }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton" style={{ width: `${100 - i * 8}%` }} />
      ))}
    </div>
  )
}

export function Empty({ children }) {
  return <div className="empty">{children}</div>
}

export function PageHead({ title, subtitle, children }) {
  return (
    <div className="row row--wrap" style={{ marginBottom: '1.5rem', alignItems: 'flex-end' }}>
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="muted small" style={{ marginTop: '0.35rem' }}>{subtitle}</p>}
      </div>
      <span className="spacer" />
      {children}
    </div>
  )
}
