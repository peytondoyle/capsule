/**
 * Every string here ends up in mono, uppercase and letter-spaced, because all
 * of it is data. Formatting lives in one place so "12 NOV 2019" never becomes
 * "Nov 12, 2019" on one screen and "12/11/19" on another.
 */

export type DatePrecision = 'day' | 'month' | 'year' | 'unknown'

const MONTHS = [
  'JAN',
  'FEB',
  'MAR',
  'APR',
  'MAY',
  'JUN',
  'JUL',
  'AUG',
  'SEP',
  'OCT',
  'NOV',
  'DEC',
] as const

const MONTH_NAMES = [
  'JANUARY',
  'FEBRUARY',
  'MARCH',
  'APRIL',
  'MAY',
  'JUNE',
  'JULY',
  'AUGUST',
  'SEPTEMBER',
  'OCTOBER',
  'NOVEMBER',
  'DECEMBER',
] as const

/** `received_at` is a DATE column, so parse the parts rather than let a
 *  timezone shift "01 JAN" back to the previous December. */
export function dateParts(value: string | null | undefined) {
  if (!value) return null
  const [y, m, d] = value.slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return null
  return { year: y, month: m, day: d }
}

export function monthName(month: number) {
  return MONTH_NAMES[month - 1] ?? ''
}

/** "12 NOV 2019" · "NOV 2019" · "2019" · "" — honest about how much we know. */
export function receivedLabel(
  value: string | null | undefined,
  precision: DatePrecision = 'day',
) {
  const parts = dateParts(value)
  if (!parts || precision === 'unknown') return ''
  if (precision === 'year') return String(parts.year)
  if (precision === 'month') return `${MONTHS[parts.month - 1]} ${parts.year}`
  return `${String(parts.day).padStart(2, '0')} ${MONTHS[parts.month - 1]} ${parts.year}`
}

/** Caption form under a cutout inside a month run: "09 APR". */
export function dayMonthLabel(value: string | null | undefined, precision: DatePrecision = 'day') {
  const parts = dateParts(value)
  if (!parts || precision === 'unknown') return ''
  if (precision === 'year') return String(parts.year)
  if (precision === 'month') return MONTHS[parts.month - 1] ?? ''
  return `${String(parts.day).padStart(2, '0')} ${MONTHS[parts.month - 1]}`
}

/** OBJ-0147 on paper, LOT 0147 in the vitrine. */
export function lotLabel(lotNo: number, style: 'obj' | 'lot' = 'obj') {
  const padded = String(lotNo).padStart(4, '0')
  return style === 'lot' ? `LOT ${padded}` : `OBJ-${padded}`
}

/** "2 DAYS AGO" for the rail footer. Coarse on purpose — this is a memory
 *  archive, not a feed, and "37 minutes ago" would be the wrong register. */
export function agoLabel(date: Date | null, now = new Date()) {
  if (!date) return '—'
  const days = Math.floor((now.getTime() - date.getTime()) / 86_400_000)
  if (days <= 0) return 'TODAY'
  if (days === 1) return 'YESTERDAY'
  if (days < 30) return `${days} DAYS AGO`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months} MONTH${months === 1 ? '' : 'S'} AGO`
  const years = Math.floor(days / 365)
  return `${years} YEAR${years === 1 ? '' : 'S'} AGO`
}

export function initialsOf(name: string, stored?: string | null) {
  if (stored) return stored
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

const IRREGULAR: Record<string, string> = { person: 'people' }

export function plural(n: number, noun: string) {
  if (n === 1) return noun
  return IRREGULAR[noun] ?? `${noun}s`
}

/** "412 OBJECTS · 38 PEOPLE" */
export function countLine(...pairs: Array<[number, string]>) {
  return pairs
    .map(([n, noun]) => `${n} ${plural(n, noun)}`)
    .join(' · ')
    .toUpperCase()
}
