import { useResource } from '../lib/useResource'
import { rupees } from '../lib/format'
import Crud from '../components/Crud'
import { Loading, Pill } from '../components/ui'

const term = (days) => {
  const d = Number(days || 0)
  if (d === 30) return 'Monthly'
  if (d === 90) return 'Quarterly'
  if (d === 365) return 'Yearly'
  return `${d} days`
}

export default function MembershipPlans() {
  const types = useResource('/admin/station-types/')
  if (types.loading) return <Loading />

  const typeOptions = types.items.map((t) => ({ value: t.id, label: t.name }))

  return (
    <Crud
      title="Membership plans"
      subtitle="The schemes you sell — rates, term length and what a member gets"
      path="/admin/membership-plans/"
      addLabel="Add plan"
      intro="Edit a scheme freely: price, term and perks only affect memberships sold from now on. Anyone already on the plan keeps the rate and benefits they paid for."
      defaults={{ duration_days: 30, discount_percent: 0, included_hours: 0, sort_order: 0, is_active: true, is_public: true }}
      labelOf={(p) => p.name || 'plan'}
      fields={[
        { name: 'name', label: 'Scheme name', required: true, hint: 'e.g. Monthly Gold' },
        { name: 'price', label: 'Price per term (₹)', type: 'number', step: '0.01', min: 0, required: true },
        { name: 'compare_at_price', label: 'Struck-through price (₹)', type: 'number', step: '0.01', nullable: true, hint: 'Optional — shows what the scheme saves.' },
        { name: 'duration_days', label: 'Term length (days)', type: 'number', min: 1, required: true, hint: '30 for a monthly scheme. 90 or 365 also work.' },
        { name: 'discount_percent', label: 'Member discount (%)', type: 'number', step: '0.01', min: 0, hint: 'Shown at the counter. Staff still apply it at checkout.' },
        { name: 'included_hours', label: 'Included hours per term', type: 'number', step: '0.5', min: 0, hint: '0 for a discount-only scheme.' },
        { name: 'station_types', label: 'Platforms covered', type: 'select', multiple: true, options: typeOptions, hint: 'Leave nothing selected to cover every platform.' },
        { name: 'description', label: 'Short description' },
        { name: 'perks', label: 'Perks', type: 'textarea', hint: 'One per line. Listed on the plan card.' },
        { name: 'badge', label: 'Badge', hint: 'e.g. Popular, Best value' },
        { name: 'sort_order', label: 'Sort order', type: 'number' },
        { name: 'is_active', label: 'Still selling this scheme', type: 'checkbox' },
        { name: 'is_public', label: 'Show on the public site', type: 'checkbox' },
      ]}
      columns={[
        { key: 'name', label: 'Scheme', render: (p) => (
          <>
            <strong>{p.name}</strong>
            {p.badge && <> <Pill tone="flame">{p.badge}</Pill></>}
            {p.description && <div className="small muted">{p.description}</div>}
          </>
        ) },
        { key: 'price', label: 'Price', render: (p) => (
          <>
            <strong>{rupees(p.price)}</strong>
            {p.compare_at_price && <s className="small muted"> {rupees(p.compare_at_price)}</s>}
          </>
        ) },
        { key: 'duration_days', label: 'Term', render: (p) => term(p.duration_days) },
        { key: 'benefits', label: 'Member gets', render: (p) => (
          <span className="small">
            {Number(p.included_hours) > 0 && <>{Number(p.included_hours)} hrs</>}
            {Number(p.included_hours) > 0 && Number(p.discount_percent) > 0 && ' · '}
            {Number(p.discount_percent) > 0 && <>{Number(p.discount_percent)}% off</>}
            {!Number(p.included_hours) && !Number(p.discount_percent) && <span className="muted">Perks only</span>}
          </span>
        ) },
        { key: 'platforms', label: 'Platforms', render: (p) => (
          <span className="small muted">
            {p.station_type_names?.length ? p.station_type_names.join(', ') : 'All'}
          </span>
        ) },
        { key: 'active_member_count', label: 'Members', render: (p) => p.active_member_count ?? 0 },
        { key: 'is_active', label: 'Status', render: (p) => (
          <>
            <Pill tone={p.is_active ? 'ok' : 'bad'}>{p.is_active ? 'Selling' : 'Retired'}</Pill>
            {p.is_active && !p.is_public && <> <Pill>Counter only</Pill></>}
          </>
        ) },
      ]}
    />
  )
}
