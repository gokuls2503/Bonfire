import { useResource } from '../lib/useResource'
import Crud from '../components/Crud'
import { Loading, Pill } from '../components/ui'

export default function Games() {
  const types = useResource('/admin/station-types/')
  if (types.loading) return <Loading />

  return (
    <Crud
      title="Game library"
      subtitle="What the public site advertises as installed and ready"
      path="/admin/games/"
      addLabel="Add game"
      labelOf={(g) => g.title}
      defaults={{ sort_order: 0, is_active: true, is_featured: false, platforms: [] }}
      fields={[
        { name: 'title', label: 'Title', required: true },
        { name: 'genre', label: 'Genre', hint: 'e.g. FPS, Racing, Fighting' },
        { name: 'platforms', label: 'Platforms', type: 'select', multiple: true,
          options: types.items.map((t) => ({ value: t.id, label: t.name })),
          hint: 'Hold cmd/ctrl to pick more than one.' },
        { name: 'cover', label: 'Cover art', type: 'file', hint: 'Optional. Portrait works best.' },
        { name: 'sort_order', label: 'Sort order', type: 'number' },
        { name: 'is_featured', label: 'Feature in the scrolling banner', type: 'checkbox' },
        { name: 'is_active', label: 'Show on the public site', type: 'checkbox' },
      ]}
      columns={[
        { key: 'cover', label: '', render: (g) => g.cover
          ? <img src={g.cover} alt="" style={{ width: 34, height: 44, objectFit: 'cover', borderRadius: 4 }} />
          : <span className="muted">—</span> },
        { key: 'title', label: 'Title', render: (g) => <strong>{g.title}</strong> },
        { key: 'genre', label: 'Genre', render: (g) => g.genre || '—' },
        { key: 'platform_names', label: 'Platforms', render: (g) => g.platform_names?.join(', ') || '—' },
        { key: 'is_featured', label: 'Featured', render: (g) =>
          g.is_featured ? <Pill tone="flame">Featured</Pill> : <span className="muted">—</span> },
        { key: 'is_active', label: 'Live', render: (g) =>
          <Pill tone={g.is_active ? 'ok' : 'bad'}>{g.is_active ? 'Live' : 'Hidden'}</Pill> },
      ]}
    />
  )
}
