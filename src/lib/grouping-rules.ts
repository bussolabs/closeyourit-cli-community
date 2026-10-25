/**
 * Custom error grouping rules (CYCL-44, server side CYRA-153).
 *
 * At ingest time the first active rule, in `position` order, whose match succeeds rewrites the
 * occurrence's fingerprint: everything hitting rules with the same `fingerprint_key` lands in one
 * group. This is how a team bends the automatic grouping.
 */

/** Occurrence field a rule looks at (`Errors::GroupingRule.fields`). */
export const GROUPING_RULE_FIELDS = ['exception_type', 'message', 'culprit', 'transaction'] as const

/**
 * How the field is compared (`Errors::GroupingRule.operators`). Always case-insensitive and never a
 * regular expression: on the ingest hot path a user-supplied pattern would be an open door to ReDoS.
 */
export const GROUPING_RULE_OPERATORS = ['contains', 'equals', 'starts_with'] as const

export interface GroupingRuleFlags {
  active?: boolean
  field?: string
  'fingerprint-key'?: string
  operator?: string
  position?: number
  value?: string
}

/**
 * The rule attributes to send, skipping every flag left out. `create` fills the required ones by
 * declaring them required; `update` sends only what it was told to change, so an omitted flag keeps
 * the value the rule already has instead of blanking it.
 */
export function groupingRuleBody(flags: GroupingRuleFlags): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (flags.field !== undefined) body.field = flags.field
  if (flags.operator !== undefined) body.operator = flags.operator
  if (flags.value !== undefined) body.value = flags.value
  if (flags['fingerprint-key'] !== undefined) body.fingerprint_key = flags['fingerprint-key']
  if (flags.position !== undefined) body.position = flags.position
  if (flags.active !== undefined) body.active = flags.active
  return body
}
