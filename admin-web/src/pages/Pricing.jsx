import { useState } from 'react'
import { useResource } from '../lib/useResource'
import { rupees, duration, timeLabel } from '../lib/format'
import Crud from '../components/Crud'
import ControllerRates from './ControllerRates'
import { Loading, Pill } from '../components/ui'

export default function Pricing() {
  const types = useResource('/admin/station-types/')
  const [editingRates, setEditingRates] = useState(null)
  // Bumping this remounts the table, which is how it picks up rate changes
  // made in the modal — Crud owns its own fetch.
  const [version, setVersion] = useState(0)

  if (types.loading) return <Loading />

  const typeOptions = types.items.map((t) => ({ value: t.id, label: t.name }))
  const typeOf = (id) => types.items.find((t) => t.id === id)
  const typeName = (id) => typeOf(id)?.name || '—'

  return (
    <>
    <Crud
      key={version}
      title="Pricing"
      subtitle="Rates shown on the public site and used to price bookings"
      path="/admin/pricing-plans/"
      addLabel="Add plan"
      intro="Changing a price here updates the public rates page and every new booking. Existing bookings keep the amount they were created with. A rate can be shown on the site without being bookable online — that is how happy hour stays a walk-in deal."
      defaults={{ duration_minutes: 60, sort_order: 0, is_active: true, is_bookable: true }}
      labelOf={(p) => p.name || 'plan'}
      fields={[
        { name: 'station_type', label: 'Platform', type: 'select', options: typeOptions, required: true },
        { name: 'name', label: 'Plan name', required: true, hint: 'e.g. 1 Hour, Happy Hour, 5-Hour Pack' },
        { name: 'duration_minutes', label: 'Duration (minutes)', type: 'number', min: 15, required: true },
        { name: 'price', label: 'Price (₹)', type: 'number', step: '0.01', min: 0, required: true },
        { name: 'compare_at_price', label: 'Struck-through price (₹)', type: 'number', step: '0.01', nullable: true, hint: 'Optional — shows a discount.' },
        { name: 'badge', label: 'Badge', hint: 'e.g. Popular, Best value' },
        { name: 'description', label: 'Short description' },
        { name: 'available_from', label: 'Available from', type: 'time', nullable: true, hint: 'Happy-hour window start. Leave blank for all day.' },
        { name: 'available_to', label: 'Available to', type: 'time', nullable: true },
        { name: 'sort_order', label: 'Sort order', type: 'number' },
        { name: 'is_active', label: 'Show on the public site', type: 'checkbox' },
        { name: 'is_bookable', label: 'Offer it in online booking', type: 'checkbox', hint: 'Uncheck for a rate you advertise but only sell at the counter, like happy hour.' },
      ]}
      columns={[
        { key: 'station_type', label: 'Platform', render: (p) => typeName(p.station_type) },
        { key: 'name', label: 'Plan', render: (p) => (
          <>
            <strong>{p.name}</strong>
            {p.badge && <> <Pill tone="flame">{p.badge}</Pill></>}
            {p.description && <div className="small muted">{p.description}</div>}
          </>
        ) },
        { key: 'duration_minutes', label: 'Duration', render: (p) => duration(p.duration_minutes) },
        { key: 'price', label: 'Price', render: (p) => (
          typeOf(p.station_type)?.prices_per_controller ? (
            <span className="small muted">see per-controller</span>
          ) : (
            <>
              <strong>{rupees(p.price)}</strong>
              {p.compare_at_price && <s className="small muted"> {rupees(p.compare_at_price)}</s>}
            </>
          )
        ) },
        { key: 'window', label: 'Window', render: (p) =>
          p.available_from ? `${timeLabel(p.available_from)} – ${timeLabel(p.available_to)}` : 'All day' },
        { key: 'controller_rates', label: 'Per controller', render: (p) => {
          const type = typeOf(p.station_type)
          if (!type?.prices_per_controller) return <span className="small muted">—</span>
          const rates = p.controller_rates || []
          return (
            <>
              <div className="small">
                {rates.length
                  ? rates.map((r) => `${r.controllers}: ${rupees(r.price_per_controller)}`).join(' · ')
                  : <span className="muted">not set</span>}
              </div>
              <button className="btn btn--ghost btn--sm" style={{ marginTop: '0.35rem' }}
                onClick={() => setEditingRates({ plan: p, type })}>
                Edit rates
              </button>
            </>
          )
        } },
        { key: 'is_active', label: 'Live', render: (p) => (
          <>
            <Pill tone={p.is_active ? 'ok' : 'bad'}>{p.is_active ? 'Live' : 'Hidden'}</Pill>
            {p.is_active && p.is_bookable === false && (
              <div className="small muted">counter only</div>
            )}
          </>
        ) },
      ]}
    />

    {editingRates && (
      <ControllerRates
        plan={{ ...editingRates.plan, station_type_name: editingRates.type.name }}
        maxControllers={editingRates.type.max_players_per_station || 4}
        onClose={() => setEditingRates(null)}
        onSaved={() => { setEditingRates(null); setVersion((v) => v + 1) }}
      />
    )}
    </>
  )
}
