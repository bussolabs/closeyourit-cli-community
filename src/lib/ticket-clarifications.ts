import {sanitize, sanitizeMultiline} from './output'

/**
 * The state of the clarification cycle, as the SERVER tells it (CYRA-628).
 *
 * Until now that state lived in the discussion text: an HTML marker that three repositories
 * re-parsed on their own. It was enough for the system itself to write any line — "report updated
 * to version 2" — for a reader to mistake it for an answer and restart a ticket nobody had
 * answered. Meanwhile the archive kept saying "waiting": two parts of the same product told
 * different stories about the same ticket, and the one that knew less decided.
 *
 * The round LIMIT does not appear here nor in the response: the server exposes the facts — how
 * many rounds, whether an answer arrived — and when to call a person stays the reader's policy.
 */
export function renderClarificationState(clarification: Record<string, unknown>): string {
  const rounds = Array.isArray(clarification.rounds) ? (clarification.rounds as Record<string, unknown>[]) : []
  const head = `── ${sanitize(clarification.state ?? '?')} · giri: ${sanitize(clarification.cycles ?? 0)} · risposta: ${clarification.has_reply ? 'sì' : 'no'}`
  if (rounds.length === 0) return `${head}\nNessuna domanda in corso.`

  const roundBlocks = rounds.map((round) => {
    const answered = round.answered_at ? `risposto ${sanitize(round.answered_at)}` : 'senza risposta'
    return [
      `\n· giro ${sanitize(round.cycle ?? '?')} — ${answered}`,
      sanitizeMultiline(round.questions ?? ''),
      round.response ? sanitizeMultiline(round.response) : '',
    ].filter(Boolean).join('\n')
  })
  return [head, ...roundBlocks].join('\n')
}
