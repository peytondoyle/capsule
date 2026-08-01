'use client'

import { useState } from 'react'

import {
  FilterRail,
  emptySelection,
  toggled,
  type Facets,
  type FilterSelection,
} from '@/app/board/filter-rail'

const FACETS: Facets = {
  people: [
    { value: 'Dad', count: 14 },
    { value: 'Nina', count: 9 },
    { value: 'Theo', count: 4 },
  ],
  places: [
    { value: 'Lisbon', count: 11 },
    { value: 'New York', count: 6 },
  ],
  years: [
    { value: '2021', count: 12 },
    { value: '2019', count: 9 },
    { value: 'undated', count: 3 },
  ],
  kinds: [
    { value: 'paper', count: 17 },
    { value: 'pin', count: 5 },
    { value: 'textile', count: 2 },
  ],
}

export function FilterRailDemo() {
  const [selected, setSelected] = useState<FilterSelection>(emptySelection)
  return (
    <FilterRail
      facets={FACETS}
      selected={selected}
      onToggle={(group, value) => setSelected((f) => toggled(f, group, value))}
      onClear={() => setSelected(emptySelection())}
    />
  )
}
