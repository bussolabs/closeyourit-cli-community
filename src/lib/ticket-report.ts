import {sanitize, sanitizeMultiline} from './output'

/**
 * A version of the work report: header with metadata + the full text (CYCL-31). The body goes
 * through `sanitizeMultiline` and not `renderRecord`: the latter flattens every value with
 * `sanitize`, which turns newlines into spaces — on a report of thousands of characters that would
 * mean printing it as a wall of text on a single line.
 */
export function renderReport(report: Record<string, unknown>): string {
  const header = `── version ${sanitize(report.version ?? '?')} · ${sanitize(report.author ?? '?')} · ${sanitize(report.source ?? '-')} · ${sanitize(report.created_at ?? '-')}`
  return `${header}\n${sanitizeMultiline(report.body ?? '')}`
}
