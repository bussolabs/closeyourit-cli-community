import {Args} from '@oclif/core'
import {BaseCommand} from '../../base'
import {renderRecord, renderTable, sanitize, section} from '../../lib/output'

/**
 * The blocks the card opens with, in reading order, each with the heading a reader recognises.
 * Everything else the payload carries is printed after these, under a heading derived from its own
 * key: the endpoint is new (CYRA-541) and keeps growing, and a client that only knows five names
 * would drop the sixth block without ever saying so.
 */
const KNOWN_BLOCKS: Array<{icon: string; key: string; title: string}> = [
  {icon: '🔎', key: 'open_issues', title: 'Open findings'},
  {icon: '🕒', key: 'last_audit', title: 'Last run'},
  {icon: '⚡', key: 'vitals', title: 'Vitals'},
  {icon: '📦', key: 'project', title: 'Project'},
  {icon: '🌱', key: 'environment', title: 'Environment'},
]

/**
 * The known block keys, each mapped to `undefined`, to spread over the head record. `renderRecord`
 * prints a null scalar as `key: -`, so a site that was never checked (`last_audit: null`) would
 * grow a `last_audit: -` line among its settings — a block that is not there, listed as if it were
 * a setting you could change. Same trick `seo show` uses to lift `evidence` out of its head.
 */
const BLOCKS_OFF_THE_HEAD: Record<string, undefined> = Object.fromEntries(
  KNOWN_BLOCKS.map((block) => [block.key, undefined]),
)

/** A value `renderRecord`/`renderTable` can print as a cell (null included: it prints as `-`). */
function isScalar(value: unknown): boolean {
  return value === null || ['string', 'number', 'boolean'].includes(typeof value)
}

/** `recent_audits` → `Recent audits`: the heading for a block nobody taught this client about. */
function titleFromKey(key: string): string {
  const words = key.split('_').join(' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/**
 * A list of objects as a table. The columns are every scalar field the rows carry, in the order
 * they first appear: taking the shape from the first row alone would silently crop a field that
 * only the failed run has (its error). Returns '' when no row has anything printable.
 */
function renderRows(rows: Array<Record<string, unknown>>): string {
  const columns: string[] = []
  for (const row of rows) {
    for (const [key, value] of Object.entries(row)) {
      if (isScalar(value) && !columns.includes(key)) columns.push(key)
    }
  }

  if (columns.length === 0) return ''
  return renderTable(
    columns.map((column) => column.toUpperCase()),
    rows.map((row) => columns.map((column) => String(row[column] ?? ''))),
  )
}

/** The printable body of a nested block, or '' when there is nothing in it to print. */
function renderBlock(value: unknown): string {
  if (Array.isArray(value)) {
    const rows = value.filter(
      (item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item),
    )
    if (rows.length > 0) return renderRows(rows)
    // A list of plain values (enabled checks, urls) reads as one line, not as a one-column table.
    const items = value.filter((item) => isScalar(item) && item !== null)
    return items.map((item) => sanitize(item)).join(', ')
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return Object.keys(record).length > 0 ? renderRecord(record) : ''
  }

  return ''
}

export default class SeoSitesShow extends BaseCommand {
  static description = 'Show one site under SEO check: how it is set up, what is open, how the last run went and how fast it is'

  static examples = ['<%= config.bin %> seo-sites show <site-id>', '<%= config.bin %> seo-sites show <site-id> --json']

  static args = {
    id: Args.string({description: 'Site id', required: true}),
  }

  async run(): Promise<unknown> {
    const {args} = await this.parse(SeoSitesShow)
    const res = await this.api.get<Record<string, unknown>>(`/cli/v1/seo_sites/${encodeURIComponent(args.id)}`)

    if (!this.jsonEnabled()) {
      const data = res.data ?? {}
      // Configuration and cadence first: everything you would change with `seo-sites update`.
      this.log(renderRecord({...data, ...BLOCKS_OFF_THE_HEAD}))
      for (const {icon, key, title} of KNOWN_BLOCKS) this.printBlock(title, data[key], icon)

      const known = new Set(KNOWN_BLOCKS.map((block) => block.key))
      for (const [key, value] of Object.entries(data)) {
        if (known.has(key) || isScalar(value)) continue
        // The heading comes from a server-supplied key: sanitize it like every other printed
        // string (CWE-150). `section` interpolates its title raw, so this is the last stop.
        this.printBlock(sanitize(titleFromKey(key)), value)
      }
    }

    return res
  }

  /**
   * One nested block as a section of its own — or nothing at all when the payload has no such
   * block. An empty "Vitals" heading reads as "this site has no vitals measured", when it really
   * means "this server never sent them": same reason `tickets show` skips absent guidance (CYCL-2).
   */
  private printBlock(title: string, value: unknown, icon?: string): void {
    const body = renderBlock(value)
    if (!body) return
    this.log(section(title, icon))
    this.log(body)
  }
}
