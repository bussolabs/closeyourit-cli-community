import {renderTable, section} from './output'

/**
 * One effective guidance entry (a reference or a procedure) as resolved and returned by the
 * backend. The CLI never recomposes inheritance (CYCL-2): the hierarchy is computed server-side
 * and every attribute below is rendered as-is — `key`, `origin`, `level`, `required` and
 * `application_mode` are preserved verbatim.
 */
export interface GuidanceEntry extends Record<string, unknown> {
  key?: string
  origin?: string
  level?: string
  required?: boolean
  application_mode?: string
}

/** The effective guidance of a project: two independent, already-resolved lists. */
export interface Guidance extends Record<string, unknown> {
  references?: GuidanceEntry[]
  procedures?: GuidanceEntry[]
}

const HEADERS = ['KEY', 'ORIGIN', 'LEVEL', 'REQUIRED', 'APPLICATION_MODE']

/** A `required` flag → a human yes/no; a missing value stays '-' so the column never collapses. */
function requiredCell(value: unknown): string {
  if (value === undefined || value === null) return '-'
  return value ? 'yes' : 'no'
}

/** One entry → a table row, in the fixed order of `HEADERS` (renderTable sanitizes each cell). */
function entryRow(entry: GuidanceEntry): string[] {
  return [
    String(entry.key ?? ''),
    String(entry.origin ?? ''),
    String(entry.level ?? ''),
    requiredCell(entry.required),
    String(entry.application_mode ?? ''),
  ]
}

/** Coerce whatever the backend sent for a list into a clean array of entries. */
function entries(value: unknown): GuidanceEntry[] {
  return Array.isArray(value) ? (value as GuidanceEntry[]) : []
}

/**
 * Render one titled block (References/Procedures) as a table, or '' when the list is empty — so an
 * absent section prints nothing instead of a misleading empty header (CYCL-2, scenario 3).
 */
function renderList(title: string, icon: string, list: GuidanceEntry[]): string {
  if (list.length === 0) return ''
  return `${section(`${title} (${list.length})`, icon)}\n${renderTable(HEADERS, list.map(entryRow))}`
}

/**
 * Render the effective project guidance shared by `tickets show` and `guidance show`: references
 * first, then procedures, each skipped when empty. Returns '' when there is nothing to show, so
 * callers can print it unconditionally without a misleading section on servers where guidance is
 * absent (CYCL-2).
 */
export function renderGuidance(guidance: unknown): string {
  if (!guidance || typeof guidance !== 'object') return ''
  const value = guidance as Guidance
  return [
    renderList('References', '📚', entries(value.references)),
    renderList('Procedures', '🧭', entries(value.procedures)),
  ]
    .filter((block) => block.length > 0)
    .join('\n')
}
