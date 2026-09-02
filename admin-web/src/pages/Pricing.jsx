import { useResource } from '../lib/useResource'
import { rupees, duration, timeLabel } from '../lib/format'
import Crud from '../components/Crud'
import { Loading, Pill } from '../components/ui'

export default function Pricing() {
  const types = useResource('/admin/station-types/')
  if (types.loading) return <Loading />

  const typeOptions = types.items.map((t) => ({ value: t.id, label: t.name }))
  const typeName = (id) => types.items.find((t) => t.id === id)?.name || '—'

  return (
    <Crud
      title="Pricing"
      subtitle="Rates shown on the public site and used to price bookings"
      path="/admin/pricing-plans/"
      addLabel="Add plan"
      intro="Changing a price here updates the public rates page and every new booking. Existing bookings keep the amount they were created with."
      defaults={{ duration_minutes: 60, sort_order: 0, is_active: true }}
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
      ]}
      columns={[
        { key: 'station_type', label: 'Platform', render: (p) => typeName(p.station_type) },
        { key: 'name', label: 'Plan', render: (p) => (
          <>
            <strong>{p.name}</strong>
            {p.badge && <> <Pill tone="ember">{p.badge}</Pill></>}
            {p.description && <div className="small muted">{p.description}</div>}
          </>
        ) },
        { key: 'duration_minutes', label: 'Duration', render: (p) => duration(p.duration_minutes) },
        { key: 'price', label: 'Price', render: (p) => (
          <>
            <strong>{rupees(p.price)}</strong>
            {p.compare_at_price && <s className="small muted"> {rupees(p.compare_at_price)}</s>}
          </>
        ) },
        { key: 'window', label: 'Window', render: (p) =>
          p.available_from ? `${timeLabel(p.available_from)} – ${timeLabel(p.available_to)}` : 'All day' },
        { key: 'is_active', label: 'Live', render: (p) => (
          <Pill tone={p.is_active ? 'ok' : 'bad'}>{p.is_active ? 'Live' : 'Hidden'}</Pill>
        ) },
      ]}
    />
  )
}
