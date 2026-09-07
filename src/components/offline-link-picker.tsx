import { linkLabels, singleLink, type LinkField, type LinkReference } from '@/lib/offline/links'

export function OfflineLinkPicker({ field, selected, choices, draft, onDraft, onChange, onAdd }: {
  field: LinkField
  selected: LinkReference[]
  choices: LinkReference[]
  draft: string
  onDraft: (name: string) => void
  onChange: (refs: LinkReference[]) => void
  onAdd: () => void
}) {
  const noun = field === 'atPlace' ? 'place' : field === 'onOccasion' ? 'occasion' : field === 'tagged' ? 'tag' : field === 'inCollections' ? 'collection' : 'person'
  const options = [...choices, ...selected.filter(ref => !choices.some(choice => choice.id === ref.id))]
  return <fieldset className="border-t border-hair pt-4">
    <legend className="mn text-[9px] uppercase tracking-[0.1em] text-mute-2">{linkLabels[field]}</legend>
    <div className="max-h-52 overflow-auto">{options.map(ref => <label key={ref.id} className="flex min-h-11 items-center gap-3 text-[14px]"><input type="checkbox" className="h-5 w-5 accent-accent" checked={selected.some(item => item.id === ref.id)} onChange={event => onChange(event.target.checked ? singleLink(field) ? [ref] : [...selected, ref] : selected.filter(item => item.id !== ref.id))} /><span>{ref.name}</span></label>)}</div>
    <label className="mt-2 grid gap-1"><span className="mn text-[8px] uppercase tracking-[0.1em] text-mute-2">New {noun} · {linkLabels[field]}</span><input value={draft} maxLength={250} className="min-h-11 border-b border-hair-strong bg-transparent px-1 text-[14px] focus-visible:outline-2 focus-visible:outline-accent" onChange={event => onDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); onAdd() } }} /></label>
    <button type="button" disabled={!draft.trim()} onClick={onAdd} className="mn min-h-11 px-2 text-[9px] tracking-[0.1em] underline disabled:opacity-50">ADD {noun.toUpperCase()}</button>
    {field === 'inCollections' ? <p className="text-[12px] text-mute-2">New collections become Cabinet shelves when synced.</p> : null}
  </fieldset>
}
