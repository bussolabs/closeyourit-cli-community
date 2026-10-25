import {ErrorCodes} from '../errors/error-codes'
import {renderTable, sanitize, sanitizeMultiline, statusDot} from './output'

/** A message of an assistant conversation, as the backend serializes it (AssistantMessageSerializer). */
export interface AssistantMessage extends Record<string, unknown> {
  id?: string
  role?: string
  /** `streaming` = still being written; `complete`/`failed` = final. */
  status?: string
  content?: string | null
  tools_used?: unknown
  error_code?: string | null
  created_at?: string
}

/**
 * Why a reply failed, said in a way that tells the reader what to do next.
 *
 * The backend ships only the code (`Assistant::Message#error_kind` does the same reading on the web
 * side), and the three cases ask for three different reactions: nothing will change until someone
 * connects the AI service, or the question itself must be rewritten, or it is worth trying again in
 * a minute. Collapsing them into one "the assistant failed" would send people to retry forever
 * something that cannot succeed.
 */
const FAILURE_MESSAGES: Record<string, string> = {
  // Integrations::Providers::NOT_CONNECTED_CODE
  'R503-INTEGRATION-006':
    'The AI service is not connected for your organization: connect it from the web app, then ask again.',
  // Assistant::Message::NO_ANSWER_ERROR_CODES
  'R502-GEMINI-004': 'The assistant did not produce an answer for this question — try rephrasing it.',
}

const FAILURE_FALLBACK = 'The assistant could not answer (temporary problem upstream); try again in a moment.'

/** `{code, message}` for a failed reply: the server code when there is one, ours when there is not. */
export function assistantFailure(errorCode?: string | null): {code: string; message: string} {
  const code = errorCode ?? undefined
  return {
    code: code ?? ErrorCodes.Ask.failed,
    message: (code ? FAILURE_MESSAGES[code] : undefined) ?? FAILURE_FALLBACK,
  }
}

/**
 * The `🧰 Tools used:` line, or '' when the reply used none. What the assistant read is what makes
 * the answer checkable, so it is printed next to the answer and not hidden behind `--json`.
 */
export function renderToolsUsed(tools: unknown, prefix = ''): string {
  const names = Array.isArray(tools) ? tools.map((tool) => sanitize(tool)).filter((tool) => tool.trim() !== '') : []
  return names.length === 0 ? '' : `${prefix}🧰 Tools used: ${names.join(', ')}`
}

/** One message: who spoke and when, the text, the reason when it failed, the tools it used. */
function renderMessage(message: AssistantMessage): string {
  const when = sanitize(message.created_at ?? '')
  const lines = [`${statusDot(message.status)} [${sanitize(message.role ?? '-')}] ${when}`.trimEnd()]

  const content = String(message.content ?? '').trim()
  if (content !== '') lines.push(sanitizeMultiline(message.content))

  // A failed reply carries no text at all: without this line the conversation would show an empty
  // bubble and no hint of what went wrong.
  if (message.status === 'failed') {
    const failure = assistantFailure(message.error_code)
    lines.push(`⚠️  ${failure.code} — ${failure.message}`)
  }

  const tools = renderToolsUsed(message.tools_used)
  if (tools !== '') lines.push(tools)

  return lines.join('\n')
}

/** Every message of a conversation, oldest first (the order the backend serializes them in). */
export function renderMessages(messages: unknown): string {
  const rows = Array.isArray(messages) ? (messages as AssistantMessage[]) : []
  return rows.length === 0 ? '(no messages)' : rows.map((message) => renderMessage(message)).join('\n\n')
}

/**
 * The conversation list. ID first: it is the argument of `assistant conversations show|delete` and
 * the value of `assistant ask --conversation`, so a table without it would force `--json` just to
 * carry on the conversation you are looking at.
 */
export function renderConversationsTable(rows: Array<Record<string, unknown>>): string {
  return renderTable(
    ['ID', 'TITLE', 'LAST MESSAGE', 'CREATED'],
    rows.map((row) => [
      String(row.id ?? ''),
      String(row.title ?? ''),
      String(row.last_message_at ?? ''),
      String(row.created_at ?? ''),
    ]),
  )
}
