import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Bar, BarChart, CartesianGrid, Cell, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { api } from '../lib/api'
import { rupees, formatDay, formatTime, toDateKey } from '../lib/format'
import { Empty, Loading, PageHead, Pill, useToast } from '../components/ui'
import PaymentModal from '../components/PaymentModal'
import Icon from '../components/Icon'
import './sales.css'

const PRESETS = [
  ['today', 'Today'],
  ['yesterday', 'Yesterday'],
  ['7d', 'Last 7 days'],
  ['30d', 'Last 30 days'],
  ['month', 'This month'],
  ['last_month', 'Last month'],
  ['custom', 'Custom'],
]

const METHOD_COLOR = {
  cash: '#35c67a',
  upi: '#ff7a18',
  card: '#4d9fff',
  other: '#8d8b86',
  unrecorded: '#3a3a46',
}

function Stat({ label, value, sub, tone, icon }) {
  return (
    <div className={`sales-stat ${tone ? `sales-stat--${tone}` : ''}`}>
      {icon && <span className="sales-stat__icon"><Icon name={icon} size={16} /></span>}
      <span className="sales-stat__label">{label}</span>
      <strong className="sales-stat__value">{value}</strong>
      {sub && <span className="sales-stat__sub">{sub}</span>}
    </div>
  )
}

function DayTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const total = payload.reduce((sum, p) => sum + (p.value || 0), 0)
  return (
    <div className="chart-tip">
      <strong>{label}</strong>
      {payload.map((p) => (
        <div key={p.dataKey} style={{ color: p.color }}>
          {p.dataKey === 'cash' ? 'Cash' : 'Online'}: {rupees(p.value)}
        </div>
      ))}
      <div style={{ marginTop: '0.25rem', borderTop: '1px solid var(--ink-500)', paddingTop: '0.25rem' }}>
        Total {rupees(total)}
      </div>
    </div>
  )
}

export default function Sales() {
  const [preset, setPreset] = useState('7d')
  const [from, setFrom] = useState(toDateKey(new Date(Date.now() - 6 * 86400000)))
  const [to, setTo] = useState(toDateKey(new Date()))
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  const [txns, setTxns] = useState(null)
  const [txnMethod, setTxnMethod] = useState('')
  const [showTxns, setShowTxns] = useState(false)
  const [settling, setSettling] = useState(null)
  const toast = useToast()

  const query = useMemo(
    () => (preset === 'custom' ? `from=${from}&to=${to}` : `preset=${preset}`),
    [preset, from, to],
  )

  const load = useCallback(async () => {
    setError(null)
    try {
      setData(await api.get(`/admin/sales/?${query}`))
    } catch (err) {
      setError(err.message)
    }
  }, [query])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!showTxns) return
    setTxns(null)
    api
      .get(`/admin/sales/transactions/?${query}${txnMethod ? `&method=${txnMethod}` : ''}`)
      .then(setTxns)
      .catch((err) => toast(err.message, 'error'))
  }, [showTxns, query, txnMethod])

  const exportCsv = async () => {
    try {
      const res = await api.get(
        `/admin/sales/transactions/?${query}${txnMethod ? `&method=${txnMethod}` : ''}`,
      )
      const header = ['Date', 'Time', 'Reference', 'Type', 'Customer', 'Phone', 'Detail', 'Method', 'Amount']
      const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
      const lines = [
        header.join(','),
        ...res.transactions.map((t) => [
          formatDay(t.settled_at), formatTime(t.settled_at), t.reference,
          t.kind === 'booking' ? 'Session' : 'Entry fee',
          t.customer, t.phone, t.detail, t.method_label, t.amount,
        ].map(escape).join(',')),
        ['', '', '', '', '', '', '', 'TOTAL', res.total].map(escape).join(','),
      ]
      const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `bonfire-sales-${res.range.from}-to-${res.range.to}.csv`
      a.click()
      URL.revokeObjectURL(url)
      toast(`Exported ${res.count} transactions`)
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  if (error) return <div className="notice notice--error">{error}</div>
  if (!data) return <Loading rows={8} />

  const t = data.totals
  const pieData = data.by_method.filter((m) => m.amount > 0)

  return (
    <>
      <PageHead
        title="Sales"
        subtitle={`${formatDay(data.range.from)} – ${formatDay(data.range.to)} · ${data.range.days} day${data.range.days > 1 ? 's' : ''}`}
      >
        <button className="btn btn--ghost" onClick={load}>Refresh</button>
        <button className="btn" onClick={exportCsv}>
          <Icon name="arrow" size={15} /> Export CSV
        </button>
      </PageHead>

      <div className="toolbar">
        <div className="seg" style={{ flexWrap: 'wrap' }}>
          {PRESETS.map(([key, label]) => (
            <button key={key} className={preset === key ? 'is-active' : ''}
              onClick={() => setPreset(key)}>{label}</button>
          ))}
        </div>
        {preset === 'custom' && (
          <>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" />
            <span className="muted small">to</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" />
          </>
        )}
      </div>

      <div className="sales-stats">
        <Stat icon="flame" label="Total takings" value={rupees(t.revenue)} tone="ember"
          sub={`${rupees(t.avg_per_day)} a day average`} />
        <Stat icon="check" label="Cash" value={rupees(t.cash)} tone="ok"
          sub={`${t.cash_share}% of takings`} />
        <Stat icon="bolt" label="Online" value={rupees(t.online)} tone="info"
          sub={`${t.online_share}% — UPI, card`} />
        <Stat icon="calendar" label="Sessions" value={t.sessions}
          sub={`${rupees(t.avg_per_session)} average`} />
      </div>

      {(t.outstanding > 0 || t.unrecorded > 0) && (
        <div className="sales-flags">
          {t.outstanding > 0 && (
            <button className="sales-flag sales-flag--warn" onClick={() => setShowTxns(false)}>
              <Icon name="clock" size={15} />
              {rupees(t.outstanding)} still owed across {data.outstanding_bookings.length} booking
              {data.outstanding_bookings.length === 1 ? '' : 's'}
            </button>
          )}
          {t.unrecorded > 0 && (
            <span className="sales-flag sales-flag--bad">
              <Icon name="close" size={15} />
              {rupees(t.unrecorded)} taken without a recorded method
            </span>
          )}
        </div>
      )}

      <div className="sales-grid">
        <section className="card">
          <div className="row" style={{ marginBottom: '1rem' }}>
            <h3>Daily takings</h3>
            <span className="spacer" />
            <span className="small muted">
              <i className="swatch" style={{ background: METHOD_COLOR.cash }} /> Cash
              <i className="swatch" style={{ background: METHOD_COLOR.upi, marginLeft: '0.75rem' }} /> Online
            </span>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data.by_day} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f1f27" vertical={false} />
              <XAxis dataKey={data.range.days > 14 ? 'date' : 'label'} stroke="#6b6a66"
                fontSize={11} tickLine={false} axisLine={false}
                tickFormatter={(v) => (data.range.days > 14 ? v.slice(8) : v)} />
              <YAxis stroke="#6b6a66" fontSize={11} tickLine={false} axisLine={false}
                tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : v)} />
              <Tooltip content={DayTooltip} cursor={{ fill: 'rgba(255,77,13,0.06)' }} />
              <Bar dataKey="cash" stackId="a" fill={METHOD_COLOR.cash} maxBarSize={40} />
              <Bar dataKey="online" stackId="a" fill={METHOD_COLOR.upi} radius={[3, 3, 0, 0]} maxBarSize={40} />
            </BarChart>
          </ResponsiveContainer>
        </section>

        <section className="card">
          <h3 style={{ marginBottom: '1rem' }}>Payment mix</h3>
          {pieData.length === 0 ? (
            <Empty>No takings in this range.</Empty>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={pieData} dataKey="amount" nameKey="label" innerRadius={48}
                    outerRadius={76} paddingAngle={2} stroke="none">
                    {pieData.map((entry) => (
                      <Cell key={entry.method} fill={METHOD_COLOR[entry.method] || '#8d8b86'} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: 'var(--ink-750)', border: '1px solid var(--ink-500)',
                      borderRadius: 'var(--r-md)', fontSize: '0.8rem',
                    }}
                    formatter={(value, name) => [rupees(value), name]}
                  />
                </PieChart>
              </ResponsiveContainer>
              <ul className="method-list">
                {data.by_method.map((m) => (
                  <li key={m.method}>
                    <i className="swatch" style={{ background: METHOD_COLOR[m.method] || '#8d8b86' }} />
                    <span>{m.label}</span>
                    <span className="spacer" />
                    <strong>{rupees(m.amount)}</strong>
                    <span className="small muted" style={{ minWidth: 44, textAlign: 'right' }}>
                      {m.share}%
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>

      <div className="sales-grid sales-grid--split">
        <section className="card card--pad0">
          <header className="card__head"><h3>Where it came from</h3></header>
          {data.by_station_type.length === 0 ? (
            <Empty>Nothing sold in this range.</Empty>
          ) : (
            <table className="data">
              <thead>
                <tr><th>Platform</th><th>Sessions</th><th>Hours</th><th>Revenue</th></tr>
              </thead>
              <tbody>
                {data.by_station_type.map((row) => (
                  <tr key={row.station_type}>
                    <td><strong>{row.station_type}</strong></td>
                    <td>{row.sessions}</td>
                    <td>{row.hours}h</td>
                    <td><strong>{rupees(row.revenue)}</strong></td>
                  </tr>
                ))}
                {t.entry_fees_revenue > 0 && (
                  <tr>
                    <td><strong>Tournament entry fees</strong></td>
                    <td colSpan={2} className="muted small">—</td>
                    <td><strong>{rupees(t.entry_fees_revenue)}</strong></td>
                  </tr>
                )}
                {t.counter_sales_revenue > 0 && (
                  <tr>
                    <td><strong>Counter sales</strong></td>
                    <td colSpan={2} className="muted small">walk-in shop</td>
                    <td><strong>{rupees(t.counter_sales_revenue)}</strong></td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </section>

        <section className="card card--pad0">
          <header className="card__head">
            <h3>Money owed</h3>
            <span className="spacer" />
            <strong className="sales-owed">{rupees(t.outstanding)}</strong>
          </header>
          {data.outstanding_bookings.length === 0 ? (
            <Empty>Nothing outstanding. Every session is settled.</Empty>
          ) : (
            <table className="data">
              <thead>
                <tr><th>Booking</th><th>When</th><th>Owed</th><th></th></tr>
              </thead>
              <tbody>
                {data.outstanding_bookings.map((b) => (
                  <tr key={b.id}>
                    <td>
                      <strong>{b.full_name}</strong>
                      <div className="small muted mono">{b.code} · {b.phone}</div>
                    </td>
                    <td className="small nowrap">{formatDay(b.start_at)}</td>
                    <td><strong>{rupees(b.amount_due)}</strong></td>
                    <td className="actions">
                      <button className="btn btn--sm" onClick={() => setSettling({
                        id: b.id, code: b.code, full_name: b.full_name,
                        amount_due: b.amount_due, station_type_name: b.station_type, seats: 1,
                      })}>
                        Settle
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      {data.by_product?.length > 0 && (
        <section className="card card--pad0" style={{ marginTop: '1rem' }}>
          <header className="card__head">
            <h3>What sold</h3>
            <span className="spacer" />
            <span className="small muted">
              {t.units_sold} unit{t.units_sold === 1 ? '' : 's'} · {rupees(t.items_total)}
            </span>
          </header>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr><th>Item</th><th>Category</th><th>Type</th><th>Units</th><th>Revenue</th></tr>
              </thead>
              <tbody>
                {data.by_product.map((row) => (
                  <tr key={row.product}>
                    <td><strong>{row.product}</strong></td>
                    <td className="small muted">{row.category}</td>
                    <td>
                      <Pill tone={row.kind === 'rental' ? 'info' : ''}>
                        {row.kind === 'rental' ? 'Rental' : 'Consumable'}
                      </Pill>
                    </td>
                    <td>{row.units}</td>
                    <td><strong>{rupees(row.revenue)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="small muted" style={{ padding: '0.85rem 1.15rem', margin: 0 }}>
            Counts every line on a session bill and every counter sale. This overlaps
            the totals above — it answers what moved off the shelf, not what came in.
          </p>
        </section>
      )}

      <section className="card card--pad0" style={{ marginTop: '1rem' }}>
        <header className="card__head">
          <h3>Transactions</h3>
          <span className="spacer" />
          {showTxns && (
            <select value={txnMethod} onChange={(e) => setTxnMethod(e.target.value)}
              aria-label="Filter by method"
              style={{
                background: 'var(--ink-900)', border: '1px solid var(--ink-500)',
                borderRadius: 'var(--r-sm)', padding: '0.3rem 0.5rem', fontSize: '0.8rem',
              }}>
              <option value="">All methods</option>
              <option value="cash">Cash</option>
              <option value="upi">UPI</option>
              <option value="card">Card</option>
              <option value="other">Other</option>
            </select>
          )}
          <button className="btn btn--ghost btn--sm" onClick={() => setShowTxns((v) => !v)}>
            {showTxns ? 'Hide' : 'Show every line'}
          </button>
        </header>

        {showTxns && (
          txns === null ? <Loading rows={4} /> : txns.transactions.length === 0 ? (
            <Empty>No transactions in this range.</Empty>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>When</th><th>Ref</th><th>Customer</th>
                    <th>Detail</th><th>Method</th><th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {txns.transactions.map((row) => (
                    <tr key={`${row.kind}-${row.id}`}>
                      <td className="small nowrap">
                        {formatDay(row.settled_at)}
                        <div className="muted">{formatTime(row.settled_at)}</div>
                      </td>
                      <td className="mono small">{row.reference}</td>
                      <td>
                        {row.customer}
                        <div className="small muted">{row.phone}</div>
                      </td>
                      <td className="small muted">{row.detail}</td>
                      <td>
                        <Pill tone={row.method === 'cash' ? 'ok' : row.method ? 'info' : 'bad'}>
                          {row.method_label}
                        </Pill>
                      </td>
                      <td><strong>{rupees(row.amount)}</strong></td>
                    </tr>
                  ))}
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'right' }}><strong>Total</strong></td>
                    <td><strong className="sales-owed">{rupees(txns.total)}</strong></td>
                  </tr>
                </tbody>
              </table>
            </div>
          )
        )}
      </section>

      {settling && (
        <PaymentModal
          booking={settling}
          mode="settle"
          onClose={() => setSettling(null)}
          onDone={() => { setSettling(null); load() }}
        />
      )}
    </>
  )
}
