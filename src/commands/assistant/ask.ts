import {Args, Flags} from '@oclif/core'
import {BaseCommand} from '../../base'
import {ErrorCodes} from '../../errors/error-codes'
import {ApiRequestError} from '../../lib/api'
import {type AssistantMessage, assistantFailure, renderToolsUsed} from '../../lib/assistant'
import {sanitizeMultiline} from '../../lib/output'
import {DEFAULT_TIMEOUT_SECONDS, pollUntil, timeoutError} from '../../lib/poll'

export default class AssistantAsk extends BaseCommand {
  // Variadic question: every positional word is joined into a single natural-language question.
  static strict = false

  static description =
    'Ask the assistant a question about your own data; it reads what you are allowed to see and answers (may take a while)'

  static examples = [
    '<%= config.bin %> assistant ask how many open tickets does acme-api have',
    '<%= config.bin %> assistant ask "what changed in the last release?" --conversation <id>',
    '<%= config.bin %> assistant ask "who is working on CYCL-43?" --timeout 60 --json',
  ]

  // Non-required: with strict = false the arg validation is off, so we guard the empty case ourselves.
  static args = {
    question: Args.string({description: 'The question (all positional words are joined)'}),
  }

  static flags = {
    conversation: Flags.string({
      char: 'c',
      description: 'Ask inside an existing conversation (keeps the context of the previous questions)',
    }),
    timeout: Flags.integer({
      description: 'Seconds to wait for the answer before giving up',
      default: DEFAULT_TIMEOUT_SECONDS,
    }),
  }

  async run(): Promise<unknown> {
    const {argv, flags} = await this.parse(AssistantAsk)
    const question = (argv as string[]).join(' ').trim()
    if (question === '') {
      this.error('Provide a question (e.g. "assistant ask how many open tickets do I have").', {exit: 2})
    }

    const invalidTimeout = timeoutError(flags.timeout)
    if (invalidTimeout) this.error(invalidTimeout, {exit: 2})

    if (!this.jsonEnabled()) this.log('Asking the assistant, this may take a while…')

    // A brand-new conversation is opened empty and titled by the server after this first question.
    const opened = flags.conversation === undefined
    const conversationId = flags.conversation ?? (await this.openConversation())

    const sent = await this.sendQuestion(conversationId, question, opened)
    const reply = sent.data ?? {}
    const messageId = reply.id
    if (typeof messageId !== 'string' || messageId === '') {
      throw new ApiRequestError(
        502,
        ErrorCodes.Ask.failed,
        'The server accepted the question without an id for its answer: there is nothing to follow.',
      )
    }

    const answered = await pollUntil<AssistantMessage>(
      async () =>
        (await this.api.get<AssistantMessage>(`/cli/v1/assistant/messages/${encodeURIComponent(messageId)}`)).data ?? {},
      (message) => message.status !== 'streaming',
      {
        initial: reply,
        timeoutMs: flags.timeout * 1000,
        timeoutMessage:
          `The assistant did not answer within ${flags.timeout}s and may still be working. ` +
          `Read the answer later with "${this.config.bin} assistant conversations show ${conversationId}".`,
      },
    )

    // A failed reply carries no text: exit non-zero saying which of the three failures it is, so a
    // script never mistakes "no answer" for an empty answer.
    if (answered.status === 'failed') {
      const failure = assistantFailure(answered.error_code)
      throw new ApiRequestError(502, failure.code, failure.message)
    }

    // Anything that is not `streaming` ended the wait, but only `complete` means there is an answer:
    // a missing or unknown status would otherwise be printed as a successful empty reply, which is
    // the one outcome a caller cannot tell apart from "the assistant had nothing to say".
    if (answered.status !== 'complete') {
      throw new ApiRequestError(
        502,
        ErrorCodes.Ask.failed,
        `The assistant reported an answer state this CLI does not know ("${answered.status ?? 'none'}"): treat the reply as missing.`,
      )
    }

    if (!this.jsonEnabled()) {
      const content = String(answered.content ?? '').trim()
      if (content !== '') this.log(sanitizeMultiline(answered.content))

      const tools = renderToolsUsed(answered.tools_used, '\n')
      if (tools !== '') this.log(tools)

      this.log(`\nConversation: ${conversationId} — keep asking with --conversation ${conversationId}`)
    }

    return {data: {...answered, conversation_id: conversationId}}
  }

  /**
   * Send the question, and if this very command opened the conversation for it, do not leave an
   * empty one behind when the send is refused (AI switched off, question too long): the backend
   * lists conversations without messages too, so the reader would find a shell with no questions
   * in it until the retention job passes. Deleting it is best-effort — the refusal is the news,
   * and a failed cleanup must never replace it.
   */
  private async sendQuestion(conversationId: string, text: string, opened: boolean) {
    try {
      return await this.api.post<AssistantMessage>(
        `/cli/v1/assistant/conversations/${encodeURIComponent(conversationId)}/messages`,
        {text},
      )
    } catch (error) {
      if (opened) {
        await this.api
          .delete(`/cli/v1/assistant/conversations/${encodeURIComponent(conversationId)}`)
          .catch(() => undefined)
      }

      throw error
    }
  }

  /** Open the conversation this question will live in, and return its id. */
  private async openConversation(): Promise<string> {
    const res = await this.api.post<{id?: string}>('/cli/v1/assistant/conversations', {title: undefined})
    const id = res.data?.id
    if (typeof id !== 'string' || id === '') {
      throw new ApiRequestError(
        502,
        ErrorCodes.Ask.failed,
        'The server opened a conversation without an id: there is nowhere to ask.',
      )
    }

    return id
  }
}
