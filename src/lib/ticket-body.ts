import {Flags} from '@oclif/core'
import {LENGTH_LIMITS, type LengthCheck} from './limits'
import {ticketLookupFlags} from './ticket-lookup'

// Ticket body flags shared by `tickets create` and `tickets update`: description (human-simple
// summary) + N BDD scenarios + N DoD conditions + technical analysis (separate technical log) +
// metadata. Scenarios are passed as JSON (--scenarios) or, for a SINGLE scenario, with the
// --step-* shorthands. DoD conditions are --condition (repeatable). Full parity with the web form.
export const ticketBodyFlags = {
  description: Flags.string({
    description: `Free-form description (human-simple summary, max ${LENGTH_LIMITS.description} characters)`,
  }),
  'technical-analysis': Flags.string({
    description: `Technical analysis (stack, cause) — kept out of the human-simple body (max ${LENGTH_LIMITS.technicalAnalysis} characters)`,
  }),
  scenarios: Flags.string({
    description: 'BDD scenarios as a JSON array: [{"title","step_given","step_when","step_then","step_expected"}]',
  }),
  'step-given': Flags.string({description: 'Shorthand for a single scenario: Given (precondition)'}),
  'step-when': Flags.string({description: 'Shorthand for a single scenario: When (action)'}),
  'step-then': Flags.string({description: 'Shorthand for a single scenario: Then (outcome)'}),
  'step-expected': Flags.string({description: 'Shorthand for a single scenario: Expected result'}),
  condition: Flags.string({description: 'Definition-of-Done line (repeatable)', multiple: true}),
  weight: Flags.string({description: 'Story points (positive integer)'}),
  'due-at': Flags.string({description: 'Due date (ISO 8601)'}),
  // Status and priority are given by code, label or id, and the command resolves them (CYCL-34).
  ...ticketLookupFlags,
  'assignee-id': Flags.string({description: 'Assignee account id'}),
  'milestone-id': Flags.string({description: 'Milestone id (of this project)'}),
  'parent-id': Flags.string({description: 'Parent epic id (of this project) — pass an empty string to detach'}),
  'platform-id': Flags.string({description: 'Affected platform id (repeatable)', multiple: true}),
}

// Fields that `tickets update` clears only when asked (`--clear <field>`): name of the flag that
// sets them → body key. Clearing them is a request of its own, never the side effect of an omitted
// field (CYCL-30). Scenarios and conditions are not here: the backend replaces them when the body
// carries new ones, leaves them intact when it omits them, and an empty array does not delete them.
export const CLEARABLE_FIELDS: Record<string, string> = {
  description: 'description',
  'technical-analysis': 'technical_analysis',
  weight: 'weight',
  'due-at': 'due_at',
  assignee: 'assignee_id',
  milestone: 'milestone_id',
  parent: 'parent_id',
  platforms: 'platform_ids',
}

export const clearFlag = {
  clear: Flags.string({
    description: `Empty a field on purpose (repeatable): ${Object.keys(CLEARABLE_FIELDS).join(', ')}`,
    multiple: true,
    options: Object.keys(CLEARABLE_FIELDS),
  }),
}

type BodyFlags = Record<string, unknown>

const STEP_KEYS: Array<[keyof typeof ticketBodyFlags, string]> = [
  ['step-given', 'step_given'],
  ['step-when', 'step_when'],
  ['step-then', 'step_then'],
  ['step-expected', 'step_expected'],
]

// Scenarios from --scenarios (JSON) OR from the --step-* shorthands (a single scenario). undefined if absent.
export function scenariosFromFlags(flags: BodyFlags): Array<Record<string, unknown>> | undefined {
  if (flags.scenarios !== undefined) {
    let parsed: unknown
    try {
      parsed = JSON.parse(flags.scenarios as string)
    } catch {
      throw new Error('--scenarios must be a valid JSON array')
    }
    if (!Array.isArray(parsed)) throw new Error('--scenarios must be a JSON array')
    return parsed as Array<Record<string, unknown>>
  }

  const scenario: Record<string, unknown> = {}
  for (const [flagKey, bodyKey] of STEP_KEYS) {
    if (flags[flagKey] !== undefined) scenario[bodyKey] = flags[flagKey]
  }

  return Object.keys(scenario).length > 0 ? [scenario] : undefined
}

// DoD conditions from --condition (repeatable). undefined if absent.
export function conditionsFromFlags(flags: BodyFlags): Array<{text: string}> | undefined {
  const conditions = flags.condition as string[] | undefined
  if (conditions === undefined) return undefined
  return conditions.map((text) => ({text}))
}

// Fills `body` with the body fields present in the flags (snake_case keys expected by the CLI API).
// Status and priority stay out: they must be resolved to ids against the organization lookups,
// i.e. with a call, and each command adds them afterwards — with or without a default (CYCL-34).
export function applyTicketBody(body: BodyFlags, flags: BodyFlags): void {
  if (flags.description !== undefined) body.description = flags.description
  if (flags['technical-analysis'] !== undefined) body.technical_analysis = flags['technical-analysis']
  if (flags.weight !== undefined) body.weight = flags.weight
  if (flags['due-at'] !== undefined) body.due_at = flags['due-at']
  if (flags['assignee-id'] !== undefined) body.assignee_id = flags['assignee-id']
  if (flags['milestone-id'] !== undefined) body.milestone_id = flags['milestone-id']
  if (flags['parent-id'] !== undefined) body.parent_id = flags['parent-id']
  if (flags['platform-id'] !== undefined) body.platform_ids = flags['platform-id']

  const scenarios = scenariosFromFlags(flags)
  if (scenarios !== undefined) body.scenarios_attributes = scenarios

  const conditions = conditionsFromFlags(flags)
  if (conditions !== undefined) body.conditions_attributes = conditions
}

/**
 * The body fields the server measures, ready for `tooLongMessage` (CYCL-32): title, description
 * and technical analysis. Scenarios and conditions are not here — they have no cap.
 *
 * `current` is the ticket as it is now, for the commands that read it before writing: it acts as a
 * safeguard, so a text written before the cap existed stays fixable as long as it does not grow.
 * Callers that do not know it omit it and the cap applies in full.
 */
export function ticketLengthChecks(flags: BodyFlags, current: BodyFlags = {}): LengthCheck[] {
  // `orthography`: the server corrects the Italian spelling of these three fields before measuring them.
  return [
    {flag: '--title', value: flags.title, max: LENGTH_LIMITS.title, previous: current.title, orthography: true},
    {
      flag: '--description',
      value: flags.description,
      max: LENGTH_LIMITS.description,
      previous: current.description,
      orthography: true,
    },
    {
      flag: '--technical-analysis',
      value: flags['technical-analysis'],
      max: LENGTH_LIMITS.technicalAnalysis,
      previous: current.technical_analysis,
      orthography: true,
    },
  ]
}

/** Marks the fields listed by `--clear` as empty: null, or an empty list for platforms. */
export function applyTicketClears(body: BodyFlags, fields: string[] | undefined): void {
  for (const field of fields ?? []) {
    const key = CLEARABLE_FIELDS[field]
    body[key] = key === 'platform_ids' ? [] : null
  }
}
