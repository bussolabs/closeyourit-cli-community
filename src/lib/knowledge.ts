import {renderRecord, renderTable, sanitize, section} from './output'

/** Knowledge page kinds accepted by the backend (Knowledge::Page). */
export const KNOWLEDGE_KINDS = ['note', 'decision', 'guide'] as const

/**
 * Flatten a repeatable + comma-separated `--kind` flag into a clean list.
 * `--kind note --kind decision,guide` → ['note', 'decision', 'guide'].
 */
export function normalizeKinds(values?: string[]): string[] {
  if (!values) return []
  return values
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
}

/**
 * Clean a repeatable flag into a list: trimmed, empties dropped, order preserved.
 * `--tag ""` therefore means "leave nothing" — the deliberate way to clear tags on update.
 */
export function cleanList(values?: string[]): string[] {
  if (!values) return []
  return values.map((value) => value.trim()).filter((value) => value.length > 0)
}

/** Collapse whitespace and truncate a cell so the list table stays single-line. */
export function truncate(value: string, max = 60): string {
  const flat = value.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}

/**
 * Review states a page can be filtered by (Knowledge::Page#status). `all` drops the filter;
 * omitting `--status` leaves the server default, which is `published` — so an ordinary `kb list`
 * never shows proposals waiting for review.
 */
export const KNOWLEDGE_STATUSES = ['published', 'in_review', 'rejected', 'all'] as const

/**
 * Build the shared query string for `kb list` / `kb search`. Kinds go out as the
 * `kind[]` array param; `page` is always sent, the rest only when set.
 */
export function buildPagesQuery(opts: {
  kinds: string[]
  page: number
  per?: number
  project?: string
  q?: string
  related?: boolean
  status?: string
  awaitingConsolidation?: boolean
}): string {
  const query = new URLSearchParams()
  query.set('page', String(opts.page))
  if (opts.per !== undefined) query.set('per', String(opts.per))
  if (opts.project) query.set('project', opts.project)
  for (const kind of opts.kinds) query.append('kind[]', kind)
  if (opts.q) query.set('q', opts.q)
  if (opts.related) query.set('related', '1')
  if (opts.status) query.set('status', opts.status)
  if (opts.awaitingConsolidation) query.set('awaiting_consolidation', '1')
  return query.toString()
}

/** A related-page row as returned by the server (KnowledgeRelatedPageSerializer). */
export interface RelatedRow extends Record<string, unknown> {
  id?: string
  title?: string
  kind?: string
  project?: string
  via?: string
  relevance?: number | null
}

/**
 * Render the "🔗 Related" block shared by `kb show`, `kb ask` and `kb related`.
 * `via` says why the page is here (link = someone wrote it, semantic = close in meaning) and
 * `relevance` how well it matches the question, when one was asked. Empty list → empty string,
 * so callers can print it unconditionally.
 */
export function renderRelated(rows: RelatedRow[], heading = '\n🔗 Related:', indent = '  '): string {
  if (rows.length === 0) return ''

  const lines = rows.map((row) => {
    const score = typeof row.relevance === 'number' ? ` · ${row.relevance.toFixed(2)}` : ''
    return `${indent}[${sanitize(row.kind)}] ${sanitize(row.title)} · ${sanitize(row.id)} (${sanitize(row.via)}${score})`
  })
  return [heading, ...lines].join('\n')
}

/**
 * Render `kb search --with-related`: one block per result that has related pages, in the same
 * order as the table above it. Results without related pages are simply left out.
 */
export function renderRelatedGroups(
  pages: Array<Record<string, unknown>>,
  grouped: Record<string, RelatedRow[]>,
): string {
  const blocks = pages
    .map((page) => ({rows: grouped[String(page.id ?? '')] ?? [], title: String(page.title ?? '')}))
    .filter(({rows}) => rows.length > 0)
    .map(({rows, title}) => renderRelated(rows, `  ${sanitize(title)}`, '    '))

  return blocks.length === 0 ? '' : ['\n🔗 Related:', ...blocks].join('\n')
}

/**
 * Build the query string for `kb book list`. `project` goes out as the raw reference: the books
 * endpoint resolves a key or a UUID by itself (and 404s outside the scope), exactly like the pages
 * endpoint — so no extra lookup call here.
 */
export function buildBooksQuery(opts: {page: number; per?: number; project?: string; q?: string}): string {
  const query = new URLSearchParams()
  query.set('page', String(opts.page))
  if (opts.per !== undefined) query.set('per', String(opts.per))
  if (opts.project) query.set('project', opts.project)
  if (opts.q) query.set('q', opts.q)
  return query.toString()
}

/** A list of names (project keys, group names) as one cell, or undefined when there is nothing. */
function joinList(value: unknown): string | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined
  return value.map((entry) => String(entry)).join(', ')
}

/**
 * The scope lines of a page — every project it belongs to, its groups, its tags — as readable
 * `key: a, b` rows. `renderRecord` drops arrays, so without these a page connected to five projects
 * read as if it had one, and its tags were invisible from the terminal (CYCL-45).
 *
 * `projects` shows up only past the first one: with a single project the `project` line above
 * already says it, and repeating it would be noise on the pages that have always had just one.
 * Groups and tags appear whenever there are any.
 */
export function pageScopeLines(page: Record<string, unknown>): Record<string, string> {
  const lines: Record<string, string> = {}
  const projects = Array.isArray(page.projects) ? page.projects : []
  if (projects.length > 1) {
    const keys = projects.map((project) => String((project as {key?: unknown}).key ?? '')).filter(Boolean)
    if (keys.length > 0) lines.projects = keys.join(', ')
  }

  const groups = joinList(page.groups)
  if (groups) lines.groups = groups
  const tags = joinList(page.tags)
  if (tags) lines.tags = tags
  return lines
}

/**
 * Render the `kb book list` table. ID first: it is the argument of `kb book show` and of
 * `kb book add-page`, so a table without it would force `--json` just to act on what you are
 * already looking at.
 */
export function renderBooksTable(books: Array<Record<string, unknown>>): string {
  return renderTable(
    ['ID', 'TITLE', 'PAGES', 'PROJECTS', 'AUTHOR', 'UPDATED'],
    books.map((book) => [
      String(book.id ?? ''),
      truncate(String(book.title ?? '')),
      String(book.pages_count ?? ''),
      joinList(book.projects) ?? '',
      String(book.author ?? ''),
      String(book.updated_at ?? ''),
    ]),
  )
}

/**
 * Render a book with its summary: the metadata header, then the table of contents — the response
 * both `kb book show` and `kb book add-page` get back, so the reader sees the resulting order in
 * the same shape either way. `#` is the 0-based position, the very number `--position` takes.
 * Page bodies are not here on purpose: the TOC is for orientation, `kb show <page>` for reading.
 */
export function renderBook(book: Record<string, unknown>): string {
  const pages = Array.isArray(book.pages) ? (book.pages as Array<Record<string, unknown>>) : []
  const header = renderRecord({
    id: book.id,
    title: book.title,
    description: book.description,
    projects: joinList(book.projects),
    groups: joinList(book.groups),
    author: book.author,
    pages_count: book.pages_count,
    created_at: book.created_at,
    updated_at: book.updated_at,
  })
  const toc = renderTable(
    ['#', 'TITLE', 'KIND', 'PROJECT', 'ID'],
    pages.map((page) => [
      String(page.position ?? ''),
      truncate(String(page.title ?? '')),
      String(page.kind ?? ''),
      String(page.project ?? ''),
      String(page.id ?? ''),
    ]),
  )
  return [header, section('Contents', '📖'), toc].join('\n')
}

/**
 * Render the shared list/search table: TITLE, KIND, PROJECT, AUTHOR, UPDATED.
 *
 * STATUS shows up only when a row is not `published` — an ordinary listing already contains
 * nothing but published pages, so the extra column would be noise; the review queue, where the
 * state is the whole point, gets it automatically.
 */
export function renderPagesTable(pages: Array<Record<string, unknown>>): string {
  const showStatus = pages.some((page) => page.status !== undefined && page.status !== 'published')
  const headers = showStatus
    ? ['TITLE', 'KIND', 'STATUS', 'PROJECT', 'AUTHOR', 'UPDATED']
    : ['TITLE', 'KIND', 'PROJECT', 'AUTHOR', 'UPDATED']

  return renderTable(
    headers,
    pages.map((page) => {
      const row = [truncate(String(page.title ?? '')), String(page.kind ?? '')]
      if (showStatus) row.push(String(page.status ?? ''))
      row.push(String(page.project ?? ''), String(page.author ?? ''), String(page.updated_at ?? ''))
      return row
    }),
  )
}

/** One page of the knowledge context printed when a working session starts (CYCL-55). */
export interface ContextPage extends Record<string, unknown> {
  id?: string
  title?: string
  kind?: string
}

/**
 * The pages out of a knowledge-context payload, in either shape the endpoint may answer with: an
 * object carrying `pages`, or the bare list. Anything else reads as "no pages" rather than as a
 * failure — at session start an unexpected payload must not be louder than an empty one.
 */
export function contextPages(data: unknown): ContextPage[] {
  if (Array.isArray(data)) return data as ContextPage[]
  if (data && typeof data === 'object') {
    const {pages} = data as {pages?: unknown}
    if (Array.isArray(pages)) return pages as ContextPage[]
  }

  return []
}

/**
 * How to name the project in the heading: the key the server sent back when it names one, otherwise
 * the reference the caller asked with — which for a git-resolved project is already its key.
 */
export function contextProjectLabel(data: unknown, fallback: string): string {
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const {project} = data as {project?: unknown}
    if (typeof project === 'string' && project.trim() !== '') return project
    if (project && typeof project === 'object') {
      const {key, name} = project as {key?: unknown; name?: unknown}
      if (typeof key === 'string' && key.trim() !== '') return key
      if (typeof name === 'string' && name.trim() !== '') return name
    }
  }

  return fallback
}

/**
 * Render the knowledge context: one heading plus one line per page, id included so the reader can
 * go straight to `kb show <id>`. Deliberately a short list and not a table — it is printed at the
 * start of every session, where anything taller would be scrolled past instead of read.
 */
export function renderKnowledgeContext(pages: ContextPage[], project: string): string {
  const heading = `📚 Knowledge · ${sanitize(project)} (${pages.length})`
  const lines = pages.map(
    (page) => `  [${sanitize(page.kind)}] ${sanitize(truncate(String(page.title ?? '')))} · ${sanitize(page.id)}`,
  )
  return [heading, ...lines].join('\n')
}

/**
 * The same payload with at most `limit` pages, whichever shape it came in. The cap the caller asked
 * for has to hold on the JSON envelope too: the server is told `per`, but nothing guarantees the
 * context route honours it, and a machine consumer that asked for five pages must not silently get
 * ten. Everything else in the payload is preserved.
 */
export function capContextPages<T>(data: T, limit: number): T {
  if (Array.isArray(data)) return (data.length <= limit ? data : data.slice(0, limit)) as T
  if (data && typeof data === 'object') {
    const {pages} = data as {pages?: unknown}
    if (Array.isArray(pages) && pages.length > limit) return {...data, pages: pages.slice(0, limit)}
  }

  return data
}
