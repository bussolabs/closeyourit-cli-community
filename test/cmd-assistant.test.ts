// CYCL-43 — the assistant that reads the data and "ask the tickets" from the terminal.
//
// The two flows live in the same file because they share the delicate part: the answer is not
// ready when the question is sent, and the command must wait for it without hanging.
//
// The real wait is replaced via `node:timers/promises`: the fake sleep does not sleep, it advances
// the clock. So a polling round that lasts a minute in production costs microseconds here, but
// the deadline really fires — that is the behaviour these tests must prove.

import {beforeEach, afterEach, describe, expect, it, vi} from 'vitest'
import {apiMock, resetApiMock} from './helpers/api-mock'
import {apiError, envelope, runCaptured, runExpectingExit} from './helpers/command'

const clock = vi.hoisted(() => ({offset: 0}))

vi.mock('node:timers/promises', () => ({
  setTimeout: async (ms: number) => {
    clock.offset += ms
  },
}))
vi.mock('../src/lib/api', async (io) => {
  const actual = await io<typeof import('../src/lib/api')>()
  const {apiMock} = await import('./helpers/api-mock')
  return {...actual, CliApi: vi.fn(function () { return apiMock })}
})
vi.mock('../src/lib/config', async (io) => {
  const actual = await io<typeof import('../src/lib/config')>()
  return {...actual, loadConfig: vi.fn(() => ({apiUrl: 'https://api.test', token: 'tok_test'}))}
})

import AssistantAsk from '../src/commands/assistant/ask'
import AssistantConversationsCreate from '../src/commands/assistant/conversations/create'
import AssistantConversationsDelete from '../src/commands/assistant/conversations/delete'
import AssistantConversationsList from '../src/commands/assistant/conversations/list'
import AssistantConversationsShow from '../src/commands/assistant/conversations/show'
import TicketsAsk from '../src/commands/tickets/ask'

const CID = 'c-1'
const MSG = 'm-9'

let nowSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  resetApiMock()
  clock.offset = 0
  const real = Date.now.bind(Date)
  nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => real() + clock.offset)
})

afterEach(() => {
  nowSpy.mockRestore()
})

describe('assistant conversations list', () => {
  it('lists the conversations with id, title and last activity', async () => {
    apiMock.get.mockResolvedValue(
      envelope([{id: CID, title: 'Come va il progetto', last_message_at: '2026-08-21T10:00:00Z', created_at: '2026-08-20T09:00:00Z'}]),
    )
    const {stdout} = await runCaptured(AssistantConversationsList, [])
    expect(apiMock.get).toHaveBeenCalledWith('/cli/v1/assistant/conversations?page=1')
    expect(stdout).toContain(CID)
    expect(stdout).toContain('Come va il progetto')
    expect(stdout).toContain('2026-08-21T10:00:00Z')
  })

  it('forwards --per and --page', async () => {
    apiMock.get.mockResolvedValue(envelope([]))
    await runCaptured(AssistantConversationsList, ['--page', '2', '--per', '50'])
    expect(apiMock.get).toHaveBeenCalledWith('/cli/v1/assistant/conversations?page=2&per=50')
  })

  it('rejects a nonexistent page before calling the server', async () => {
    const {message} = await runExpectingExit(AssistantConversationsList, ['--page', '0'], 2)
    expect(message).toContain('--page')
    expect(apiMock.get).not.toHaveBeenCalled()
  })

  it('with --json returns the envelope without printing the table', async () => {
    apiMock.get.mockResolvedValue(envelope([{id: CID, title: 'X'}], {total: 1}))
    const {result, stdout} = await runCaptured(AssistantConversationsList, ['--json'])
    expect((result as {data: unknown[]}).data).toHaveLength(1)
    expect(stdout).not.toContain('TITLE')
  })

  it('handles an envelope without data', async () => {
    apiMock.get.mockResolvedValue({data: null})
    const {stdout} = await runCaptured(AssistantConversationsList, [])
    expect(stdout).toContain('(no results)')
  })

  it('renders empty cells for a conversation without fields', async () => {
    apiMock.get.mockResolvedValue(envelope([{}]))
    const {result} = await runCaptured(AssistantConversationsList, [])
    expect((result as {data: unknown[]}).data).toHaveLength(1)
  })
})

describe('assistant conversations create', () => {
  it('opens a conversation without a title', async () => {
    apiMock.post.mockResolvedValue(envelope({id: CID, title: null, created_at: '2026-08-21T10:00:00Z'}))
    const {stdout} = await runCaptured(AssistantConversationsCreate, [])
    expect(apiMock.post).toHaveBeenCalledWith('/cli/v1/assistant/conversations', {title: undefined})
    expect(stdout).toContain(CID)
  })

  it('opens a conversation with the given title', async () => {
    apiMock.post.mockResolvedValue(envelope({id: CID, title: 'Rilasci'}))
    await runCaptured(AssistantConversationsCreate, ['--title', 'Rilasci'])
    expect(apiMock.post).toHaveBeenCalledWith('/cli/v1/assistant/conversations', {title: 'Rilasci'})
  })

  it('handles an envelope without data', async () => {
    apiMock.post.mockResolvedValue({data: null})
    const {result} = await runCaptured(AssistantConversationsCreate, [])
    expect(result).toEqual({data: null})
  })
})

describe('assistant conversations show', () => {
  it('shows the conversation and its messages, with status and tools used', async () => {
    apiMock.get.mockResolvedValue(
      envelope({
        id: CID,
        title: 'Come va il progetto',
        last_message_at: '2026-08-21T10:00:04Z',
        messages: [
          {id: 'm-1', role: 'user', status: 'complete', content: 'Quanti ticket aperti?', created_at: '2026-08-21T10:00:00Z'},
          {
            id: MSG,
            role: 'assistant',
            status: 'complete',
            content: 'Ne hai tre.',
            tools_used: ['list_tickets'],
            created_at: '2026-08-21T10:00:04Z',
          },
        ],
      }),
    )
    const {stdout} = await runCaptured(AssistantConversationsShow, [CID])
    expect(apiMock.get).toHaveBeenCalledWith(`/cli/v1/assistant/conversations/${CID}`)
    expect(stdout).toContain('Come va il progetto')
    expect(stdout).toContain('Quanti ticket aperti?')
    expect(stdout).toContain('Ne hai tre.')
    expect(stdout).toContain('list_tickets')
    expect(stdout).toContain('assistant')
  })

  it('says why an answer failed instead of showing an empty bubble', async () => {
    apiMock.get.mockResolvedValue(
      envelope({
        id: CID,
        messages: [{id: MSG, role: 'assistant', status: 'failed', content: null, error_code: 'R503-INTEGRATION-006'}],
      }),
    )
    const {stdout} = await runCaptured(AssistantConversationsShow, [CID])
    expect(stdout).toContain('R503-INTEGRATION-006')
    expect(stdout).toContain('not connected')
  })

  it('handles a message without role, date and tools', async () => {
    apiMock.get.mockResolvedValue(envelope({id: CID, messages: [{id: MSG, status: 'complete', content: 'Ecco.'}]}))
    const {stdout} = await runCaptured(AssistantConversationsShow, [CID])
    expect(stdout).toContain('[-]')
    expect(stdout).toContain('Ecco.')
    expect(stdout).not.toContain('Tools used')
  })

  it('handles a conversation without messages', async () => {
    apiMock.get.mockResolvedValue(envelope({id: CID, title: 'Vuota'}))
    const {stdout} = await runCaptured(AssistantConversationsShow, [CID])
    expect(stdout).toContain('Vuota')
    expect(stdout).toContain('(no messages)')
  })

  it('handles an envelope without data', async () => {
    apiMock.get.mockResolvedValue({data: null})
    const {result} = await runCaptured(AssistantConversationsShow, [CID])
    expect(result).toEqual({data: null})
  })

  it('with --json prints only the envelope, not the readable block', async () => {
    apiMock.get.mockResolvedValue(envelope({id: CID, messages: []}))
    const {stdout} = await runCaptured(AssistantConversationsShow, [CID, '--json'])
    expect(stdout).not.toContain('💬 Messages')
    expect(stdout).toContain('"data"')
  })
})

describe('assistant conversations delete', () => {
  it('refuses to delete without --confirm', async () => {
    const {message} = await runExpectingExit(AssistantConversationsDelete, [CID], 2)
    expect(message).toContain('--confirm')
    expect(apiMock.delete).not.toHaveBeenCalled()
  })

  it('deletes the conversation with --confirm', async () => {
    apiMock.delete.mockResolvedValue(envelope(null))
    const {result, stdout} = await runCaptured(AssistantConversationsDelete, [CID, '--confirm'])
    expect(apiMock.delete).toHaveBeenCalledWith(`/cli/v1/assistant/conversations/${CID}`)
    expect(stdout).toContain(CID)
    expect(result).toEqual({deleted: CID})
  })
})

describe('assistant ask', () => {
  const streaming = {id: MSG, role: 'assistant', status: 'streaming', content: null, tools_used: []}
  const complete = {
    id: MSG,
    role: 'assistant',
    status: 'complete',
    content: 'Hai tre ticket aperti.',
    tools_used: ['list_tickets'],
  }

  it('rejects an empty question before calling the server', async () => {
    const {message} = await runExpectingExit(AssistantAsk, [], 2)
    expect(message).toContain('question')
    expect(apiMock.post).not.toHaveBeenCalled()
  })

  it('rejects a wait that waits for nothing', async () => {
    const {message} = await runExpectingExit(AssistantAsk, ['quanti', 'ticket', '--timeout', '0'], 2)
    expect(message).toContain('--timeout')
    expect(apiMock.post).not.toHaveBeenCalled()
  })

  it('opens a conversation, sends the question, waits for the answer and shows it', async () => {
    apiMock.post
      .mockResolvedValueOnce(envelope({id: CID}))
      .mockResolvedValueOnce(envelope(streaming))
    apiMock.get.mockResolvedValueOnce(envelope(streaming)).mockResolvedValueOnce(envelope(complete))

    const {stdout} = await runCaptured(AssistantAsk, ['quanti', 'ticket', 'aperti', 'ho?'])

    expect(apiMock.post).toHaveBeenNthCalledWith(1, '/cli/v1/assistant/conversations', {title: undefined})
    expect(apiMock.post).toHaveBeenNthCalledWith(2, `/cli/v1/assistant/conversations/${CID}/messages`, {
      text: 'quanti ticket aperti ho?',
    })
    expect(apiMock.get).toHaveBeenCalledWith(`/cli/v1/assistant/messages/${MSG}`)
    expect(apiMock.get).toHaveBeenCalledTimes(2)
    expect(stdout).toContain('Hai tre ticket aperti.')
    expect(stdout).toContain('list_tickets')
    expect(stdout).toContain(CID)
  })

  it('continues an existing conversation without opening another one', async () => {
    apiMock.post.mockResolvedValue(envelope(streaming))
    apiMock.get.mockResolvedValue(envelope(complete))

    await runCaptured(AssistantAsk, ['e', 'domani?', '--conversation', CID])

    expect(apiMock.post).toHaveBeenCalledTimes(1)
    expect(apiMock.post).toHaveBeenCalledWith(`/cli/v1/assistant/conversations/${CID}/messages`, {text: 'e domani?'})
  })

  it('with --json keeps status, tools and conversation', async () => {
    apiMock.post.mockResolvedValue(envelope(streaming))
    apiMock.get.mockResolvedValue(envelope(complete))

    const {result, stdout} = await runCaptured(AssistantAsk, ['ciao', '--conversation', CID, '--json'])

    expect(stdout).not.toContain('Asking the assistant')
    expect(stdout).not.toContain('keep asking with')
    expect(result).toEqual({
      data: {...complete, conversation_id: CID},
    })
  })

  it('exits non-zero when the AI service is not connected', async () => {
    apiMock.post.mockResolvedValue(envelope(streaming))
    apiMock.get.mockResolvedValue(envelope({...streaming, status: 'failed', error_code: 'R503-INTEGRATION-006'}))

    const {stderr} = await runExpectingExit(AssistantAsk, ['ciao', '--conversation', CID])

    expect(stderr).toContain('R503-INTEGRATION-006')
    expect(stderr).toContain('not connected')
  })

  it('exits non-zero inviting to rephrase when the assistant produces no answer', async () => {
    apiMock.post.mockResolvedValue(envelope(streaming))
    apiMock.get.mockResolvedValue(envelope({...streaming, status: 'failed', error_code: 'R502-GEMINI-004'}))

    const {stderr} = await runExpectingExit(AssistantAsk, ['ciao', '--conversation', CID])

    expect(stderr).toContain('R502-GEMINI-004')
    expect(stderr).toContain('rephrasing')
  })

  it('exits non-zero on a temporary failure, even without a code from the server', async () => {
    apiMock.post.mockResolvedValue(envelope(streaming))
    apiMock.get.mockResolvedValue(envelope({...streaming, status: 'failed'}))

    const {stderr} = await runExpectingExit(AssistantAsk, ['ciao', '--conversation', CID])

    expect(stderr).toContain('C502-ASK-002')
    expect(stderr).toContain('try again')
  })

  it('stops waiting at the deadline and says where to find the answer later', async () => {
    apiMock.post.mockResolvedValue(envelope(streaming))
    apiMock.get.mockResolvedValue(envelope(streaming))

    const {stderr} = await runExpectingExit(AssistantAsk, ['ciao', '--conversation', CID, '--timeout', '10'])

    expect(stderr).toContain('C408-ASK-001')
    expect(stderr).toContain(`assistant conversations show ${CID}`)
    // Ten seconds of waiting do not become ten requests: the wait grows at every round.
    expect(apiMock.get.mock.calls.length).toBeLessThanOrEqual(5)
  })

  it('stops if the server accepts the message without giving its identifier', async () => {
    apiMock.post.mockResolvedValue(envelope({role: 'assistant', status: 'streaming'}))

    const {stderr} = await runExpectingExit(AssistantAsk, ['ciao', '--conversation', CID])

    expect(stderr).toContain('C502-ASK-002')
    expect(apiMock.get).not.toHaveBeenCalled()
  })

  it('stops if the message comes back in an envelope without data', async () => {
    apiMock.post.mockResolvedValue({data: null})

    const {stderr} = await runExpectingExit(AssistantAsk, ['ciao', '--conversation', CID])

    expect(stderr).toContain('C502-ASK-002')
    expect(apiMock.get).not.toHaveBeenCalled()
  })

  it('handles a completed answer without text or tools', async () => {
    apiMock.post.mockResolvedValue(envelope(streaming))
    apiMock.get.mockResolvedValue(envelope({id: MSG, role: 'assistant', status: 'complete'}))

    const {result, stdout} = await runCaptured(AssistantAsk, ['ciao', '--conversation', CID])

    expect(result).toEqual({data: {id: MSG, role: 'assistant', status: 'complete', conversation_id: CID}})
    expect(stdout).not.toContain('Tools used')
    expect(stdout).toContain(`Conversation: ${CID}`)
  })

  it('does not pass off as successful an answer with a status it does not know', async () => {
    apiMock.post.mockResolvedValue(envelope(streaming))
    apiMock.get.mockResolvedValue({data: null})

    const {stderr} = await runExpectingExit(AssistantAsk, ['ciao', '--conversation', CID])

    expect(stderr).toContain('C502-ASK-002')
    expect(stderr).toContain('state')
  })

  it('removes the conversation just opened if the question is rejected', async () => {
    apiMock.post
      .mockResolvedValueOnce(envelope({id: CID}))
      .mockRejectedValueOnce(apiError(422, 'R422-ASSISTANT-004', 'Message too long'))
    apiMock.delete.mockResolvedValue(envelope(null))

    const {stderr} = await runExpectingExit(AssistantAsk, ['ciao'])

    expect(stderr).toContain('R422-ASSISTANT-004')
    expect(apiMock.delete).toHaveBeenCalledWith(`/cli/v1/assistant/conversations/${CID}`)
  })

  it('does not touch an existing conversation when the question is rejected', async () => {
    apiMock.post.mockRejectedValue(apiError(422, 'R422-ASSISTANT-001', 'Blank'))

    await runExpectingExit(AssistantAsk, ['ciao', '--conversation', CID])

    expect(apiMock.delete).not.toHaveBeenCalled()
  })

  it('if the cleanup fails too it still reports the real rejection', async () => {
    apiMock.post
      .mockResolvedValueOnce(envelope({id: CID}))
      .mockRejectedValueOnce(apiError(422, 'R422-ASSISTANT-004', 'Message too long'))
    apiMock.delete.mockRejectedValue(apiError(500, 'R500-SYS-001', 'boom'))

    const {stderr} = await runExpectingExit(AssistantAsk, ['ciao'])

    expect(stderr).toContain('R422-ASSISTANT-004')
    expect(stderr).not.toContain('R500-SYS-001')
  })

  it('stops if the conversation just opened has no identifier', async () => {
    apiMock.post.mockResolvedValue(envelope({}))

    const {stderr} = await runExpectingExit(AssistantAsk, ['ciao'])

    expect(stderr).toContain('C502-ASK-002')
    expect(apiMock.post).toHaveBeenCalledTimes(1)
  })

  it('propagates the server rejection (question too long) without waiting for anything', async () => {
    apiMock.post.mockRejectedValue(apiError(422, 'R422-ASSISTANT-004', 'Message too long'))

    const {stderr} = await runExpectingExit(AssistantAsk, ['ciao', '--conversation', CID])

    expect(stderr).toContain('R422-ASSISTANT-004')
    expect(apiMock.get).not.toHaveBeenCalled()
  })
})

describe('tickets ask', () => {
  const answer = {
    answer: 'Sono aperti tre ticket sul carico di lavoro.',
    insufficient: false,
    tickets: [{id: 't-1', code: 'CYCL-42', title: 'Carico di lavoro', status_label: 'In Progress', kind: 'story'}],
  }

  it('rejects an empty question before calling the server', async () => {
    const {message} = await runExpectingExit(TicketsAsk, [], 2)
    expect(message).toContain('question')
    expect(apiMock.post).not.toHaveBeenCalled()
  })

  it('rejects a wait that waits for nothing', async () => {
    const {message} = await runExpectingExit(TicketsAsk, ['che', 'succede', '--timeout', '0'], 2)
    expect(message).toContain('--timeout')
    expect(apiMock.post).not.toHaveBeenCalled()
  })

  it('asks the question, waits for the outcome and shows answer and cited tickets', async () => {
    apiMock.post.mockResolvedValue(envelope({request_id: 'req-1', status: 'pending'}))
    apiMock.get
      .mockResolvedValueOnce(envelope({status: 'pending'}))
      .mockResolvedValueOnce(envelope({status: 'done', result: answer}))

    const {stdout} = await runCaptured(TicketsAsk, ['a', 'che', 'punto', 'siamo?'])

    expect(apiMock.post).toHaveBeenCalledWith('/cli/v1/tickets/ask', {question: 'a che punto siamo?'})
    expect(apiMock.get).toHaveBeenCalledWith('/cli/v1/ai/requests/req-1')
    expect(stdout).toContain('Sono aperti tre ticket sul carico di lavoro.')
    expect(stdout).toContain('CYCL-42')
    expect(stdout).toContain('In Progress')
  })

  it('says when the tickets are not enough to answer', async () => {
    apiMock.post.mockResolvedValue(envelope({request_id: 'req-1', status: 'pending'}))
    apiMock.get.mockResolvedValue(envelope({status: 'done', result: {answer: '', insufficient: true, tickets: []}}))

    const {stdout} = await runCaptured(TicketsAsk, ['boh?'])

    expect(stdout).toContain('not have enough')
  })

  it('with --json keeps status, answer and cited tickets', async () => {
    apiMock.post.mockResolvedValue(envelope({request_id: 'req-1', status: 'pending'}))
    apiMock.get.mockResolvedValue(envelope({status: 'done', result: answer}))

    const {result, stdout} = await runCaptured(TicketsAsk, ['ciao', '--json'])

    expect(stdout).not.toContain('Asking your tickets')
    expect(stdout).not.toContain('🎫 Tickets:')
    expect(result).toEqual({data: {request_id: 'req-1', status: 'done', result: answer}})
  })

  it('exits non-zero with the server code when the request fails', async () => {
    apiMock.post.mockResolvedValue(envelope({request_id: 'req-1', status: 'pending'}))
    apiMock.get.mockResolvedValue(
      envelope({status: 'failed', error: {code: 'R502-GEMINI-001', message: 'Gemini did not answer'}}),
    )

    const {stderr} = await runExpectingExit(TicketsAsk, ['ciao'])

    expect(stderr).toContain('R502-GEMINI-001')
    expect(stderr).toContain('Gemini did not answer')
  })

  it('exits non-zero even if the failure arrives without code or message', async () => {
    apiMock.post.mockResolvedValue(envelope({request_id: 'req-1', status: 'pending'}))
    apiMock.get.mockResolvedValue(envelope({status: 'failed'}))

    const {stderr} = await runExpectingExit(TicketsAsk, ['ciao'])

    expect(stderr).toContain('C502-ASK-002')
  })

  it('stops waiting at the deadline saying the question must be asked again', async () => {
    apiMock.post.mockResolvedValue(envelope({request_id: 'req-1', status: 'pending'}))
    apiMock.get.mockResolvedValue(envelope({status: 'pending'}))

    const {stderr} = await runExpectingExit(TicketsAsk, ['ciao', '--timeout', '10'])

    expect(stderr).toContain('C408-ASK-001')
    // The outcome stays on the server with this identifier: asking again would open another one,
    // so the way out is to wait longer, not to repeat.
    expect(stderr).toContain('req-1')
    expect(stderr).toContain('--timeout')
  })

  it('exits non-zero when the failure arrives with an error without a code', async () => {
    apiMock.post.mockResolvedValue(envelope({request_id: 'req-1', status: 'pending'}))
    apiMock.get.mockResolvedValue(envelope({status: 'failed', error: {}}))

    const {stderr} = await runExpectingExit(TicketsAsk, ['ciao'])

    expect(stderr).toContain('C502-ASK-002')
    expect(stderr).toContain('try again')
  })

  it('handles an outcome without answer or cited tickets', async () => {
    apiMock.post.mockResolvedValue(envelope({request_id: 'req-1', status: 'pending'}))
    apiMock.get.mockResolvedValue(envelope({status: 'done'}))

    const {result, stdout} = await runCaptured(TicketsAsk, ['ciao'])

    expect(result).toEqual({data: {request_id: 'req-1', status: 'done', result: {}}})
    expect(stdout).not.toContain('🎫 Tickets:')
  })

  it('does not pass off as successful an outcome with a status it does not know', async () => {
    apiMock.post.mockResolvedValue(envelope({request_id: 'req-1', status: 'pending'}))
    apiMock.get.mockResolvedValue({data: null})

    const {stderr} = await runExpectingExit(TicketsAsk, ['ciao'])

    expect(stderr).toContain('C502-ASK-002')
    expect(stderr).toContain('state')
  })

  it('stops if the server accepts the question without giving its identifier', async () => {
    apiMock.post.mockResolvedValue(envelope({status: 'pending'}))

    const {stderr} = await runExpectingExit(TicketsAsk, ['ciao'])

    expect(stderr).toContain('C502-ASK-002')
    expect(apiMock.get).not.toHaveBeenCalled()
  })

  it('stops if the question comes back in an envelope without data', async () => {
    apiMock.post.mockResolvedValue({data: null})

    const {stderr} = await runExpectingExit(TicketsAsk, ['ciao'])

    expect(stderr).toContain('C502-ASK-002')
    expect(apiMock.get).not.toHaveBeenCalled()
  })

  it('propagates the server rejection (AI not connected) without waiting for anything', async () => {
    apiMock.post.mockRejectedValue(apiError(503, 'R503-INTEGRATION-006', 'Gemini is not connected'))

    const {stderr} = await runExpectingExit(TicketsAsk, ['ciao'])

    expect(stderr).toContain('R503-INTEGRATION-006')
    expect(apiMock.get).not.toHaveBeenCalled()
  })
})
