import {Args} from '@oclif/core'

import {BaseCommand, projectFlag} from '../../../base'
import {sanitize, sanitizeMultiline} from '../../../lib/output'

/** A question as `QuestionSerializer` serves it, with its answers alongside. */
interface Question {
  id?: unknown
  body?: unknown
  state?: unknown
  blocking?: unknown
  audience?: unknown
  author?: unknown
  closed_by?: unknown
  created_at?: unknown
  answers?: Array<{id?: unknown; body?: unknown; author?: unknown; created_at?: unknown}>
  options?: Array<{label?: unknown; recommended?: unknown; reason?: unknown}>
}

export default class TicketsQuestionsList extends BaseCommand {
  static args = {
    id: Args.string({description: 'Ticket id or code (e.g. CYRA-783)', required: true}),
  }

  static description =
    'List the questions of a ticket (oldest first), each with the answers that belong to it'

  static examples = [
    '<%= config.bin %> tickets questions list CYRA-783 --project closeyourit-rails',
    '<%= config.bin %> tickets questions list CYRA-783 -p closeyourit-rails --json',
  ]

  static flags = {...projectFlag}

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(TicketsQuestionsList)
    const projectId = await this.resolveProjectId(flags.project)
    const base = `/cli/v1/projects/${encodeURIComponent(projectId)}/tickets/${encodeURIComponent(args.id)}/questions`

    // Like comments: all pages are read, because half a discussion is worse than none — an open
    // question left on the second page reads as "it was not there".
    const all: Question[] = []
    let page = 1
    let totalPages = 1
    do {
      // eslint-disable-next-line no-await-in-loop
      const res = await this.api.get<Question[]>(`${base}?page=${page}&per=100`)
      all.push(...(res.data ?? []))
      totalPages = Number(res.meta?.total_pages ?? 1)
      page += 1
    } while (page <= totalPages)

    if (!this.jsonEnabled()) {
      if (all.length === 0) {
        this.log('(nessuna domanda)')
      } else {
        for (const question of all) this.log(renderQuestion(question))
      }
    }

    return {data: all}
  }
}

/**
 * One question per block, not a table row: the text is as long as a comment and the answers
 * belong to it — flattening them into cells would break exactly the link this view exists to make
 * explicit (the flaw of comments, where the answer was "the next message").
 */
function renderQuestion(question: Question): string {
  const lines = [
    `\n── ${sanitize(question.id ?? '')} · ${sanitize(question.state ?? '')}${badges(question)}`,
    `   ${sanitize(question.author ?? '?')} · ${sanitize(question.created_at ?? '')}`,
    sanitizeMultiline(question.body ?? ''),
  ]

  // CYRA-1033 — numbered as `answer --choice` takes them.
  for (const [index, option] of (question.options ?? []).entries()) {
    const recommended = option.recommended === true
      ? ` (consigliata${option.reason ? `: ${sanitize(option.reason)}` : ''})`
      : ''
    lines.push(`   ${index + 1}. ${sanitize(option.label ?? '')}${recommended}`)
  }

  for (const answer of question.answers ?? []) {
    lines.push(`   ↳ ${sanitize(answer.author ?? '?')} · ${sanitize(answer.created_at ?? '')} · ${sanitize(answer.id ?? '')}`)
    lines.push(`     ${sanitizeMultiline(answer.body ?? '')}`)
  }

  return lines.join('\n')
}

/**
 * `blocking` alone does not say the ticket is stuck: it is as long as the question stays OPEN. The
 * same distinction the serializer makes when computing `state`, repeated here because it is the
 * reason a ticket does not start and whoever reads the list must see it without crossing two fields.
 */
function badges(question: Question): string {
  const marks: string[] = []
  if (question.blocking === true && question.state === 'open') marks.push('blocca il lavoro')
  else if (question.blocking === true) marks.push('era bloccante')

  if (question.audience === 'shared') marks.push('condivisa')
  return marks.length > 0 ? ` · ${marks.join(' · ')}` : ''
}
