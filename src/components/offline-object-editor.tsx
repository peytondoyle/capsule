import { useEffect, useState } from 'react'
import { editLabels, validObjectChanges, type EditField } from '@/lib/offline/edits'
import { textValue, type ArchiveRecord } from '@/lib/offline/library'
import { linkChoices, linkLabels, singleLink, sameField, type LinkField, type LinkReference } from '@/lib/offline/links'
import { OfflineLinkPicker } from './offline-link-picker'
import type { SyncSnapshot } from '@/lib/offline/types'

const inputClass = 'min-h-11 w-full border-b border-hair-strong bg-transparent px-1 text-[15px] focus-visible:outline-2 focus-visible:outline-accent'
const fields = ['title', 'kind', 'receivedAt', 'retention', 'retainedLocation', 'material', 'story'] as const

function valuesFor(record: ArchiveRecord): Record<EditField, string> {
  return Object.fromEntries([...fields, 'receivedPrecision'].map((key) => [key, textValue(record[key])])) as Record<EditField, string>
}
function canonical(values: Record<EditField, string>) {
  return Object.fromEntries(Object.entries(values).map(([field, value]) => [field, field === 'title' ? value.trim() : value || null]))
}

export function OfflineObjectEditor({ record, snapshot, onSave, onClose }: {
  record: ArchiveRecord
  snapshot: SyncSnapshot
  onSave: (expected: ArchiveRecord, changes: Record<string, unknown>) => Promise<void>
  onClose: () => void
}) {
  const [initial] = useState(record)
  const [values, setValues] = useState(() => valuesFor(record))
  const [links, setLinks] = useState(() => Object.fromEntries(Object.keys(linkLabels).map(field => [field, (record[field] ?? []) as LinkReference[]])) as Record<LinkField, LinkReference[]>)
  const [drafts, setDrafts] = useState<Partial<Record<LinkField, string>>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const dirty = JSON.stringify(canonical(values)) !== JSON.stringify(canonical(valuesFor(initial))) || Object.keys(linkLabels).some(field => !sameField(field, links[field as LinkField], initial[field])) || Object.values(drafts).some(value => !!value?.trim())
  useEffect(() => {
    const leave = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault() }
    window.addEventListener('beforeunload', leave)
    return () => window.removeEventListener('beforeunload', leave)
  }, [dirty])

  function added(field: LinkField, selected = links[field]) {
    const name = drafts[field]?.trim()
    if (!name) return selected
    const ref = [...selected, ...linkChoices(snapshot, field)].find(item => item.name.toLocaleLowerCase() === name.toLocaleLowerCase()) ?? { id: crypto.randomUUID(), name, create: true as const }
    if (singleLink(field)) return [ref]
    return selected.some(item => item.id === ref.id) ? selected : [...selected, ref]
  }
  function add(field: LinkField) {
    setLinks(current => ({ ...current, [field]: added(field, current[field]) }))
    setDrafts(current => ({ ...current, [field]: '' }))
  }

  async function save(event: React.FormEvent) {
    event.preventDefault()
    const selected = Object.fromEntries(Object.keys(linkLabels).map(field => [field, added(field as LinkField)])) as Record<LinkField, LinkReference[]>
    setLinks(selected); setDrafts({})
    const next = { ...canonical(values), ...selected }, previous = { ...initial, ...canonical(valuesFor(initial)) }
    const changes = Object.fromEntries(Object.entries(next).filter(([field, value]) => !sameField(field, value, previous[field])))
    if (!validObjectChanges(changes)) { setError('Check the title, received date, and selected names before saving.'); return }
    setSaving(true); setError('')
    try { await onSave(initial, changes); onClose() }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'The changes could not be saved. Your text is still here.') }
    finally { setSaving(false) }
  }
  return <form onSubmit={(event) => { void save(event) }} className="mt-6 border-t border-hair pt-5">
    <h2 className="text-[20px] font-semibold tracking-tight">Edit this object.</h2>
    <p className="mt-2 text-[13px] text-mute-2">Changes are saved on this device before syncing.</p>
    <fieldset disabled={saving} className="mt-5 grid gap-4">{fields.map((field) => <label key={field} className="grid gap-1">
      <span className="mn text-[9px] uppercase tracking-[0.1em] text-mute-2">{editLabels[field]}</span>
      {field === 'story' ? <textarea className={`${inputClass} min-h-32 py-2`} value={values.story} maxLength={20000} onChange={(event) => setValues((current) => ({ ...current, story: event.target.value }))} /> : field === 'retention' ? <select className={inputClass} value={values.retention} onChange={(event) => setValues((current) => ({ ...current, retention: event.target.value }))}><option value="retained">Still have it</option><option value="digital_only">Only here now</option></select> : <input className={inputClass} required={field === 'title'} type={field === 'receivedAt' ? 'date' : 'text'} maxLength={250} min={field === 'receivedAt' ? '0001-01-01' : undefined} max={field === 'receivedAt' ? '9999-12-31' : undefined} value={values[field]} onChange={(event) => setValues((current) => ({ ...current, [field]: event.target.value, ...(field === 'receivedAt' ? { receivedPrecision: event.target.value ? 'day' : 'unknown' } : {}) }))} />}
    </label>)}{(Object.keys(linkLabels) as LinkField[]).map(field => <OfflineLinkPicker key={field} field={field} selected={links[field]} choices={linkChoices(snapshot, field)} draft={drafts[field] ?? ''} onDraft={name => setDrafts(current => ({ ...current, [field]: name }))} onChange={refs => setLinks(current => ({ ...current, [field]: refs }))} onAdd={() => add(field)} />)}</fieldset>
    {error ? <p role="alert" className="mt-4 text-[13px] leading-relaxed text-accent">{error}</p> : null}
    <div className="mt-5 flex gap-4"><button type="submit" disabled={saving} className="mn min-h-11 bg-ink px-4 text-[9px] tracking-[0.1em] text-bg disabled:opacity-50">{saving ? 'SAVING…' : 'SAVE ON DEVICE'}</button><button type="button" disabled={saving} className="mn min-h-11 px-2 text-[9px] tracking-[0.1em] underline" onClick={() => { if (!dirty || window.confirm('Leave without saving these edits?')) onClose() }}>CANCEL</button></div>
  </form>
}
