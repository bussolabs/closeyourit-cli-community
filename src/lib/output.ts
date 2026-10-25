/**
 * Neutralize terminal control sequences (CWE-150) in server-supplied strings.
 * Log/error/ticket text is attacker-influenceable; printing raw ESC (0x1B) & co.
 * to a TTY allows cursor/color/title injection. Replace every C0/C1 control char
 * (0x00–0x1F, 0x7F–0x9F) with a space — ANSI is defused, width is preserved.
 */
export function sanitize(value: unknown): string {
  let out = ''
  for (const ch of String(value ?? '')) {
    const code = ch.codePointAt(0) ?? 0
    out += code <= 0x1f || (code >= 0x7f && code <= 0x9f) ? ' ' : ch
  }

  return out
}

/**
 * Like `sanitize`, but preserves line breaks: for multi-line bodies (ticket description,
 * BDD clauses, comment text) where collapsing `\n` to spaces would destroy readability.
 * Every other C0/C1 control char is still defused per line.
 */
export function sanitizeMultiline(value: unknown): string {
  return String(value ?? '')
    .split('\n')
    .map((line) => sanitize(line))
    .join('\n')
}

// Code-point ranges that render as 2 terminal columns (CJK + emoji + symbols). Emoji like 🔴 have a
// JS `.length` of 2 while ⚪ (U+26AA) has `.length` 1 — yet both render 2-wide, so padding a column by
// `.length` misaligns rows that mix them. Measuring by code point keeps the status column square.
const WIDE_RANGES: Array<[number, number]> = [
  [0x1100, 0x115f], // Hangul Jamo
  [0x2600, 0x27bf], // Misc symbols + Dingbats (⚪ ⚫ ✅ …)
  [0x2b00, 0x2bff], // Misc symbols and arrows
  [0x2e80, 0xa4cf], // CJK & friends
  [0xac00, 0xd7a3], // Hangul syllables
  [0xf900, 0xfaff], // CJK compatibility ideographs
  [0xfe30, 0xfe4f], // CJK compatibility forms
  [0xff00, 0xff60], // Fullwidth forms
  [0xffe0, 0xffe6], // Fullwidth signs
  [0x1f000, 0x1faff], // emoji & pictographs (🔴 🟡 🟢 …)
]

/** Terminal display width of a string (wide code points count as 2, zero-width joiners/VS as 0). */
export function displayWidth(value: string): number {
  let width = 0
  for (const ch of value) {
    const cp = ch.codePointAt(0) ?? 0
    if (cp === 0x200d || (cp >= 0xfe00 && cp <= 0xfe0f) || (cp >= 0x0300 && cp <= 0x036f)) continue
    width += WIDE_RANGES.some(([lo, hi]) => cp >= lo && cp <= hi) ? 2 : 1
  }
  return width
}

/** Minimal dependency-free table renderer for human output. */
export function renderTable(headers: string[], rows: string[][]): string {
  const safeHeaders = headers.map(sanitize)
  const safeRows = rows.map((row) => row.map(sanitize))

  if (safeRows.length === 0) {
    return `${safeHeaders.join('  ')}\n(no results)`
  }
  const widths = safeHeaders.map((header, col) =>
    Math.max(displayWidth(header), ...safeRows.map((row) => displayWidth(row[col] ?? ''))),
  )
  const pad = (cell: string, col: number): string => cell + ' '.repeat(Math.max(0, widths[col] - displayWidth(cell)))
  const line = (cols: string[]): string => cols.map((cell, col) => pad(cell ?? '', col)).join('  ').trimEnd()
  const separator = widths.map((width) => '-'.repeat(width))
  return [line(safeHeaders), line(separator), ...safeRows.map(line)].join('\n')
}

/**
 * Footer line telling the reader that the human table is only one backend page of a larger set:
 * without it, page 1 reads as the whole collection and a 900-ticket project looks like 10 (CYCL-11).
 * Returns undefined when nothing more follows — a single page, the last page, or a collection already
 * aggregated by `fetchAllPages` (whose last saved meta has `page === total_pages`) — so complete
 * output stays clean. Callers gate on `!jsonEnabled()`, so machine output never sees this.
 */
export function paginationFooter(meta: unknown): string | undefined {
  if (!meta || typeof meta !== 'object') return undefined
  const {page, total, total_pages: totalPages} = meta as Record<string, unknown>
  const current = Number(page)
  const last = Number(totalPages)
  if (!Number.isInteger(current) || !Number.isInteger(last) || current < 1 || current >= last) return undefined
  const count = Number(total)
  const totalPart = Number.isFinite(count) ? ` — ${count} items total` : ''
  return `Showing page ${current} of ${last}${totalPart}. Use --page ${current + 1} to see more.`
}

/**
 * Status dots make problems scannable at a glance. Four fixed-width circles (no variation
 * selectors, so table columns stay aligned): down=🔴, warn=🟡, ok=🟢, neutral=⚪.
 */
export type StatusTone = 'down' | 'warn' | 'ok' | 'neutral'

const TONE_DOT: Record<StatusTone, string> = {
  down: '🔴',
  neutral: '⚪',
  ok: '🟢',
  warn: '🟡',
}

/**
 * Stable enum strings of the monitoring domains → tone (keys are lowercase). These come straight
 * from the model enums and never get org-renamed, so the CLI maps them without any backend help.
 * Caveats baked in: agent-run failure is `fail` (not `failed`); a paused monitor/host is neutral.
 */
const STATUS_TONE: Record<string, StatusTone> = {
  // ideas
  archived: 'neutral',
  // errors — status
  ignored: 'neutral',
  resolved: 'ok',
  unresolved: 'down',
  // errors — level
  debug: 'neutral',
  error: 'down',
  fatal: 'down',
  info: 'ok',
  warning: 'warn',
  // uptime monitor + server host
  down: 'down',
  paused: 'neutral',
  pending: 'warn',
  unknown: 'neutral',
  up: 'ok',
  // cron monitor
  late: 'warn',
  missed: 'down',
  ok: 'ok',
  // ideas
  converted: 'ok',
  open: 'warn',
  // incident phase
  detected: 'down',
  fixing: 'warn',
  investigating: 'warn',
  monitoring: 'warn',
  // agent run
  fail: 'down',
  running: 'warn',
  success: 'ok',
  // token
  active: 'ok',
  expired: 'neutral',
  revoked: 'neutral',
  // vulnerability advisory severity (GHSA scale). `unknown` is already neutral above — which is the
  // right reading: an advisory OSV didn't classify is not a severe advisory.
  critical: 'down',
  high: 'down',
  moderate: 'warn',
  low: 'neutral',
  // workload action (non-dev workload)
  planned: 'neutral',
  in_progress: 'warn',
  done: 'ok',
  cancelled: 'neutral',
  // runtime support state
  ending_soon: 'warn',
  eol: 'down',
  supported: 'ok',
  // assistant reply + async AI request (CYCL-43): `streaming`/`pending` = still being written,
  // `complete`/`done` = there is an answer, `failed` = there will not be one.
  complete: 'ok',
  failed: 'down',
  streaming: 'warn',
}

/**
 * Badge colour (Tailwind family name) → tone. Ticket status/priority labels are org-customisable,
 * so the serializer ships the badge colour as a stable token and the CLI translates it here —
 * identical to what the web badge shows. Unknown colour → falls back to the value string map.
 */
const COLOR_TONE: Record<string, StatusTone> = {
  amber: 'warn',
  emerald: 'ok',
  gray: 'neutral',
  green: 'ok',
  indigo: 'warn',
  orange: 'down',
  red: 'down',
  sky: 'ok',
  teal: 'ok',
  violet: 'warn',
}

/**
 * Status dot for a value. With `color` (a Tailwind family name) it uses the colour map — the stable
 * token for org-renamed status/priority; otherwise the monitoring string-enum map. Unknown → neutral.
 */
export function statusDot(value: unknown, color?: string): string {
  const tone =
    (color ? COLOR_TONE[color.trim().toLowerCase()] : undefined) ??
    STATUS_TONE[String(value ?? '').trim().toLowerCase()] ??
    'neutral'
  return TONE_DOT[tone]
}

/** A table cell with its status dot prefixed (the emoji survives `sanitize`). */
export function statusCell(value: unknown, color?: string): string {
  return `${statusDot(value, color)} ${value ?? ''}`
}

/** A section heading: optional emoji + title, underlined with dashes sized to the title. */
export function section(title: string, icon?: string): string {
  return `\n${icon ? `${icon} ` : ''}${title}\n${'-'.repeat(title.length)}`
}

// Record keys whose value is a status/level/phase → get a dot. Keys with a `<key>_color` sibling
// (ticket status/priority) dot by colour; the enum-string keys below dot by the string map.
const ENUM_STATUS_KEYS = new Set(['status', 'current_status', 'last_run_status', 'level', 'phase'])
// Metadata keys used only to pick a dot colour — never printed as their own line.
const HIDDEN_KEYS = new Set(['status_color', 'priority_color'])

/** The dot prefix (with trailing space) for a record line, or '' when the key isn't status-like. */
function recordDot(key: string, value: unknown, obj: Record<string, unknown>): string {
  const color = obj[`${key}_color`]
  if (typeof color === 'string' && color) return `${statusDot(value, color)} `
  if (ENUM_STATUS_KEYS.has(key)) return `${statusDot(value)} `
  return ''
}

/** Pretty-print the scalar fields of a record as `key: value` lines (status keys get a dot). */
export function renderRecord(obj: Record<string, unknown>): string {
  const lines = Object.entries(obj)
    .filter(
      ([key, value]) =>
        !HIDDEN_KEYS.has(key) && (value === null || ['string', 'number', 'boolean'].includes(typeof value)),
    )
    .map(([key, value]) => {
      if (value === null) return `${sanitize(key)}: -`
      return `${sanitize(key)}: ${recordDot(key, value, obj)}${sanitize(value)}`
    })
  return lines.length > 0 ? lines.join('\n') : JSON.stringify(obj, null, 2)
}
