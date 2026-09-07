import type { ArchiveIndexKind } from './indexes'

export type OfflineLocation = {
  section: 'objects' | ArchiveIndexKind
  entry?: string
  objectId?: string
  lot?: number
  query: string
  filter?: string
  order?: 'newest' | 'oldest' | 'lot'
  role?: 'given_by' | 'depicted' | 'mentioned'
}

export function readOfflineLocation(url: URL): OfflineLocation {
  const parts = url.pathname.split('/').filter(Boolean)
  const section = url.searchParams.get('section') ?? parts[0]
  const role = url.searchParams.get('role')
  const lot = parts[0] === 'o' ? parts[1] : url.searchParams.get('lot')
  let personId: string | undefined
  if (parts[0] === 'people' && parts[1]) { try { personId = decodeURIComponent(parts[1]) } catch {} }
  return {
    section: section === 'people' || section === 'places' || section === 'occasions' ? section : 'objects',
    entry: url.searchParams.get('entry') || personId,
    objectId: url.searchParams.get('object') || undefined,
    lot: lot && /^\d+$/.test(lot) && Number.isSafeInteger(Number(lot)) && Number(lot) > 0 ? Number(lot) : undefined,
    query: url.searchParams.get('q') ?? '',
    filter: url.searchParams.get('filter') || undefined,
    order: url.searchParams.get('order') === 'oldest' ? 'oldest' : url.searchParams.get('order') === 'lot' ? 'lot' : 'newest',
    role: role === 'given_by' || role === 'depicted' || role === 'mentioned' ? role : undefined,
  }
}

export function offlineHref(route: Partial<OfflineLocation> = {}) {
  const params = new URLSearchParams({ view: 'archive' })
  if (route.section && route.section !== 'objects') params.set('section', route.section)
  if (route.entry) params.set('entry', route.entry)
  if (route.objectId) params.set('object', route.objectId)
  else if (route.lot && Number.isSafeInteger(route.lot) && route.lot > 0) params.set('lot', String(route.lot))
  if (route.query) params.set('q', route.query)
  if (route.role) params.set('role', route.role)
  if (route.filter) params.set('filter', route.filter)
  if (route.order && route.order !== 'newest') params.set('order', route.order)
  return `/offline.html?${params}`
}
