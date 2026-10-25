/**
 * Length caps of text fields, as the server applies them (CYCL-32).
 *
 * They used to be discovered only by getting them wrong: the help did not mention them and the
 * rejection arrived after writing everything. The numbers live here — a declared copy of
 * `Knowledge::Constants`, `Ticketing::Constants` and `App::Constants::COMMENT_MAX_CHARS` — shown by
 * the flag descriptions and checked by the commands before sending, so too-long fields are all
 * found together and without calling the server.
 */
export const LENGTH_LIMITS = {
  /** Title of a ticket and of a knowledge page. */
  title: 255,
  description: 4_000,
  technicalAnalysis: 1_500,
  comment: 240,
  /** Question and answer of a ticket: two numbers and not an alias of `comment`, as on the server —
   *  the day an answer needs more room that one is raised, not the discussion cap
   *  (Ticketing::Constants::QUESTION_MAX_CHARS / ANSWER_MAX_CHARS). */
  question: 240,
  answer: 240,
  report: 20_000,
  pageBody: 4_000,
  techSpec: 1_500,
  reviewNote: 240,
} as const

/** A field to measure: the flag as the command user writes it, the value and its cap. */
export interface LengthCheck {
  flag: string
  value: unknown
  max: number
  /** Value currently on the server, when the command has read it (see `tooLongMessage`). */
  previous?: unknown
  /** Field the server corrects to Italian orthography before measuring it (see `exceeds`). */
  orthography?: boolean
}

/**
 * Characters of a text counted the way the server counts them (Ruby `String#length`, i.e. by code
 * point). JS `.length` counts UTF-16 units: an emoji or any character outside the BMP counts as two,
 * and the length shown would diverge from the one the server measures its limit on.
 */
export function charCount(value: unknown): number {
  return [...String(value ?? '')].length
}

/**
 * Length the server decides on: the text goes through its normalizations before being measured —
 * CRLF reduced to a single newline (`LengthBudget.normalize_newlines`) and edge whitespace removed
 * (`strip`). Without this a 100-line file written on Windows would "weigh" 100 characters more
 * here than there, and the command would refuse a text the server accepts.
 *
 * `trim()` is not `String#strip`: it also removes the Unicode spaces Ruby keeps (a no-break space
 * at the start of a line, for instance). It errs on the harmless side — it measures at most as much
 * as the server, never more — so at worst it lets through a call the server will reject, never the
 * opposite.
 */
export function serverLength(value: unknown): number {
  return charCount(String(value ?? '').replaceAll('\r\n', '\n').trim())
}

/**
 * How much the server's Italian spelling correction can still shorten the text (CYCL-32).
 *
 * `Text::ItalianOrthography.correct` runs on ticket fields and on the report before measuring, and
 * replaces known forms with their accented version: «gia» → «già» does not change the length,
 * «perche'» → «perché» removes one, because it absorbs the apostrophe. The dictionary does not live
 * here and must not: the maximum possible cut is anyway ONE character per apostrophe in the text.
 *
 * It avoids refusing locally what the server would accept — a text just above the cap and full of
 * apostrophes to correct fits by itself. Below that margin the measurement is left to the server.
 */
function orthographyMargin(value: string): number {
  return (value.match(/['’]/g) ?? []).length
}

/**
 * The message that lists ALL the fields over the cap, in one go — the point of the work: fixing
 * one and discovering the next on the following attempt is exactly what this function removes.
 * `undefined` when everything is fine.
 *
 * `previous` carries the server's safeguard clause (`LengthBudget`): a text already over the cap
 * stays saveable as long as it does not grow, so whoever has a page or ticket on file written before
 * the limit can still fix it and shorten it gradually. Commands that read the current state before
 * writing pass it; those that do not know it (a creation, or `--replace`) leave it out and the cap
 * applies in full.
 */
export function tooLongMessage(checks: LengthCheck[]): string | undefined {
  const over = checks.filter((check) => exceeds(check))
  if (over.length === 0) return undefined

  const list = over.map((check) => `${check.flag} is ${serverLength(check.value)} characters (max ${check.max})`)
  return `Too long for the server: ${list.join('; ')}. Shorten ${over.length === 1 ? 'it' : 'them'} and run the command again.`
}

/**
 * True only when the rejection is CERTAIN: it measures the shortest length the text can have once
 * it reaches the server (spelling correction included, where the server applies it) and accounts
 * for the safeguard on the current value. When in doubt it stays silent and the server decides.
 */
function exceeds(check: LengthCheck): boolean {
  const length = serverLength(check.value)
  const shortest = check.orthography ? length - orthographyMargin(String(check.value ?? '')) : length
  if (shortest <= check.max) return false

  const previous = serverLength(check.previous)
  return !(previous > check.max && length <= previous)
}
