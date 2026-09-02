import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import Crud from '../components/Crud'
import {
  Checkbox, Input, Loading, PageHead, Pill, Textarea, useToast,
} from '../components/ui'
import Icon from '../components/Icon'

const TABS = [
  ['brand', 'Brand & hero'],
  ['contact', 'Contact & location'],
  ['booking', 'Booking rules'],
  ['seo', 'SEO & social'],
  ['gallery', 'Gallery'],
  ['testimonials', 'Testimonials'],
  ['faqs', 'FAQs'],
]

function SettingsForm({ group }) {
  const [data, setData] = useState(null)
  const [form, setForm] = useState({})
  const [files, setFiles] = useState({})
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState({})
  const toast = useToast()

  useEffect(() => {
    api.get('/admin/site-settings/').then((res) => {
      setData(res)
      setForm(res)
    })
  }, [])

  const set = (key) => (e) =>
    setForm((f) => ({ ...f, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  const setFile = (key) => (e) => setFiles((f) => ({ ...f, [key]: e.target.files[0] }))

  const save = async (event) => {
    event.preventDefault()
    setBusy(true)
    setErrors({})
    try {
      const body = new FormData()
      for (const [key, value] of Object.entries(form)) {
        // Read-only and file fields are handled separately; sending the URL
        // string back for an ImageField would fail validation.
        if (['id', 'full_address', 'logo', 'favicon', 'hero_image', 'og_image'].includes(key)) continue
        if (typeof value === 'boolean') body.append(key, value ? 'true' : 'false')
        else if (value !== null && value !== undefined) body.append(key, value)
      }
      for (const [key, file] of Object.entries(files)) {
        if (file instanceof File) body.append(key, file)
      }
      const res = await api.upload('/admin/site-settings/', body, 'PATCH')
      setData(res)
      setForm(res)
      setFiles({})
      toast('Site content saved — the public site updates immediately')
    } catch (err) {
      setErrors(err.fields || {})
      toast(err.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  if (!data) return <Loading rows={7} />

  const ImageField = ({ name, label, hint }) => (
    <div className="field">
      <label htmlFor={name}>{label}</label>
      {data[name] && (
        <img src={data[name]} alt="" style={{
          maxWidth: 150, borderRadius: 'var(--r-md)', border: '1px solid var(--ink-600)',
          marginBottom: '0.5rem', background: 'var(--ink-900)',
        }} />
      )}
      <input id={name} type="file" accept="image/*" onChange={setFile(name)} />
      {hint && <span className="hint">{hint}</span>}
    </div>
  )

  return (
    <form className="card" onSubmit={save}>
      {group === 'brand' && (
        <>
          <div className="field-grid">
            <Input label="Brand name" name="brand_name" value={form.brand_name || ''} onChange={set('brand_name')} />
            <Input label="Tagline" name="tagline" value={form.tagline || ''} onChange={set('tagline')} />
          </div>
          <div className="field-grid">
            <ImageField name="logo" label="Logo" hint="Used in the header and footer." />
            <ImageField name="favicon" label="Favicon" hint="Browser tab icon." />
          </div>
          <hr style={{ border: 0, borderTop: '1px solid var(--ink-600)', margin: '1.25rem 0' }} />
          <Input label="Hero eyebrow" name="hero_eyebrow" value={form.hero_eyebrow || ''} onChange={set('hero_eyebrow')} />
          <Input label="Hero headline" name="hero_headline" value={form.hero_headline || ''}
            onChange={set('hero_headline')} hint="Alternate words are painted in the ember gradient." />
          <Textarea label="Hero subline" name="hero_subline" value={form.hero_subline || ''} onChange={set('hero_subline')} />
          <div className="field-grid">
            <Input label="Hero button label" name="hero_cta_label" value={form.hero_cta_label || ''}
              onChange={set('hero_cta_label')} />
          </div>
          <ImageField name="hero_image" label="Hero image" hint="Defaults to the logo if blank." />
          <hr style={{ border: 0, borderTop: '1px solid var(--ink-600)', margin: '1.25rem 0' }} />
          <Input label="About heading" name="about_heading" value={form.about_heading || ''} onChange={set('about_heading')} />
          <Textarea label="About body" name="about_body" value={form.about_body || ''}
            onChange={set('about_body')} hint="Blank line between paragraphs." />
          <hr style={{ border: 0, borderTop: '1px solid var(--ink-600)', margin: '1.25rem 0' }} />
          <Input label="Announcement banner" name="announcement" value={form.announcement || ''}
            onChange={set('announcement')} hint="e.g. 'Closed Sunday for a private event'" />
          <Checkbox label="Show the announcement banner" name="announcement_is_active"
            checked={Boolean(form.announcement_is_active)} onChange={set('announcement_is_active')} />
        </>
      )}

      {group === 'contact' && (
        <>
          <div className="field-grid">
            <Input label="Phone" name="phone" value={form.phone || ''} onChange={set('phone')} />
            <Input label="WhatsApp number" name="whatsapp" value={form.whatsapp || ''} onChange={set('whatsapp')}
              hint="Include country code, e.g. 919876543210" />
            <Input label="Email" name="email" type="email" value={form.email || ''} onChange={set('email')} />
          </div>
          <Input label="Address line 1" name="address_line1" value={form.address_line1 || ''} onChange={set('address_line1')} />
          <Input label="Address line 2" name="address_line2" value={form.address_line2 || ''} onChange={set('address_line2')} />
          <div className="field-grid">
            <Input label="City" name="city" value={form.city || ''} onChange={set('city')} />
            <Input label="State" name="state" value={form.state || ''} onChange={set('state')} />
            <Input label="PIN code" name="postal_code" value={form.postal_code || ''} onChange={set('postal_code')} />
          </div>
          <Input label="Google Maps embed URL" name="map_embed_url" type="url" value={form.map_embed_url || ''}
            onChange={set('map_embed_url')} error={errors.map_embed_url}
            hint="Google Maps → Share → Embed a map → copy the src=… URL only." />
          <Input label="Directions link" name="directions_url" type="url" value={form.directions_url || ''}
            onChange={set('directions_url')} hint="The normal Google Maps share link." />
          <hr style={{ border: 0, borderTop: '1px solid var(--ink-600)', margin: '1.25rem 0' }} />
          <div className="field-grid">
            <Input label="Instagram" name="instagram_url" type="url" value={form.instagram_url || ''} onChange={set('instagram_url')} />
            <Input label="YouTube" name="youtube_url" type="url" value={form.youtube_url || ''} onChange={set('youtube_url')} />
            <Input label="Discord" name="discord_url" type="url" value={form.discord_url || ''} onChange={set('discord_url')} />
            <Input label="X / Twitter" name="x_url" type="url" value={form.x_url || ''} onChange={set('x_url')} />
          </div>
        </>
      )}

      {group === 'booking' && (
        <>
          <Checkbox label="Accept bookings from the website" name="booking_enabled"
            checked={Boolean(form.booking_enabled)} onChange={set('booking_enabled')} />
          <p className="small muted" style={{ marginBottom: '1.25rem' }}>
            Turning this off replaces the booking page with a "call us" message. Walk-ins and
            staff-created bookings are unaffected.
          </p>
          <div className="field-grid">
            <Input label="Minimum notice (minutes)" name="booking_lead_minutes" type="number" min="0"
              value={form.booking_lead_minutes ?? ''} onChange={set('booking_lead_minutes')}
              hint="How soon before a slot someone may still book it." />
            <Input label="Booking horizon (days)" name="booking_horizon_days" type="number" min="1" max="60"
              value={form.booking_horizon_days ?? ''} onChange={set('booking_horizon_days')}
              hint="How far ahead the public may book." />
          </div>
          <Textarea label="Booking note" name="booking_note" value={form.booking_note || ''}
            onChange={set('booking_note')} hint="Shown on the booking page and the confirmation screen." />
        </>
      )}

      {group === 'seo' && (
        <>
          <Input label="Page title" name="seo_title" value={form.seo_title || ''} onChange={set('seo_title')}
            hint="Up to 70 characters. Shows in Google results and the browser tab." />
          <Textarea label="Meta description" name="seo_description" value={form.seo_description || ''}
            onChange={set('seo_description')} hint="Up to 170 characters." />
          <ImageField name="og_image" label="Social share image"
            hint="1200×630 works best. Used when the link is shared on WhatsApp or Instagram." />
        </>
      )}

      <div className="row" style={{ marginTop: '1.5rem' }}>
        <span className="spacer" />
        <button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
      </div>
    </form>
  )
}

export default function Content() {
  const [tab, setTab] = useState('brand')

  return (
    <>
      <PageHead title="Site content" subtitle="Everything on the public site you can change without a deploy">
        <a className="btn btn--ghost" href="http://localhost:5173" target="_blank" rel="noreferrer noopener">
          <Icon name="arrow" size={15} /> Preview site
        </a>
      </PageHead>

      <div className="toolbar">
        <div className="seg" style={{ flexWrap: 'wrap' }}>
          {TABS.map(([key, label]) => (
            <button key={key} className={tab === key ? 'is-active' : ''} onClick={() => setTab(key)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {['brand', 'contact', 'booking', 'seo'].includes(tab) && <SettingsForm group={tab} />}

      {tab === 'gallery' && (
        <Crud
          title="" subtitle=""
          path="/admin/gallery/"
          addLabel="Add photo"
          labelOf={(g) => g.caption || `image #${g.id}`}
          emptyText="No photos yet. Add shots of the setup, events and the space."
          defaults={{ category: 'setup', sort_order: 0, is_active: true }}
          fields={[
            { name: 'image', label: 'Photo', type: 'file', required: true },
            { name: 'caption', label: 'Caption' },
            { name: 'category', label: 'Category', type: 'select', required: true, options: [
              { value: 'setup', label: 'The setup' },
              { value: 'events', label: 'Events' },
              { value: 'squad', label: 'Squad' },
              { value: 'cafe', label: 'The space' },
            ] },
            { name: 'sort_order', label: 'Sort order', type: 'number' },
            { name: 'is_active', label: 'Show on the public site', type: 'checkbox' },
          ]}
          columns={[
            { key: 'image', label: '', render: (g) => (
              <img src={g.image} alt="" style={{ width: 64, height: 44, objectFit: 'cover', borderRadius: 4 }} />
            ) },
            { key: 'caption', label: 'Caption', render: (g) => g.caption || <span className="muted">—</span> },
            { key: 'category_display', label: 'Category' },
            { key: 'sort_order', label: 'Order' },
            { key: 'is_active', label: 'Live', render: (g) =>
              <Pill tone={g.is_active ? 'ok' : 'bad'}>{g.is_active ? 'Live' : 'Hidden'}</Pill> },
          ]}
        />
      )}

      {tab === 'testimonials' && (
        <Crud
          title="" subtitle=""
          path="/admin/testimonials/"
          addLabel="Add testimonial"
          labelOf={(t) => t.name}
          emptyText="No testimonials yet."
          defaults={{ rating: 5, sort_order: 0, is_active: true }}
          fields={[
            { name: 'name', label: 'Name', required: true },
            { name: 'handle', label: 'Handle', hint: 'e.g. @kriz.builds' },
            { name: 'avatar', label: 'Photo', type: 'file' },
            { name: 'rating', label: 'Rating (1–5)', type: 'number', min: 1, required: true },
            { name: 'quote', label: 'Quote', type: 'textarea', required: true },
            { name: 'sort_order', label: 'Sort order', type: 'number' },
            { name: 'is_active', label: 'Show on the public site', type: 'checkbox' },
          ]}
          columns={[
            { key: 'name', label: 'Name', render: (t) => (
              <>
                <strong>{t.name}</strong>
                {t.handle && <div className="small muted">{t.handle}</div>}
              </>
            ) },
            { key: 'rating', label: 'Rating', render: (t) => '★'.repeat(t.rating) },
            { key: 'quote', label: 'Quote', render: (t) => (
              <span className="small muted">{t.quote.slice(0, 90)}{t.quote.length > 90 ? '…' : ''}</span>
            ) },
            { key: 'is_active', label: 'Live', render: (t) =>
              <Pill tone={t.is_active ? 'ok' : 'bad'}>{t.is_active ? 'Live' : 'Hidden'}</Pill> },
          ]}
        />
      )}

      {tab === 'faqs' && (
        <Crud
          title="" subtitle=""
          path="/admin/faqs/"
          addLabel="Add FAQ"
          labelOf={(f) => f.question}
          emptyText="No FAQs yet."
          defaults={{ sort_order: 0, is_active: true }}
          fields={[
            { name: 'question', label: 'Question', required: true },
            { name: 'answer', label: 'Answer', type: 'textarea', required: true },
            { name: 'sort_order', label: 'Sort order', type: 'number' },
            { name: 'is_active', label: 'Show on the public site', type: 'checkbox' },
          ]}
          columns={[
            { key: 'question', label: 'Question', render: (f) => <strong>{f.question}</strong> },
            { key: 'answer', label: 'Answer', render: (f) => (
              <span className="small muted">{f.answer.slice(0, 100)}{f.answer.length > 100 ? '…' : ''}</span>
            ) },
            { key: 'sort_order', label: 'Order' },
            { key: 'is_active', label: 'Live', render: (f) =>
              <Pill tone={f.is_active ? 'ok' : 'bad'}>{f.is_active ? 'Live' : 'Hidden'}</Pill> },
          ]}
        />
      )}
    </>
  )
}
