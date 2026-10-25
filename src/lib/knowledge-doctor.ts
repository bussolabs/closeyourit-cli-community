import {isAbsolute, resolve, sep} from 'node:path'
import type {CliApi} from './api'
import {buildPagesQuery, truncate} from './knowledge'
import {renderTable, sanitize, statusDot} from './output'

/**
 * The knowledge health check (`cyi kb doctor`, CYCL-57).
 *
 * The checks run HERE, on the client, over the page list the service already exposes: it is the
 * same channel used today by the audit script kept outside the product
 * (`knowledge-base/scripts/audit_closeyourit_kb.rb`, which calls `cyi kb list --status all --json`),
 * and bringing it into the command is the whole point of the ticket — a check nobody runs warns
 * nobody about anything. The versioned-file check, moreover, can only run on this side: the
 * documents repo lives on the worker's disk, the service cannot see it.
 *
 * No check writes: the module reads pages and returns a report. Repairing stays an explicit act
 * of the reader, which is why every check carries the command to run — it does not run it.
 */

/** Outcome of a check. The strings are the ones `statusDot` already knows how to colour. */
export type DoctorCheckStatus = 'fail' | 'ok' | 'skipped' | 'warning'

/** A page flagged by a check: id and title to find it again, `detail` for the reason. */
export interface DoctorFinding {
  id: string
  title: string
  detail?: string
}

/** The report of a single check: what it looks at, how it went, what to do now. */
export interface DoctorCheck {
  code: string
  status: DoctorCheckStatus
  count: number
  summary: string
  next_step: string
  pages: DoctorFinding[]
}

/** A page as the service serializes it (KnowledgePageSerializer), as far as needed here. */
export interface DoctorPage extends Record<string, unknown> {
  id?: unknown
  title?: unknown
  body?: unknown
  status?: unknown
  projects?: unknown
  groups?: unknown
  source_path?: unknown
  consolidated_at?: unknown
  updated_at?: unknown
  created_at?: unknown
}

/** The full report, in the shape that ends up both on screen and in `--json`. */
export interface DoctorReport {
  scanned: number
  truncated: boolean
  stale_days: number
  checks: DoctorCheck[]
}

/**
 * The check codes, in display order: first what makes a page impossible to find, then what
 * breaks links, finally stuck queues and the documents repo. Stable codes: whoever reads the
 * outcome from a program can filter by code without chasing the text, which is for people.
 */
export const DOCTOR_CHECK_CODES = [
  'empty-body',
  'orphan-scope',
  'duplicate-title',
  'dangling-link',
  'stale-review',
  'stale-consolidation',
  'inconsistent-consolidation',
  'missing-source-file',
] as const

/** How many pages the on-screen report lists per check, before summarising the rest. */
const LISTED_PER_CHECK = 10

/** Wikilink `[[Title]]` / `[[Title|label]]`, as written on the service side (Knowledge::Links::Parse). */
const WIKILINK = /\[\[([^\n[\]|]{1,255})(?:\|[^\n[\]]{1,255})?]]/g
/** The cap on references read per page, as on the service side: a page is a document, not a graph. */
const MAX_LINKS_PER_PAGE = 50

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/**
 * The key the service uses to resolve a wikilink to a page: title trimmed at the edges,
 * lowercased (`LOWER(BTRIM(title))` in Knowledge::Links::Sync). Deliberately does NOT normalize
 * inner spaces or accents: two titles the service considers different must stay different here
 * too, or the report would flag broken links that are not broken.
 */
export function titleKey(value: unknown): string {
  return text(value).trim().toLowerCase()
}

/**
 * The markdown without its code parts: fenced blocks (``` / ~~~) and inline code spans.
 * A guide that documents the syntax by writing `[[Title]]` between backticks is not linking
 * anything, and indeed the service does not link it (Knowledge::Links::Segments).
 */
export function stripCode(markdown: string): string {
  const lines = markdown.split('\n')
  const prose: string[] = []
  let fence: string | undefined

  for (const line of lines) {
    if (fence === undefined) {
      const opening = /^ {0,3}(`{3,}|~{3,})/.exec(line)
      if (opening) {
        fence = opening[1]
        continue
      }

      prose.push(line)
    } else {
      const stripped = line.trim()
      // Only a line made of the fence's own character, at least as long as the opening, closes
      // it: `~~~` does not close a block opened with ```.
      if (stripped.length >= fence.length && new Set(stripped).size === 1 && stripped.startsWith(fence[0])) {
        fence = undefined
      }
    }
  }

  // Inline code span: N backticks, content, the same N backticks.
  return prose.join('\n').replaceAll(/(`+)[^]*?\1/g, ' ')
}

/**
 * The titles cited as wikilinks in the body, deduplicated case-insensitively and in order of
 * appearance — the same reading the service does when it builds the link graph.
 */
export function wikilinkTitles(body: unknown): string[] {
  const seen = new Set<string>()
  const titles: string[] = []
  for (const match of stripCode(text(body)).matchAll(WIKILINK)) {
    const title = match[1].trim()
    if (title === '' || seen.has(title.toLowerCase())) continue
    seen.add(title.toLowerCase())
    titles.push(title)
    if (titles.length >= MAX_LINKS_PER_PAGE) break
  }

  return titles
}

/** How many days have passed since `value`, or undefined if the service did not send a readable date. */
function daysSince(value: unknown, now: Date): number | undefined {
  const raw = text(value).trim()
  if (raw === '') return undefined
  const when = Date.parse(raw)
  if (Number.isNaN(when)) return undefined
  return (now.getTime() - when) / 86_400_000
}

/** The page's latest known date: when it was touched, or when it was born. */
function ageInDays(page: DoctorPage, now: Date): number | undefined {
  return daysSince(page.updated_at, now) ?? daysSince(page.created_at, now)
}

function finding(page: DoctorPage, detail?: string): DoctorFinding {
  return {id: String(page.id ?? ''), title: text(page.title), ...(detail === undefined ? {} : {detail})}
}

/** A check whose outcome is given by the pages found: none → passed. */
function check(code: string, summary: string, nextStep: string, pages: DoctorFinding[], failing: boolean): DoctorCheck {
  return {
    code,
    status: pages.length === 0 ? 'ok' : failing ? 'fail' : 'warning',
    count: pages.length,
    summary,
    next_step: nextStep,
    pages,
  }
}

/** A check that could not be performed: neutral outcome, and how to make it possible. */
function skipped(code: string, summary: string, nextStep: string): DoctorCheck {
  return {code, status: 'skipped', count: 0, summary, next_step: nextStep, pages: []}
}

function listLength(value: unknown): number {
  return Array.isArray(value) ? value.length : 0
}

export interface DoctorInput {
  /** The visible pages, in every status. */
  pages: DoctorPage[]
  /** The accepted pages not yet archived, as the service lists them (scope `awaiting_consolidation`). */
  awaitingConsolidation: DoctorPage[]
  /** After how many days a stuck queue is flagged. */
  staleDays: number
  now: Date
  /** The root of the versioned documents repo; absent → the file check is skipped. */
  docsRoot?: string
  /** How to check whether a file exists. Injectable so the checks stay pure and testable. */
  fileExists?: (path: string) => boolean
  /**
   * The list read is the one of ONE project. The service, however, resolves wikilinks and title
   * uniqueness across the WHOLE organization (Knowledge::Links::Sync), so from a narrowed list those
   * two checks would lie both ways: healthy links flagged as dangling because the target lives in
   * another project, and cross-project duplicates never seen.
   */
  scopedToProject?: boolean
}

/** The page has no body: there is nothing to index, no search will ever find it. */
function emptyBodyCheck(pages: DoctorPage[]): DoctorCheck {
  return check(
    'empty-body',
    'Pages whose body is empty. There is nothing to index, so no search will ever return them.',
    'Read it with `cyi kb show <id>`, then write the body with `cyi kb update <id> --body ...`.',
    pages.filter((page) => text(page.body).trim() === '').map((page) => finding(page)),
    true,
  )
}

/**
 * No project and no group. Visibility is granted per project or per group
 * (Knowledge::Page.visible_to), so a page with neither is seen ONLY by whoever has full access to
 * the organization: for everybody else it is as if it did not exist.
 *
 * A warning, not a failure: the domain allows it on purpose — Knowledge::CreatePage refuses the
 * empty scope to everyone except those with full access — and from outside there is no way to
 * know whether this page is an oversight or a choice. Flagging it as broken would make the
 * command exit with an error on healthy knowledge.
 */
function orphanScopeCheck(pages: DoctorPage[]): DoctorCheck {
  return check(
    'orphan-scope',
    'Pages attached to no project and no group. Only someone with full access to the organization can see them; for everybody else they are not there at all.',
    'Give it a scope with `cyi kb update <id> --project <key>` (or a group). Leave it as it is if the page really is meant for the whole organization.',
    pages.filter((page) => listLength(page.projects) === 0 && listLength(page.groups) === 0).map((page) => finding(page)),
    false,
  )
}

/**
 * Two pages with the same title: the service links a `[[Title]]` only when ONE page carries it,
 * so every citation of a duplicated title stays plain text.
 */
function duplicateTitleCheck(pages: DoctorPage[]): DoctorCheck {
  const byTitle = new Map<string, DoctorPage[]>()
  for (const page of pages) {
    const key = titleKey(page.title)
    if (key === '') continue
    byTitle.set(key, [...(byTitle.get(key) ?? []), page])
  }

  const found = [...byTitle.values()]
    .filter((group) => group.length > 1)
    .flatMap((group) =>
      group.map((page) =>
        finding(page, `same title as ${group.filter((other) => other !== page).map((other) => String(other.id ?? '')).join(', ')}`),
      ),
    )

  return check(
    'duplicate-title',
    'Two or more pages carry the same title. A `[[Title]]` pointing there stays plain text, because the link cannot tell which one is meant.',
    'Rename one of them with `cyi kb update <id> --title ...`, or merge them by hand and delete the leftover.',
    found,
    false,
  )
}

/**
 * Wikilinks to a title no page carries. The comparison uses the pages VISIBLE to this access:
 * the service resolves across the whole organization, so a link to a page outside one's own
 * scope shows up here while being healthy — and the report says so instead of hiding it.
 */
function danglingLinkCheck(pages: DoctorPage[]): DoctorCheck {
  const known = new Set(pages.map((page) => titleKey(page.title)).filter((key) => key !== ''))
  const found = pages.flatMap((page) => {
    const missing = wikilinkTitles(page.body).filter((title) => !known.has(title.trim().toLowerCase()))
    return missing.length === 0 ? [] : [finding(page, missing.join(', '))]
  })

  return check(
    'dangling-link',
    'Pages linking to `[[Title]]` when no visible page carries that title. Read from the titles as they are now, over the pages this access can see: a link into a project you cannot read shows up here, and so does one whose target was renamed after the link was made (the service kept that one attached).',
    'Fix the quoted title, or write the missing page — the link attaches itself as soon as the title exists.',
    found,
    false,
  )
}

/** Proposals never decided: they stay out of search, answers and panels until someone chooses. */
function staleReviewCheck(pages: DoctorPage[], staleDays: number, now: Date): DoctorCheck {
  const found = pages
    .filter((page) => page.status === 'in_review')
    .flatMap((page) => {
      const age = ageInDays(page, now)
      return age === undefined || age <= staleDays ? [] : [finding(page, `waiting ${Math.floor(age)} days`)]
    })

  return check(
    'stale-review',
    `Proposals nobody decided for more than ${staleDays} days. Until someone does, they stay out of search, answers and related panels.`,
    'Accept it with `cyi kb approve <id>` or discard it with `cyi kb reject <id>`.',
    found,
    false,
  )
}

/** Accepted but never written into the versioned documents: the knowledge lives in one place only. */
function staleConsolidationCheck(awaiting: DoctorPage[], staleDays: number, now: Date): DoctorCheck {
  const found = awaiting.flatMap((page) => {
    const age = ageInDays(page, now)
    return age === undefined || age <= staleDays ? [] : [finding(page, `accepted ${Math.floor(age)} days ago`)]
  })

  return check(
    'stale-consolidation',
    `Accepted pages not yet written to the versioned docs for more than ${staleDays} days.`,
    'Write the document in the knowledge-base repo, then record it with `cyi kb consolidate <id> --path <path>`.',
    found,
    false,
  )
}

/** Archive path and archive date must say the same thing: either both are there, or neither. */
function inconsistentConsolidationCheck(pages: DoctorPage[]): DoctorCheck {
  const found = pages.flatMap((page) => {
    const hasPath = text(page.source_path).trim() !== ''
    const hasDate = text(page.consolidated_at).trim() !== ''
    if (hasPath === hasDate) return []
    return [finding(page, hasPath ? 'path without a filing date' : 'filed without a path')]
  })

  return check(
    'inconsistent-consolidation',
    'Pages whose document path and filing date disagree: one is set and the other is not, so the filing queue cannot be trusted.',
    'Re-record the filing with `cyi kb consolidate <id> --path <path>`.',
    found,
    true,
  )
}

/**
 * Does the versioned document declared by the page really exist on disk? Without `--docs-root`
 * the check is skipped and says so: inventing an outcome on a guessed root would flag every
 * document in the fleet as missing.
 */
function missingSourceFileCheck(pages: DoctorPage[], docsRoot?: string, fileExists?: (path: string) => boolean): DoctorCheck {
  const summary = 'Pages that name a versioned document. The file has to be there, or the page points at knowledge that no longer exists.'
  if (docsRoot === undefined || fileExists === undefined) {
    return skipped(
      'missing-source-file',
      `${summary} Not checked: the docs repository lives on this machine, not on the service.`,
      'Run it again with `--docs-root <path to the knowledge-base repo>`.',
    )
  }

  const root = resolve(docsRoot)
  const found = pages.flatMap((page) => {
    const path = text(page.source_path).trim()
    if (path === '') return []
    const target = isAbsolute(path) ? resolve(path) : resolve(root, path)
    if (target !== root && !target.startsWith(root + sep)) return [finding(page, `${path} — outside the docs root`)]
    return fileExists(target) ? [] : [finding(page, path)]
  })

  return check(
    'missing-source-file',
    summary,
    'Write the missing document, or point the page at the right one with `cyi kb consolidate <id> --path <path>`.',
    found,
    true,
  )
}

/**
 * All the checks, always all of them and always in the same order: a report that stays silent on
 * the passed checks cannot be told apart from a report that did not run them.
 */
export function runDoctorChecks(input: DoctorInput): DoctorCheck[] {
  const {awaitingConsolidation, docsRoot, fileExists, now, pages, scopedToProject, staleDays} = input
  return [
    emptyBodyCheck(pages),
    orphanScopeCheck(pages),
    scopedToProject
      ? skipped(
          'duplicate-title',
          'Two or more pages carrying the same title. Not checked: titles are unique across the whole organization, and this run only read one project.',
          'Run it again without `--project` to compare every visible page.',
        )
      : duplicateTitleCheck(pages),
    scopedToProject
      ? skipped(
          'dangling-link',
          'Pages linking to `[[Title]]` when no page carries that title. Not checked: the service resolves those links across the whole organization, and this run only read one project — every link pointing outside it would look broken.',
          'Run it again without `--project` to compare every visible page.',
        )
      : danglingLinkCheck(pages),
    staleReviewCheck(pages, staleDays, now),
    staleConsolidationCheck(awaitingConsolidation, staleDays, now),
    inconsistentConsolidationCheck(pages),
    missingSourceFileCheck(pages, docsRoot, fileExists),
  ]
}

/** How many checks failed and how many only warned. */
export function doctorTotals(checks: DoctorCheck[]): {failures: number; warnings: number} {
  return {
    failures: checks.filter((entry) => entry.status === 'fail').length,
    warnings: checks.filter((entry) => entry.status === 'warning').length,
  }
}

/**
 * The on-screen report: first the table of all checks with their outcome, then a block for each
 * of those that have something to say — the explanation, the step to take and the pages.
 */
export function renderDoctorReport(report: DoctorReport): string {
  const scanned = report.truncated
    ? `${report.scanned} pages examined (the collection is larger — raise --limit to cover it)`
    : `${report.scanned} pages examined`
  const table = renderTable(
    ['STATUS', 'CHECK', 'FOUND'],
    report.checks.map((entry) => [`${statusDot(entry.status)} ${entry.status}`, entry.code, String(entry.count)]),
  )

  const blocks = report.checks
    .filter((entry) => entry.status !== 'ok')
    .map((entry) => {
      const heading = `${statusDot(entry.status)} ${sanitize(entry.code)} (${entry.count})`
      const lines = [`\n${heading}`, `  ${sanitize(entry.summary)}`, `  Next step: ${sanitize(entry.next_step)}`]
      for (const page of entry.pages.slice(0, LISTED_PER_CHECK)) {
        const detail = page.detail ? ` — ${sanitize(truncate(page.detail, 80))}` : ''
        lines.push(`  [${sanitize(page.id)}] ${sanitize(truncate(page.title))}${detail}`)
      }

      if (entry.pages.length > LISTED_PER_CHECK) lines.push(`  … and ${entry.pages.length - LISTED_PER_CHECK} more`)
      return lines.join('\n')
    })

  return [`🩺 Knowledge doctor · ${scanned}`, '', table, ...blocks].join('\n')
}

/**
 * Reads the pages to examine, stopping at `limit` rows.
 *
 * The cap exists because a check that scans the whole fleet must not be able to turn into an
 * endless scan launched inline: when it stops before the end it SAYS so (`truncated`), so the
 * report does not pass off as "all good" what it simply did not look at.
 */
export async function fetchDoctorPages(
  api: CliApi,
  opts: {limit: number; project?: string; awaitingConsolidation?: boolean},
): Promise<{pages: DoctorPage[]; truncated: boolean}> {
  const per = Math.min(100, opts.limit)
  const pages: DoctorPage[] = []
  let page = 1
  let totalPages = 1

  do {
    const query = buildPagesQuery({
      awaitingConsolidation: opts.awaitingConsolidation,
      kinds: [],
      page,
      per,
      project: opts.project,
      status: opts.awaitingConsolidation ? undefined : 'all',
    })
    // eslint-disable-next-line no-await-in-loop
    const res = await api.get<DoctorPage[]>(`/cli/v1/knowledge/pages?${query}`)
    pages.push(...(Array.isArray(res.data) ? res.data : []))
    totalPages = Number(res.meta?.total_pages ?? 1)
    page += 1
  } while (page <= totalPages && pages.length < opts.limit)

  const truncated = pages.length > opts.limit || page <= totalPages
  return {pages: pages.slice(0, opts.limit), truncated}
}
