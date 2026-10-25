import {Args, Flags} from '@oclif/core'
import {BaseCommand} from '../../base'
import {ErrorCodes} from '../../errors/error-codes'
import {ApiRequestError} from '../../lib/api'
import {sanitize, sanitizeMultiline} from '../../lib/output'
import {DEFAULT_TIMEOUT_SECONDS, pollUntil, timeoutError} from '../../lib/poll'

/** State of the asynchronous AI request behind the question (Cli::V1::Ai::RequestsController). */
interface AiRequestState extends Record<string, unknown> {
  status?: string
  result?: {answer?: string; insufficient?: boolean; tickets?: Array<Record<string, unknown>>}
  error?: {code?: string; message?: string}
}

export default class TicketsAsk extends BaseCommand {
  // Variadic question: every positional word is joined into a single natural-language question.
  static strict = false

  static description =
    'Ask a natural-language question about the tickets you can see; the AI answers and cites the tickets it used (may take a few seconds)'

  static examples = [
    '<%= config.bin %> tickets ask what is left before the next release',
    '<%= config.bin %> tickets ask "has anyone reported this crash before?" --json',
  ]

  // Non-required: with strict = false the arg validation is off, so we guard the empty case ourselves.
  static args = {
    question: Args.string({description: 'The question (all positional words are joined)'}),
  }

  static flags = {
    timeout: Flags.integer({
      description: 'Seconds to wait for the answer before giving up',
      default: DEFAULT_TIMEOUT_SECONDS,
    }),
  }

  async run(): Promise<unknown> {
    const {argv, flags} = await this.parse(TicketsAsk)
    const question = (argv as string[]).join(' ').trim()
    if (question === '') {
      this.error('Provide a question (e.g. "tickets ask what is left before the next release").', {exit: 2})
    }

    const invalidTimeout = timeoutError(flags.timeout)
    if (invalidTimeout) this.error(invalidTimeout, {exit: 2})

    if (!this.jsonEnabled()) this.log('Asking your tickets (AI), this may take a few seconds…')

    // The question is answered elsewhere: this call only queues it and hands back the id to follow.
    const queued = await this.api.post<{request_id?: string; status?: string}>('/cli/v1/tickets/ask', {question})
    const requestId = queued.data?.request_id
    if (typeof requestId !== 'string' || requestId === '') {
      throw new ApiRequestError(
        502,
        ErrorCodes.Ask.failed,
        'The server accepted the question without a request id: there is nothing to follow.',
      )
    }

    const final = await pollUntil<AiRequestState>(
      async () =>
        (await this.api.get<AiRequestState>(`/cli/v1/ai/requests/${encodeURIComponent(requestId)}`)).data ?? {},
      (state) => state.status !== 'pending',
      {
        timeoutMs: flags.timeout * 1000,
        // Not "ask again": the question is still being worked on as request `${requestId}`, and
        // repeating it would queue a second one instead of picking that answer up. Waiting longer
        // is the way through.
        timeoutMessage:
          `No answer within ${flags.timeout}s: request ${requestId} is still being worked on. ` +
          'Ask again with a longer --timeout (asking now would queue a second question, not collect this one).',
      },
    )

    if (final.status === 'failed') {
      throw new ApiRequestError(
        502,
        final.error?.code ?? ErrorCodes.Ask.failed,
        final.error?.message ?? 'The question could not be answered (temporary problem upstream); try again in a moment.',
      )
    }

    // Anything that is not `pending` ended the wait, but only `done` carries a result: a missing or
    // unknown status would otherwise print as a successful empty answer.
    if (final.status !== 'done') {
      throw new ApiRequestError(
        502,
        ErrorCodes.Ask.failed,
        `The server reported a request state this CLI does not know ("${final.status ?? 'none'}"): treat the answer as missing.`,
      )
    }

    const result = final.result ?? {}

    if (!this.jsonEnabled()) {
      if (result.insufficient) {
        this.log('The tickets you can see do not have enough to answer this confidently.')
      }

      const answer = String(result.answer ?? '').trim()
      if (answer !== '') this.log(sanitizeMultiline(result.answer))

      // The tickets the answer stands on: an answer that names its sources can be checked, one that
      // does not asks to be believed.
      const tickets = Array.isArray(result.tickets) ? result.tickets : []
      if (tickets.length > 0) {
        this.log('\n🎫 Tickets:')
        for (const ticket of tickets) {
          this.log(`  ${sanitize(ticket.code)} · ${sanitize(ticket.title)} · ${sanitize(ticket.status_label)}`)
        }
      }
    }

    return {data: {request_id: requestId, status: final.status, result}}
  }
}
