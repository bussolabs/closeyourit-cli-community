import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {apiMock, resetApiMock} from './helpers/api-mock'
import {MID, apiError, envelope, runCaptured, runExpectingExit} from './helpers/command'

vi.mock('../src/lib/api', async (io) => {
  const actual = await io<typeof import('../src/lib/api')>()
  const {apiMock} = await import('./helpers/api-mock')
  return {...actual, CliApi: vi.fn(function () { return apiMock })}
})
vi.mock('../src/lib/config', async (io) => {
  const actual = await io<typeof import('../src/lib/config')>()
  return {...actual, loadConfig: vi.fn(() => ({apiUrl: 'https://api.test', token: 'tok_test'}))}
})

// The interactive review reads its answers from here instead of a real terminal.
const {typed} = vi.hoisted(() => ({typed: [] as string[]}))
vi.mock('node:readline/promises', () => ({
  createInterface: vi.fn(() => ({
    question: vi.fn(async () => (typed.length > 0 ? typed.shift() : 'q')),
    once: vi.fn(),
    close: vi.fn(),
  })),
}))
vi.mock('../src/lib/browser', () => ({openUrl: vi.fn()}))

import ApprovalsApprove from '../src/commands/approvals/approve'
import ApprovalsAsk from '../src/commands/approvals/ask'
import ApprovalsCancel from '../src/commands/approvals/cancel'
import ApprovalsDefer from '../src/commands/approvals/defer'
import ApprovalsList from '../src/commands/approvals/list'
import ApprovalsReassess from '../src/commands/approvals/reassess'
import ApprovalsReject from '../src/commands/approvals/reject'
import ApprovalsReply from '../src/commands/approvals/reply'
import ApprovalsRetry from '../src/commands/approvals/retry'
import ApprovalsReview from '../src/commands/approvals/review'
import ApprovalsShow from '../src/commands/approvals/show'

const base = '/cli/v1/approvals'
const KEY = `agent_plan:${MID}`
const card = `${base}/agent_plan/${MID}`

const row = {
  key: KEY,
  kind: 'agent_plan',
  state: 'awaiting_approval',
  title: 'Add the export button',
  subtitle: null,
  code: 'CYRA-12',
  project: {key: 'CYRA', name: 'CloseYourIt Rails'},
  agent: {id: 'ag-1', name: 'Builder'},
  waiting_since: '2026-11-01T09:00:00Z',
  sort_at: '2026-11-01T09:00:00Z',
  bulk_approvable: true,
  deferred_until: null,
  path: `/member/home/approvals/agent_plan/${MID}`,
}

const detail = {
  key: KEY,
  kind: 'agent_plan',
  phase: 'awaiting_approval',
  decisions: ['approve', 'reject', 'ask'],
  path: `/member/home/approvals/agent_plan/${MID}`,
  ticket: {id: 't-1', code: 'CYRA-12', title: 'Add the export button', description: 'Users want CSV.', technical_analysis: null, status: 'open'},
  project: {key: 'CYRA', name: 'CloseYourIt Rails'},
  plan: {version: 2, markdown: '1. Add the route\n2. Add the button'},
  report: null,
  questions: [],
  blocked_review: null,
  secret_change: null,
}

const blocked = {...detail, phase: 'review_blocked', decisions: ['approve', 'reject'], plan: null, blocked_review: 'Tests failed three times.'}

const withQuestions = {
  ...detail,
  kind: 'clarification',
  decisions: ['reply'],
  plan: null,
  questions: [
    {position: 1, body: 'Which bucket?', options: [{label: 'staging', recommended: true, reason: 'safer'}, {label: 'production', recommended: false, reason: null}]},
    {position: 2, body: 'Keep the old file?', options: [{label: 'yes', recommended: false, reason: null}]},
  ],
}

beforeEach(() => {
  resetApiMock()
  typed.length = 0
})

describe('approvals list', () => {
  it('lists the queue with filters and hides deferred rows', async () => {
    apiMock.get.mockResolvedValue(
      envelope([row, {...row, key: 'review:x', code: 'CYRA-13', deferred_until: '2999-01-01T07:00:00Z'}], {total: 2, totals: {}, deferred_count: 1}),
    )
    const {stdout} = await runCaptured(ApprovalsList, ['--state', 'awaiting_approval', '--project', 'CYRA', '--agent', 'ag-1'])
    expect(apiMock.get).toHaveBeenCalledWith(`${base}?state=awaiting_approval&project=CYRA&agent_id=ag-1`)
    expect(stdout).toContain('CYRA-12')
    expect(stdout).toContain('Builder')
    expect(stdout).not.toContain('CYRA-13')
    expect(stdout).toMatch(/1 deferred to tomorrow/)
  })

  it('--all shows deferred rows too, and --json returns data and meta', async () => {
    const meta = {total: 2, totals: {awaiting_approval: 2}, deferred_count: 1}
    const deferred = {...row, key: 'review:x', code: null, deferred_until: '2999-01-01T07:00:00Z'}
    apiMock.get.mockResolvedValue(envelope([row, deferred], meta))
    const {stdout} = await runCaptured(ApprovalsList, ['--all', '--json'])
    expect(apiMock.get).toHaveBeenCalledWith(base)
    expect(JSON.parse(stdout)).toEqual({data: [row, deferred], meta})
  })

  it('an empty queue says so', async () => {
    apiMock.get.mockResolvedValue(envelope(null))
    const {stdout} = await runCaptured(ApprovalsList, [])
    expect(stdout).toMatch(/nothing is waiting/i)
  })
})

describe('approvals show', () => {
  it('resolves a ticket code and renders the plan, decisions and web address', async () => {
    apiMock.get.mockResolvedValueOnce(envelope([row])).mockResolvedValueOnce(envelope(detail))
    const {stdout} = await runCaptured(ApprovalsShow, ['cyra-12'])
    expect(apiMock.get).toHaveBeenLastCalledWith(card)
    expect(stdout).toContain('Plan to approve: CYRA-12 — Add the export button')
    expect(stdout).toContain('Plan (v2)')
    expect(stdout).toContain('2. Add the button')
    expect(stdout).toContain('Users want CSV.')
    expect(stdout).toContain('Decisions: approve, reject, ask')
    expect(stdout).toContain(`https://api.test/member/home/approvals/agent_plan/${MID}`)
  })

  it('renders questions with the recommended option, the report, a stopped review and a secret change', async () => {
    apiMock.get.mockResolvedValue(
      envelope({
        ...withQuestions,
        decisions: [],
        phase: 'review_blocked',
        ticket: null,
        report: {version: 1, author: {name: 'Builder'}, body: 'Done, tests green.', created_at: '2026-11-02'},
        blocked_review: 'Tests failed.',
        secret_change: {action: 'set', name: 'STRIPE_KEY', environment: {code: 'production'}, requested_by: 'Mario', reason: null},
      }),
    )
    const {stdout} = await runCaptured(ApprovalsShow, [KEY])
    expect(apiMock.get).toHaveBeenCalledTimes(1)
    expect(stdout).toContain('1. Which bucket?')
    expect(stdout).toContain('1) staging  (recommended)')
    expect(stdout).toContain('safer')
    expect(stdout).toContain('By Builder, 2026-11-02')
    expect(stdout).toContain('Why the work stopped')
    expect(stdout).toContain('name: STRIPE_KEY')
    expect(stdout).toContain('environment: production')
    expect(stdout).toContain('requested by: Mario')
    expect(stdout).toMatch(/none available/)
  })

  it('a code matching no card is a clear error', async () => {
    apiMock.get.mockResolvedValue(envelope([row]))
    const {stderr} = await runExpectingExit(ApprovalsShow, ['CYRA-99'], 5)
    expect(stderr).toContain('C404-APR-001')
  })

  it('a code matching two cards asks for the key', async () => {
    apiMock.get.mockResolvedValue(envelope([row, {...row, key: 'review:r1'}]))
    const {stderr} = await runExpectingExit(ApprovalsShow, ['CYRA-12'])
    expect(stderr).toContain('C409-APR-002')
    expect(stderr).toContain('review:r1')
  })

  it('a card already decided keeps the server code and adds the way out', async () => {
    apiMock.get.mockRejectedValue(apiError(404, 'R404-APPROVAL-001', 'Approval not found'))
    const {stderr} = await runExpectingExit(ApprovalsShow, [KEY], 5)
    expect(stderr).toContain('R404-APPROVAL-001')
    expect(stderr).toMatch(/approvals list/)
  })
})

describe('approvals decisions', () => {
  beforeEach(() => {
    apiMock.post.mockResolvedValue(envelope({key: KEY, decision: 'approve'}))
  })

  it('approve sends the optional note', async () => {
    const {stdout} = await runCaptured(ApprovalsApprove, [KEY, '--note', ' looks good '])
    expect(apiMock.post).toHaveBeenCalledWith(`${card}/decision`, {decision: 'approve', text: 'looks good'})
    expect(stdout).toContain('Approved')
  })

  it('approve without a note sends only the decision', async () => {
    await runCaptured(ApprovalsApprove, [KEY])
    expect(apiMock.post).toHaveBeenCalledWith(`${card}/decision`, {decision: 'approve'})
  })

  it('reject sends the reason and refuses a blank one before the call', async () => {
    await runCaptured(ApprovalsReject, [KEY, '--reason', 'too big'])
    expect(apiMock.post).toHaveBeenCalledWith(`${card}/decision`, {decision: 'reject', text: 'too big'})
    apiMock.post.mockClear()
    await runExpectingExit(ApprovalsReject, [KEY, '--reason', '  '], 2)
    expect(apiMock.post).not.toHaveBeenCalled()
  })

  it('ask sends the question and refuses a blank one', async () => {
    await runCaptured(ApprovalsAsk, [KEY, '--text', 'why?'])
    expect(apiMock.post).toHaveBeenCalledWith(`${card}/decision`, {decision: 'ask', text: 'why?'})
    await runExpectingExit(ApprovalsAsk, [KEY, '--text', ' '], 2)
  })

  it('reassess sends only the decision', async () => {
    await runCaptured(ApprovalsReassess, [KEY])
    expect(apiMock.post).toHaveBeenCalledWith(`${card}/decision`, {decision: 'reassess'})
  })

  it('a refused decision keeps the server code and adds the hint', async () => {
    apiMock.post.mockRejectedValue(apiError(403, 'R403-APPROVAL-001', 'Decision not available'))
    const {stderr} = await runExpectingExit(ApprovalsReassess, [KEY], 4)
    expect(stderr).toContain('R403-APPROVAL-001')
    expect(stderr).toMatch(/approvals show/)
  })

  it('an unknown error code passes through untouched', async () => {
    apiMock.post.mockRejectedValue(apiError(500, 'R500-SYS-001', 'boom'))
    const {stderr} = await runExpectingExit(ApprovalsReassess, [KEY])
    expect(stderr).toContain('R500-SYS-001: boom')
  })

  it('defer posts the deferral and prints until when', async () => {
    apiMock.post.mockResolvedValue(envelope({key: KEY, until_at: '2026-11-05T07:00:00+01:00'}))
    const {stdout} = await runCaptured(ApprovalsDefer, [KEY])
    expect(apiMock.post).toHaveBeenCalledWith(`${card}/deferral`)
    expect(stdout).toContain('until 2026-11-05T07:00:00+01:00')
  })
})

describe('approvals reply', () => {
  beforeEach(() => {
    apiMock.post.mockResolvedValue(envelope({key: KEY, decision: 'reply'}))
  })

  it('turns picks into option labels and sends them with the text', async () => {
    apiMock.get.mockResolvedValue(envelope(withQuestions))
    await runCaptured(ApprovalsReply, [KEY, '--pick', '1=2', '--pick', '2=1', '--text', 'and archive it'])
    expect(apiMock.post).toHaveBeenCalledWith(`${card}/decision`, {
      decision: 'reply',
      text: 'and archive it',
      answers: {1: 'production', 2: 'yes'},
    })
  })

  it('text alone does not fetch the card', async () => {
    await runCaptured(ApprovalsReply, [KEY, '--text', 'use staging'])
    expect(apiMock.get).not.toHaveBeenCalled()
    expect(apiMock.post).toHaveBeenCalledWith(`${card}/decision`, {decision: 'reply', text: 'use staging'})
  })

  it('refuses nothing to send, and picks naming nothing', async () => {
    await runExpectingExit(ApprovalsReply, [KEY], 2)
    apiMock.get.mockResolvedValue(envelope(withQuestions))
    for (const pick of ['1=9', '7=1', 'x', '1=1 1=2']) {
      // eslint-disable-next-line no-await-in-loop
      await runExpectingExit(ApprovalsReply, [KEY, ...pick.split(' ').flatMap((p) => ['--pick', p])], 2)
    }

    expect(apiMock.post).not.toHaveBeenCalled()
  })
})

describe('approvals retry and cancel', () => {
  beforeEach(() => {
    apiMock.post.mockResolvedValue(envelope({key: KEY, decision: 'approve'}))
  })

  it('retry approves a stopped review', async () => {
    apiMock.get.mockResolvedValue(envelope(blocked))
    const {stdout} = await runCaptured(ApprovalsRetry, [KEY])
    expect(apiMock.post).toHaveBeenCalledWith(`${card}/decision`, {decision: 'approve'})
    expect(stdout).toContain('Retry requested')
  })

  it('cancel rejects a stopped review with the reason', async () => {
    apiMock.get.mockResolvedValue(envelope(blocked))
    await runCaptured(ApprovalsCancel, [KEY, '--reason', 'not needed'])
    expect(apiMock.post).toHaveBeenCalledWith(`${card}/decision`, {decision: 'reject', text: 'not needed'})
  })

  it('both refuse a card that is not stopped work, and cancel refuses a blank reason', async () => {
    apiMock.get.mockResolvedValue(envelope(detail))
    const retry = await runExpectingExit(ApprovalsRetry, [KEY], 2)
    expect(retry.message).toContain('approvals approve')
    const cancel = await runExpectingExit(ApprovalsCancel, [KEY, '--reason', 'x'], 2)
    expect(cancel.message).toContain('approvals reject')
    await runExpectingExit(ApprovalsCancel, [KEY, '--reason', ' '], 2)
    apiMock.get.mockResolvedValue(envelope({}))
    await runExpectingExit(ApprovalsRetry, [KEY], 2)
    expect(apiMock.post).not.toHaveBeenCalled()
  })
})

describe('approvals review command', () => {
  const tty = process.stdin.isTTY
  afterEach(() => {
    process.stdin.isTTY = tty
  })

  it('refuses to run without a terminal', async () => {
    process.stdin.isTTY = false
    const {message} = await runExpectingExit(ApprovalsReview, [], 2)
    expect(message).toContain('approvals list')
    expect(apiMock.get).not.toHaveBeenCalled()
  })

  it('says so when nothing is waiting (deferred rows excluded)', async () => {
    process.stdin.isTTY = true
    apiMock.get.mockResolvedValue(envelope([{...row, deferred_until: '2999-01-01T07:00:00Z'}]))
    const {stdout} = await runCaptured(ApprovalsReview, ['--state', 'review', '--project', 'CYRA'])
    expect(apiMock.get).toHaveBeenCalledWith(`${base}?state=review&project=CYRA`)
    expect(stdout).toMatch(/nothing is waiting/i)
  })

  it('walks the cards and prints the summary', async () => {
    process.stdin.isTTY = true
    apiMock.get.mockResolvedValueOnce(envelope([row])).mockResolvedValueOnce(envelope(detail))
    apiMock.post.mockResolvedValue(envelope({key: KEY, decision: 'approve'}))
    typed.push('o', 'a', '')
    const {result, stdout} = await runCaptured(ApprovalsReview, [])
    expect(apiMock.post).toHaveBeenCalledWith(`${card}/decision`, {decision: 'approve'})
    expect(stdout).toContain('Approved 1')
    expect(result).toEqual({data: expect.objectContaining({approved: 1})})
  })
})

describe('approvals --json', () => {
  it('every single-card command prints only the envelope', async () => {
    apiMock.get.mockResolvedValue(envelope(blocked))
    const response = envelope({key: KEY, decision: 'approve'})
    apiMock.post.mockResolvedValue(response)
    const cases: Array<[Parameters<typeof runCaptured>[0], string[]]> = [
      [ApprovalsApprove, [KEY]],
      [ApprovalsReject, [KEY, '-r', 'no']],
      [ApprovalsAsk, [KEY, '-t', 'why?']],
      [ApprovalsReassess, [KEY]],
      [ApprovalsReply, [KEY, '-t', 'ok']],
      [ApprovalsRetry, [KEY]],
      [ApprovalsCancel, [KEY, '-r', 'no']],
      [ApprovalsDefer, [KEY]],
    ]
    for (const [command, argv] of cases) {
      // eslint-disable-next-line no-await-in-loop
      const {stdout} = await runCaptured(command, [...argv, '--json'])
      expect(JSON.parse(stdout)).toEqual(response)
    }

    const {stdout} = await runCaptured(ApprovalsShow, [KEY, '--json'])
    expect(JSON.parse(stdout)).toEqual({data: blocked})
  })

  it('show of an empty payload and defer without a date stay readable', async () => {
    apiMock.get.mockResolvedValue(envelope(null))
    const {stdout} = await runCaptured(ApprovalsShow, [KEY])
    expect(stdout).not.toMatch(/undefined|\[object Object\]/)
    apiMock.post.mockResolvedValue(envelope(null))
    const deferred = await runCaptured(ApprovalsDefer, [KEY])
    expect(deferred.stdout).toBe(`Deferred: ${KEY}.`)
  })

  it('list without meta and with sparse rows stays readable', async () => {
    apiMock.get.mockResolvedValue(envelope([{key: 'review:r1', project: {name: 'Only name'}}, {}]))
    const {result, stdout} = await runCaptured(ApprovalsList, [])
    expect(stdout).toContain('review:r1')
    expect(stdout).toContain('Only name')
    expect(stdout).not.toMatch(/undefined|\[object Object\]/)
    expect(result).toEqual({data: [{key: 'review:r1', project: {name: 'Only name'}}, {}]})
  })

  it('a code whose only match has a broken key is not found', async () => {
    apiMock.get.mockResolvedValue(envelope([{code: 'CYRA-12', key: 'broken'}]))
    const {stderr} = await runExpectingExit(ApprovalsShow, ['CYRA-12'], 5)
    expect(stderr).toContain('C404-APR-001')
    apiMock.get.mockResolvedValue(envelope(null))
    await runExpectingExit(ApprovalsShow, ['CYRA-12'], 5)
  })
})
