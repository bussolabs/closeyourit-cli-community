import {Args} from '@oclif/core'
import {ErrorCodes} from '../errors/error-codes'
import {ApiRequestError, type CliApi, type Envelope} from './api'
import {renderTable, sanitize, sanitizeMultiline, section} from './output'

/**
 * The approval queue of the member home (`/member/home/approvals`, CYCL-85): the requests waiting for
 * a human decision — agent plans, delivered work to review, questions from the agent, secret change
 * requests. The CLI downloads them and answers them with the same decisions the web page offers.
 */
export const APPROVALS_PATH = '/cli/v1/approvals'

/** The argument every single-card command takes. */
export const refArg = {
  ref: Args.string({description: 'Approval key (e.g. agent_plan:<id>) or ticket code (e.g. CYRA-12)', required: true}),
}

export const APPROVAL_STATES = [
  'awaiting_approval',
  'awaiting_autopilot_approval',
  'review_blocked',
  'review',
  'clarification',
  'secret_change',
  'waiting',
] as const

export const DECISIONS = ['approve', 'reject', 'ask', 'reply', 'reassess'] as const
export type Decision = (typeof DECISIONS)[number]

/** The phase of a stopped piece of work: there approve means "retry" and reject means "cancel". */
export const REVIEW_BLOCKED = 'review_blocked'

export interface ApprovalRow {
  key?: string
  kind?: string
  state?: string
  title?: string
  subtitle?: string | null
  code?: string | null
  project?: {key?: string; name?: string} | null
  agent?: {id?: string; name?: string} | null
  waiting_since?: string | null
  sort_at?: string
  bulk_approvable?: boolean
  deferred_until?: string | null
  path?: string
}

export interface ApprovalOption {
  label?: string
  recommended?: boolean
  reason?: string | null
}

export interface ApprovalQuestion {
  position?: number
  body?: string
  options?: ApprovalOption[]
}

export interface ApprovalDetail {
  key?: string
  kind?: string
  phase?: string | null
  decisions?: string[]
  path?: string
  ticket?: Record<string, unknown> | null
  project?: {key?: string; name?: string} | null
  plan?: {version?: unknown; markdown?: string} | null
  report?: {version?: unknown; author?: unknown; body?: string; created_at?: string} | null
  questions?: ApprovalQuestion[]
  blocked_review?: string | null
  secret_change?: Record<string, unknown> | null
}

export interface ApprovalFilters {
  state?: string
  project?: string
  agent?: string
}

/** The `<kind>/<id>` pair every endpoint of a single card is addressed by. */
export interface ApprovalTarget {
  kind: string
  id: string
}

/** Read the queue, oldest first. Not paginated: the server caps it at 500 rows. */
export function fetchApprovals(api: CliApi, filters: ApprovalFilters = {}): Promise<Envelope<ApprovalRow[]>> {
  const params = new URLSearchParams()
  if (filters.state) params.set('state', filters.state)
  if (filters.project) params.set('project', filters.project)
  if (filters.agent) params.set('agent_id', filters.agent)
  const qs = params.toString()
  return api.get<ApprovalRow[]>(qs ? `${APPROVALS_PATH}?${qs}` : APPROVALS_PATH)
}

/** True while a row is put off to tomorrow by this user: hidden unless asked for. */
export function isDeferred(row: ApprovalRow, now = Date.now()): boolean {
  if (!row.deferred_until) return false
  const until = Date.parse(row.deferred_until)
  return Number.isNaN(until) || until > now
}

/** Split a key (`agent_plan:<uuid>`) on its FIRST colon; undefined when it is not a key. */
export function parseKey(key: string): ApprovalTarget | undefined {
  const at = key.indexOf(':')
  if (at <= 0 || at === key.length - 1) return undefined
  return {kind: key.slice(0, at), id: key.slice(at + 1)}
}

/**
 * Turn what the user typed into the card it names: a key passes through, a ticket code ("CYRA-12")
 * is looked up in the queue. A code matching two cards (a plan and a review on the same ticket) is
 * refused instead of guessed: deciding the wrong one cannot be undone.
 */
export async function resolveApproval(api: CliApi, ref: string): Promise<ApprovalTarget> {
  const value = ref.trim()
  const direct = parseKey(value)
  if (direct) return direct

  const {data} = await fetchApprovals(api)
  const rows = Array.isArray(data) ? data : []
  const matches = rows.filter((row) => (row.code ?? '').toLowerCase() === value.toLowerCase())
  if (matches.length === 0) {
    throw new ApiRequestError(
      404,
      ErrorCodes.Approval.notFound,
      `No approval waiting for ${value}. Pass the key (e.g. agent_plan:<id>) or a ticket code from "approvals list".`,
    )
  }

  if (matches.length > 1) {
    const keys = matches.map((row) => row.key).join(', ')
    throw new ApiRequestError(
      409,
      ErrorCodes.Approval.ambiguous,
      `${value} has ${matches.length} approvals waiting (${keys}): pass the key of the one you mean.`,
    )
  }

  const target = parseKey(matches[0].key ?? '')
  if (!target) throw new ApiRequestError(404, ErrorCodes.Approval.notFound, `No approval waiting for ${value}.`)
  return target
}

export function approvalPath(target: ApprovalTarget): string {
  return `${APPROVALS_PATH}/${encodeURIComponent(target.kind)}/${encodeURIComponent(target.id)}`
}

export async function fetchApproval(api: CliApi, target: ApprovalTarget): Promise<ApprovalDetail> {
  try {
    return (await api.get<ApprovalDetail>(approvalPath(target))).data ?? {}
  } catch (error) {
    throw describeApprovalError(error)
  }
}

export interface DecisionBody {
  decision: Decision
  text?: string
  answers?: Record<string, string>
}

export async function sendDecision(
  api: CliApi,
  target: ApprovalTarget,
  body: DecisionBody,
): Promise<Envelope<Record<string, unknown>>> {
  try {
    return await api.post<Record<string, unknown>>(`${approvalPath(target)}/decision`, body)
  } catch (error) {
    throw describeApprovalError(error)
  }
}

export async function sendDeferral(api: CliApi, target: ApprovalTarget): Promise<Envelope<Record<string, unknown>>> {
  try {
    return await api.post<Record<string, unknown>>(`${approvalPath(target)}/deferral`)
  } catch (error) {
    throw describeApprovalError(error)
  }
}

/** The way out for each known refusal; the server message and code stay as they are. */
const APPROVAL_HINTS: Record<string, string> = {
  'R404-APPROVAL-001':
    'It may have been decided already, by you or someone else — run "approvals list" to see what is still waiting.',
  'R403-APPROVAL-001': 'This card does not offer that decision: run "approvals show" to see the ones it does.',
  'R422-APPROVAL-001': 'The server does not know that decision: run "approvals show" to see the ones this card offers.',
  'R422-APPROVAL-004': 'The server does not know that decision: run "approvals show" to see the ones this card offers.',
  'R422-APPROVAL-002': 'A rejection needs a reason that says why, so whoever did the work knows what to fix.',
  'R422-APPROVAL-003': 'Write the question or the answer: it is what reaches the other side.',
}

export function describeApprovalError(error: unknown): unknown {
  if (!(error instanceof ApiRequestError)) return error
  const hint = APPROVAL_HINTS[error.code]
  if (!hint) return error
  return new ApiRequestError(error.status, error.code, `${error.message}. ${hint}`, error.details)
}

/** Column headers of `approvals list`, in the order `approvalRow` fills them. */
export const APPROVAL_HEADERS = ['REF', 'STATE', 'TITLE', 'PROJECT', 'AGENT', 'WAITING SINCE']

/** One table row: the ticket code when there is one (what a person types), the key otherwise. */
export function approvalRow(row: ApprovalRow): string[] {
  return [
    String(row.code ?? row.key ?? ''),
    String(row.state ?? ''),
    String(row.title ?? ''),
    String(row.project?.key ?? row.project?.name ?? ''),
    String(row.agent?.name ?? ''),
    String(row.waiting_since ?? row.sort_at ?? ''),
  ]
}

export function renderApprovalTable(rows: ApprovalRow[]): string {
  return renderTable(APPROVAL_HEADERS, rows.map((row) => approvalRow(row)))
}

/** Web address of a card: the configured base URL plus the path the server gives. */
export function webUrl(baseUrl: string, path: string | undefined): string | undefined {
  if (!path) return undefined
  try {
    return new URL(path, baseUrl).toString()
  } catch {
    return undefined
  }
}

const KIND_LABELS: Record<string, string> = {
  agent_plan: 'Plan to approve',
  review: 'Work to review',
  clarification: 'Question from the agent',
  secret_change: 'Secret change request',
}

/** A field that may arrive as a plain string or as a small object (`{name}`, `{key}`, `{code}`). */
function label(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value !== 'object') return String(value)
  const obj = value as Record<string, unknown>
  return String(obj.name ?? obj.key ?? obj.code ?? obj.label ?? obj.email ?? '')
}

/** How a decision reads in this card: on a stopped review approve retries and reject cancels. */
export function decisionLabel(decision: string, phase: string | null | undefined): string {
  if (phase === REVIEW_BLOCKED && decision === 'approve') return 'approve (retry)'
  if (phase === REVIEW_BLOCKED && decision === 'reject') return 'reject (cancel the workflow)'
  return decision
}

/** The readable card: what it is, the ticket, then whatever the decision is about. */
export function renderApprovalDetail(detail: ApprovalDetail, baseUrl: string): string {
  const lines: string[] = []
  const ticket = detail.ticket ?? undefined
  const kind = KIND_LABELS[detail.kind ?? ''] ?? String(detail.kind ?? 'Approval')
  const heading = [ticket?.code, ticket?.title].filter(Boolean).map(sanitize).join(' — ')
  lines.push(`${kind}${heading ? `: ${heading}` : ''}`)
  lines.push(`Key: ${sanitize(detail.key)}`)
  if (detail.project) lines.push(`Project: ${sanitize(label(detail.project))}`)
  if (detail.phase) lines.push(`Phase: ${sanitize(detail.phase)}`)
  if (ticket?.status) lines.push(`Ticket status: ${sanitize(label(ticket.status))}`)

  if (ticket?.description) lines.push(section('Description'), sanitizeMultiline(ticket.description))
  if (ticket?.technical_analysis) lines.push(section('Technical analysis'), sanitizeMultiline(ticket.technical_analysis))
  if (detail.plan) {
    lines.push(section(`Plan${detail.plan.version ? ` (v${sanitize(detail.plan.version)})` : ''}`))
    lines.push(sanitizeMultiline(detail.plan.markdown))
  }

  if (detail.report) {
    const by = [label(detail.report.author), detail.report.created_at].filter(Boolean).map(sanitize).join(', ')
    lines.push(section(`Report${detail.report.version ? ` (v${sanitize(detail.report.version)})` : ''}`))
    if (by) lines.push(`By ${by}`)
    lines.push(sanitizeMultiline(detail.report.body))
  }

  if (detail.blocked_review) lines.push(section('Why the work stopped'), sanitizeMultiline(detail.blocked_review))
  const questions = detail.questions ?? []
  if (questions.length > 0) {
    lines.push(section('Questions'))
    for (const question of questions) lines.push(...renderQuestion(question))
  }

  if (detail.secret_change) {
    const change = detail.secret_change
    lines.push(section('Secret change'))
    for (const field of ['action', 'name', 'environment', 'project', 'requested_by', 'reason']) {
      const text = label(change[field])
      if (text) lines.push(`${field.replace('_', ' ')}: ${sanitize(text)}`)
    }
  }

  const decisions = detail.decisions ?? []
  lines.push('')
  lines.push(
    decisions.length > 0
      ? `Decisions: ${decisions.map((decision) => decisionLabel(decision, detail.phase)).join(', ')}`
      : 'Decisions: none available to you on this card.',
  )
  const url = webUrl(baseUrl, detail.path)
  if (url) lines.push(`Open on the web: ${url}`)
  return lines.join('\n')
}

function renderQuestion(question: ApprovalQuestion): string[] {
  const lines = [`${question.position ?? '?'}. ${sanitizeMultiline(question.body)}`]
  ;(question.options ?? []).forEach((option, index) => {
    lines.push(`   ${index + 1}) ${sanitize(option.label)}${option.recommended ? '  (recommended)' : ''}`)
    if (option.reason) lines.push(`      ${sanitize(option.reason)}`)
  })
  return lines
}

/**
 * Turn picks such as `1=2` (question 1, option 2) into the `answers` the server expects
 * (position → option label). Returns the error to show when a pick names nothing.
 */
export function parsePicks(
  questions: ApprovalQuestion[],
  picks: string[],
): {answers: Record<string, string>} | {error: string} {
  const answers: Record<string, string> = {}
  for (const pick of picks) {
    const match = /^\s*(\d+)\s*=\s*(\d+)\s*$/.exec(pick)
    if (!match) return {error: `Invalid pick "${pick}": use question=option, e.g. 1=2.`}
    const [, position, choice] = match
    const question = questions.find((q) => String(q.position) === position)
    if (!question) return {error: `There is no question ${position} on this card.`}
    const option = (question.options ?? [])[Number(choice) - 1]
    if (!option?.label) return {error: `Question ${position} has no option ${choice}.`}
    if (position in answers) return {error: `Question ${position} is picked twice.`}
    answers[position] = option.label
  }

  return {answers}
}

/* ---------------------------------------------------------------------------------------------
 * Interactive review: one card at a time, with the decisions the card offers plus skip, defer,
 * open and quit. The terminal is injected so tests can drive the loop.
 * ------------------------------------------------------------------------------------------- */

export interface ReviewIo {
  print(line: string): void
  /** The line typed, or null when input ended (Ctrl+D): treated as quit. */
  ask(question: string): Promise<string | null>
  open?(url: string): void
}

export interface ReviewSummary {
  approved: number
  rejected: number
  asked: number
  replied: number
  reassessed: number
  skipped: number
  deferred: number
  failed: number
  left: number
}

const MENU_KEYS: Record<Decision, string> = {approve: 'a', reject: 'r', ask: 'k', reply: 'y', reassess: 'e'}

const COUNTERS: Record<Decision, keyof ReviewSummary> = {
  approve: 'approved',
  reject: 'rejected',
  ask: 'asked',
  reply: 'replied',
  reassess: 'reassessed',
}

function menuLine(detail: ApprovalDetail, canOpen: boolean): string {
  const items = (detail.decisions ?? [])
    .filter((decision): decision is Decision => decision in MENU_KEYS)
    .map((decision) => `[${MENU_KEYS[decision]}] ${decisionLabel(decision, detail.phase)}`)
  items.push('[s] skip', '[d] defer to tomorrow')
  if (canOpen) items.push('[o] open in browser')
  items.push('[q] quit')
  return items.join('  ')
}

type Outcome = 'next' | 'menu' | 'quit'

/** Collect what a decision needs, send it; 'menu' means the user gave up on it. */
async function decide(decision: Decision, detail: ApprovalDetail, io: ReviewIo): Promise<'menu' | 'quit' | DecisionBody> {
  if (decision === 'approve') {
    const note = await io.ask('Note (optional, Enter to skip): ')
    if (note === null) return 'quit'
    return note.trim() ? {decision, text: note.trim()} : {decision}
  }

  if (decision === 'reject') {
    const reason = await io.ask('Reason (required): ')
    if (reason === null) return 'quit'
    if (!reason.trim()) {
      io.print('A rejection needs a reason: nothing sent.')
      return 'menu'
    }

    return {decision, text: reason.trim()}
  }

  if (decision === 'ask') {
    const text = await io.ask('Your question: ')
    if (text === null) return 'quit'
    if (!text.trim()) {
      io.print('Empty question: nothing sent.')
      return 'menu'
    }

    return {decision, text: text.trim()}
  }

  if (decision === 'reply') {
    let answers: Record<string, string> = {}
    const questions = detail.questions ?? []
    if (questions.some((q) => (q.options ?? []).length > 0)) {
      const picked = await io.ask('Pick proposed answers as question=option (e.g. 1=2 2=1), Enter for none: ')
      if (picked === null) return 'quit'
      const parsed = parsePicks(questions, picked.split(/[\s,]+/).filter(Boolean))
      if ('error' in parsed) {
        io.print(`${parsed.error} Nothing sent.`)
        return 'menu'
      }

      answers = parsed.answers
    }

    const text = await io.ask('Your answer (Enter to skip): ')
    if (text === null) return 'quit'
    if (!text.trim() && Object.keys(answers).length === 0) {
      io.print('Empty answer: nothing sent.')
      return 'menu'
    }

    return {
      decision,
      ...(text.trim() ? {text: text.trim()} : {}),
      ...(Object.keys(answers).length > 0 ? {answers} : {}),
    }
  }

  return {decision}
}

function errorText(error: unknown): string {
  if (error instanceof ApiRequestError) return `${error.code}: ${error.message}`
  return error instanceof Error ? error.message : String(error)
}

/** Walk the given rows one at a time; returns what was done. */
export async function reviewApprovals(
  api: CliApi,
  rows: ApprovalRow[],
  opts: {io: ReviewIo; baseUrl: string},
): Promise<ReviewSummary> {
  const {io, baseUrl} = opts
  const summary: ReviewSummary = {
    approved: 0, rejected: 0, asked: 0, replied: 0, reassessed: 0, skipped: 0, deferred: 0, failed: 0, left: 0,
  }

  for (const [index, row] of rows.entries()) {
    const target = parseKey(row.key ?? '')
    if (!target) {
      summary.failed++
      continue
    }

    io.print(`\n=== ${index + 1}/${rows.length} ===`)
    let detail: ApprovalDetail
    try {
      // eslint-disable-next-line no-await-in-loop
      detail = await fetchApproval(api, target)
    } catch (error) {
      io.print(errorText(error))
      summary.failed++
      continue
    }

    io.print(renderApprovalDetail(detail, baseUrl))
    // eslint-disable-next-line no-await-in-loop
    const outcome = await handleCard(api, target, detail, summary, opts)
    if (outcome === 'quit') {
      summary.left = rows.length - index
      break
    }
  }

  return summary
}

async function handleCard(
  api: CliApi,
  target: ApprovalTarget,
  detail: ApprovalDetail,
  summary: ReviewSummary,
  opts: {io: ReviewIo; baseUrl: string},
): Promise<Outcome> {
  const {io, baseUrl} = opts
  const url = webUrl(baseUrl, detail.path)
  const canOpen = Boolean(io.open && url)
  const offered = (detail.decisions ?? []).filter((decision): decision is Decision => decision in MENU_KEYS)

  for (;;) {
    io.print(menuLine(detail, canOpen))
    // eslint-disable-next-line no-await-in-loop
    const answer = await io.ask('Choice: ')
    if (answer === null) return 'quit'
    const key = answer.trim().toLowerCase()
    if (key === 'q') return 'quit'
    if (key === 's') {
      summary.skipped++
      return 'next'
    }

    if (key === 'o' && canOpen) {
      io.open?.(url as string)
      continue
    }

    if (key === 'd') {
      try {
        // eslint-disable-next-line no-await-in-loop
        await sendDeferral(api, target)
        io.print('Deferred: it comes back tomorrow morning.')
        summary.deferred++
      } catch (error) {
        io.print(errorText(error))
        summary.failed++
      }

      return 'next'
    }

    const decision = offered.find((d) => MENU_KEYS[d] === key)
    if (!decision) {
      io.print(`Unknown choice "${answer.trim()}".`)
      continue
    }

    // eslint-disable-next-line no-await-in-loop
    const body = await decide(decision, detail, io)
    if (body === 'quit') return 'quit'
    if (body === 'menu') continue
    try {
      // eslint-disable-next-line no-await-in-loop
      await sendDecision(api, target, body)
      io.print(`Done: ${decisionLabel(decision, detail.phase)}.`)
      summary[COUNTERS[decision]]++
    } catch (error) {
      io.print(errorText(error))
      summary.failed++
    }

    return 'next'
  }
}

/** One line such as "Approved 2 · Skipped 1 · Left 3", or a plain "Nothing done." */
export function summaryLine(summary: ReviewSummary): string {
  const parts = Object.entries(summary)
    .filter(([, count]) => count > 0)
    .map(([name, count]) => `${name[0].toUpperCase()}${name.slice(1)} ${count}`)
  return parts.length > 0 ? parts.join(' · ') : 'Nothing done.'
}
