import {beforeEach, describe, expect, it, vi} from 'vitest'
import {apiMock, resetApiMock} from './helpers/api-mock'
import {PID, apiError, envelope, runCaptured, runExpectingExit} from './helpers/command'

vi.mock('../src/lib/api', async (io) => {
  const actual = await io<typeof import('../src/lib/api')>()
  const {apiMock} = await import('./helpers/api-mock')
  return {...actual, CliApi: vi.fn(function () { return apiMock })}
})
vi.mock('../src/lib/config', async (io) => {
  const actual = await io<typeof import('../src/lib/config')>()
  return {...actual, loadConfig: vi.fn(() => ({apiUrl: 'https://api.test', token: 'tok_test'}))}
})

import TicketsQuestionsAnswer from '../src/commands/tickets/questions/answer'
import TicketsQuestionsAsk from '../src/commands/tickets/questions/ask'
import TicketsQuestionsClose from '../src/commands/tickets/questions/close'
import TicketsQuestionsDelete from '../src/commands/tickets/questions/delete'
import TicketsQuestionsList from '../src/commands/tickets/questions/list'

const T = 'CYRA-783'
const BASE = `/cli/v1/projects/${PID}/tickets/${T}/questions`
const QID = 'q-1'

// CYCL-60 — the Questions tab exists on the site since CYRA-782 and the endpoints since CYRA-783: the
// terminal lacked the commands, so whoever works on the command line had to open the site to ask.
describe('tickets questions', () => {
  beforeEach(() => resetApiMock())

  describe('list', () => {
    it('lists state, author and text, with the answers under their question', async () => {
      apiMock.get.mockResolvedValue(
        envelope(
          [
            {
              id: QID,
              body: 'Il tetto vale anche per le risposte?',
              state: 'answered',
              blocking: true,
              audience: 'internal',
              author: 'Alessio Bussolari',
              created_at: '2026-09-06T10:00:00+02:00',
              answers: [{id: 'a-1', body: 'Sì, lo stesso.', author: 'Enrico', created_at: '2026-09-06T11:00:00+02:00'}],
            },
          ],
          {total_pages: 1},
        ),
      )

      const {stdout} = await runCaptured(TicketsQuestionsList, [T, '--project', PID])

      expect(apiMock.get).toHaveBeenCalledWith(`${BASE}?page=1&per=100`)
      expect(stdout).toContain(QID)
      expect(stdout).toContain('Il tetto vale anche per le risposte?')
      expect(stdout).toContain('Alessio Bussolari')
      expect(stdout).toContain('Sì, lo stesso.')
      expect(stdout).toContain('Enrico')
    })

    // A BLOCKING and open question stops the agents queue: reading it like any other
    // hides the reason why the ticket does not start.
    it('flags the blocking questions still open', async () => {
      apiMock.get.mockResolvedValue(
        envelope(
          [{id: QID, body: 'Chi decide?', state: 'open', blocking: true, audience: 'internal', author: 'A', answers: []}],
          {total_pages: 1},
        ),
      )

      const {stdout} = await runCaptured(TicketsQuestionsList, [T, '--project', PID])

      expect(stdout).toContain('blocca')
    })

    it('reads all the pages, not just the first', async () => {
      apiMock.get
        .mockResolvedValueOnce(envelope([{id: 'q-1', body: 'Prima', state: 'open', answers: []}], {total_pages: 2}))
        .mockResolvedValueOnce(envelope([{id: 'q-2', body: 'Seconda', state: 'open', answers: []}], {total_pages: 2}))

      const {stdout} = await runCaptured(TicketsQuestionsList, [T, '--project', PID])

      expect(apiMock.get).toHaveBeenCalledTimes(2)
      expect(stdout).toContain('Prima')
      expect(stdout).toContain('Seconda')
    })

    it('says so when there are no questions', async () => {
      apiMock.get.mockResolvedValue(envelope([], {total_pages: 1}))

      const {stdout} = await runCaptured(TicketsQuestionsList, [T, '--project', PID])

      expect(stdout).toContain('(nessuna domanda)')
    })
  })

  describe('ask', () => {
    it('asks the question and prints the created one', async () => {
      apiMock.post.mockResolvedValue(envelope({id: QID, body: 'Chi decide?', state: 'open'}))

      const {stdout} = await runCaptured(TicketsQuestionsAsk, [T, '--project', PID, '--body', 'Chi decide?'])

      expect(apiMock.post).toHaveBeenCalledWith(BASE, {audience: 'internal', blocking: false, body: 'Chi decide?'})
      expect(stdout).toContain(QID)
    })

    it('marks the question as blocking and shared when asked to', async () => {
      apiMock.post.mockResolvedValue(envelope({id: QID}))

      await runCaptured(TicketsQuestionsAsk, [T, '--project', PID, '--body', 'Chi decide?', '--blocking', '--shared'])

      expect(apiMock.post).toHaveBeenCalledWith(BASE, {audience: 'shared', blocking: true, body: 'Chi decide?'})
    })

    // The cap is the same as the comment one and the server measures it anyway: saying it first avoids
    // writing two lines too many and finding out after the call (same rule as CYCL-32).
    it('rejects a question over the cap without calling the service', async () => {
      const {message} = await runExpectingExit(
        TicketsQuestionsAsk,
        [T, '--project', PID, '--body', 'a'.repeat(241)],
        2,
      )

      expect(message).toContain('max 240')
      expect(apiMock.post).not.toHaveBeenCalled()
    })

    // The server rejects questions that look like a command (backtick, url, path): the reason must
    // arrive intact, otherwise the reader does not understand what to fix.
    it('reports the server rejection for a question that looks like a command', async () => {
      apiMock.post.mockRejectedValue(
        apiError(422, 'R422-QUESTION-001', 'Invalid question. It must read as a question in plain words, not a command or a URL.'),
      )

      const {message} = await runExpectingExit(TicketsQuestionsAsk, [T, '--project', PID, '--body', 'lancia bundle exec'])

      expect(message).toContain('R422-QUESTION-001')
      expect(message).toContain('not a command or a URL')
    })
  })

  // CYRA-1033 — the proposed answers, numbered as `--choice` takes them, the recommended one marked.
  it('lists the proposed answers of a choice question with their numbers', async () => {
    apiMock.get.mockResolvedValue(envelope([{
      id: QID, body: 'Email o solo mostrato?', state: 'open', author: 'automator-lab', created_at: '2026-10-06T10:00:00+02:00',
      options: [{label: 'Solo mostrato', recommended: true, reason: 'Nessuno ha chiesto email.'}, {label: 'Email', recommended: false, reason: null}],
      answers: [],
    }], {total_pages: 1}))

    const {stdout} = await runCaptured(TicketsQuestionsList, [T, '--project', PID])

    expect(stdout).toContain('1. Solo mostrato (consigliata: Nessuno ha chiesto email.)')
    expect(stdout).toContain('2. Email')
  })

  describe('answer', () => {
    it('answers the given question', async () => {
      apiMock.post.mockResolvedValue(envelope({id: QID, state: 'answered', answers: [{id: 'a-1', body: 'Decide Enrico.'}]}))

      const {stdout} = await runCaptured(TicketsQuestionsAnswer, [
        T, '--project', PID, '--question-id', QID, '--body', 'Decide Enrico.',
      ])

      expect(apiMock.post).toHaveBeenCalledWith(`${BASE}/${QID}/answers`, {body: 'Decide Enrico.'})
      expect(stdout).toContain('answered')
    })

    // CYRA-1033 — `--choice N` picks a proposed answer; the server resolves it to the label.
    it('answers with a proposed answer by number', async () => {
      apiMock.post.mockResolvedValue(envelope({id: QID, state: 'answered', answers: [{id: 'a-1', body: 'Email', choice: 2}]}))

      await runCaptured(TicketsQuestionsAnswer, [T, '--project', PID, '--question-id', QID, '--choice', '2'])

      expect(apiMock.post).toHaveBeenCalledWith(`${BASE}/${QID}/answers`, {choice: 2})
    })

    it('refuses a choice together with a typed answer, and neither of them', async () => {
      await runExpectingExit(TicketsQuestionsAnswer, [T, '--project', PID, '--question-id', QID, '--choice', '1', '--body', 'x'], 2)
      await runExpectingExit(TicketsQuestionsAnswer, [T, '--project', PID, '--question-id', QID], 2)

      expect(apiMock.post).not.toHaveBeenCalled()
    })

    it('rejects an answer over the cap without calling the service', async () => {
      const {message} = await runExpectingExit(
        TicketsQuestionsAnswer,
        [T, '--project', PID, '--question-id', QID, '--body', 'a'.repeat(241)],
        2,
      )

      expect(message).toContain('max 240')
      expect(apiMock.post).not.toHaveBeenCalled()
    })

    it('reports the rejection when the question was already withdrawn', async () => {
      apiMock.post.mockRejectedValue(
        apiError(422, 'R422-QUESTION-003', 'This question was withdrawn: it can no longer be answered.'),
      )

      const {message} = await runExpectingExit(TicketsQuestionsAnswer, [
        T, '--project', PID, '--question-id', QID, '--body', 'Tardi.',
      ])

      expect(message).toContain('withdrawn')
    })
  })

  describe('close', () => {
    it('withdraws the question', async () => {
      apiMock.put.mockResolvedValue(envelope({id: QID, state: 'withdrawn'}))

      const {stdout} = await runCaptured(TicketsQuestionsClose, [T, '--project', PID, '--question-id', QID])

      expect(apiMock.put).toHaveBeenCalledWith(`${BASE}/${QID}/closure`, {})
      expect(stdout).toContain('withdrawn')
    })

    it('reports the rejection when the question already has an answer', async () => {
      apiMock.put.mockRejectedValue(
        apiError(422, 'R422-QUESTION-004', 'This question already has an answer: it cannot be withdrawn.'),
      )

      const {message} = await runExpectingExit(TicketsQuestionsClose, [T, '--project', PID, '--question-id', QID])

      expect(message).toContain('already has an answer')
    })
  })

  describe('delete', () => {
    it('deletes the question only with --confirm', async () => {
      const {message} = await runExpectingExit(TicketsQuestionsDelete, [T, '--project', PID, '--question-id', QID], 2)

      expect(message).toContain('--confirm')
      expect(apiMock.delete).not.toHaveBeenCalled()
    })

    it("deletes the question when the confirmation is there", async () => {
      apiMock.delete.mockResolvedValue(undefined)

      const {stdout} = await runCaptured(TicketsQuestionsDelete, [
        T, '--project', PID, '--question-id', QID, '--confirm',
      ])

      expect(apiMock.delete).toHaveBeenCalledWith(`${BASE}/${QID}`)
      expect(stdout).toContain(QID)
    })
  })
})
