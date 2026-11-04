import {beforeEach, describe, expect, it, vi} from 'vitest'
import type {CliApi} from '../src/lib/api'
import {
  type ApprovalDetail,
  type ReviewIo,
  isDeferred,
  parseKey,
  parsePicks,
  reviewApprovals,
  summaryLine,
  webUrl,
} from '../src/lib/approvals'
import {apiMock, resetApiMock} from './helpers/api-mock'
import {apiError, envelope} from './helpers/command'

const api = apiMock as unknown as CliApi

const plan: ApprovalDetail = {
  key: 'agent_plan:p1',
  kind: 'agent_plan',
  phase: 'awaiting_approval',
  decisions: ['approve', 'reject', 'ask', 'reassess'],
  path: '/member/home/approvals/agent_plan/p1',
  plan: {version: 1, markdown: 'Do it'},
}

const question: ApprovalDetail = {
  key: 'clarification:c1',
  kind: 'clarification',
  decisions: ['reply'],
  questions: [{position: 1, body: 'Which?', options: [{label: 'A'}, {label: 'B', recommended: true}]}],
}

/** A scripted terminal: answers in order, null once they run out (like Ctrl+D). */
function scripted(answers: Array<string | null>): ReviewIo & {out: string[]; opened: string[]} {
  const out: string[] = []
  const opened: string[] = []
  return {
    out,
    opened,
    print: (line) => out.push(line),
    ask: async () => (answers.length > 0 ? (answers.shift() as string | null) : null),
    open: (url) => opened.push(url),
  }
}

const rows = (...keys: string[]) => keys.map((key) => ({key}))

beforeEach(() => resetApiMock())

describe('approval helpers', () => {
  it('parseKey splits on the first colon only', () => {
    expect(parseKey('agent_plan:a:b')).toEqual({kind: 'agent_plan', id: 'a:b'})
    expect(parseKey('CYRA-12')).toBeUndefined()
    expect(parseKey(':x')).toBeUndefined()
    expect(parseKey('x:')).toBeUndefined()
  })

  it('isDeferred is true only for a future deferral', () => {
    expect(isDeferred({deferred_until: null})).toBe(false)
    expect(isDeferred({deferred_until: '2000-01-01T00:00:00Z'})).toBe(false)
    expect(isDeferred({deferred_until: '2999-01-01T00:00:00Z'})).toBe(true)
  })

  it('webUrl joins the base and the path', () => {
    expect(webUrl('https://app.test', '/member/x')).toBe('https://app.test/member/x')
    expect(webUrl('https://app.test', undefined)).toBeUndefined()
    expect(webUrl('not a url', '/x')).toBeUndefined()
  })

  it('parsePicks maps question=option to labels', () => {
    expect(parsePicks(question.questions ?? [], ['1=2'])).toEqual({answers: {1: 'B'}})
  })

  it('summaryLine names only what happened', () => {
    const zero = {approved: 0, rejected: 0, asked: 0, replied: 0, reassessed: 0, skipped: 0, deferred: 0, failed: 0, left: 0}
    expect(summaryLine(zero)).toBe('Nothing done.')
    expect(summaryLine({...zero, approved: 2, left: 1})).toBe('Approved 2 · Left 1')
  })
})

describe('reviewApprovals', () => {
  it('approves with a note, rejects with a reason, skips, defers', async () => {
    apiMock.get.mockResolvedValue(envelope(plan))
    apiMock.post.mockResolvedValue(envelope({}))
    const io = scripted(['a', 'ship it', 'r', '', 'r', 'too big', 's', 'd'])
    const summary = await reviewApprovals(api, rows('agent_plan:p1', 'agent_plan:p2', 'agent_plan:p3', 'agent_plan:p4'), {
      io,
      baseUrl: 'https://app.test',
    })
    expect(apiMock.post).toHaveBeenNthCalledWith(1, '/cli/v1/approvals/agent_plan/p1/decision', {decision: 'approve', text: 'ship it'})
    expect(apiMock.post).toHaveBeenNthCalledWith(2, '/cli/v1/approvals/agent_plan/p2/decision', {decision: 'reject', text: 'too big'})
    expect(apiMock.post).toHaveBeenNthCalledWith(3, '/cli/v1/approvals/agent_plan/p4/deferral')
    expect(summary).toMatchObject({approved: 1, rejected: 1, skipped: 1, deferred: 1, failed: 0})
    expect(io.out.join('\n')).toContain('A rejection needs a reason')
    expect(io.out.join('\n')).toContain('[a] approve  [r] reject  [k] ask  [e] reassess  [s] skip')
  })

  it('asks, reassesses, opens the browser and ignores unknown keys', async () => {
    apiMock.get.mockResolvedValue(envelope(plan))
    apiMock.post.mockResolvedValue(envelope({}))
    const io = scripted(['z', 'o', 'k', ' ', 'k', 'why?', 'e'])
    const summary = await reviewApprovals(api, rows('agent_plan:p1', 'agent_plan:p2'), {io, baseUrl: 'https://app.test'})
    expect(io.opened).toEqual(['https://app.test/member/home/approvals/agent_plan/p1'])
    expect(io.out.join('\n')).toContain('Unknown choice "z"')
    expect(io.out.join('\n')).toContain('Empty question')
    expect(apiMock.post).toHaveBeenCalledWith('/cli/v1/approvals/agent_plan/p1/decision', {decision: 'ask', text: 'why?'})
    expect(apiMock.post).toHaveBeenCalledWith('/cli/v1/approvals/agent_plan/p2/decision', {decision: 'reassess'})
    expect(summary).toMatchObject({asked: 1, reassessed: 1})
  })

  it('replies with picked options and text, and refuses an empty or invalid reply', async () => {
    apiMock.get.mockResolvedValue(envelope(question))
    apiMock.post.mockResolvedValue(envelope({}))
    const io = scripted(['y', '9=9', 'y', '', '', 'y', '1=2', 'and quickly'])
    const summary = await reviewApprovals(api, rows('clarification:c1'), {io, baseUrl: 'https://app.test'})
    expect(io.out.join('\n')).toContain('There is no question 9')
    expect(io.out.join('\n')).toContain('Empty answer')
    expect(io.out.join('\n')).toContain('1) A')
    expect(apiMock.post).toHaveBeenCalledWith('/cli/v1/approvals/clarification/c1/decision', {
      decision: 'reply',
      text: 'and quickly',
      answers: {1: 'B'},
    })
    expect(summary.replied).toBe(1)
  })

  it('a reply on a question without options asks only for the text', async () => {
    apiMock.get.mockResolvedValue(envelope({...question, questions: [{position: 1, body: 'Free?'}]}))
    apiMock.post.mockResolvedValue(envelope({}))
    await reviewApprovals(api, rows('clarification:c1'), {io: scripted(['y', 'free text']), baseUrl: 'https://app.test'})
    expect(apiMock.post).toHaveBeenCalledWith('/cli/v1/approvals/clarification/c1/decision', {decision: 'reply', text: 'free text'})
  })

  it('a stopped review labels approve as retry and reject as cancel', async () => {
    apiMock.get.mockResolvedValue(envelope({...plan, phase: 'review_blocked', decisions: ['approve', 'reject'], path: undefined}))
    const io = scripted(['q'])
    const summary = await reviewApprovals(api, rows('review:r1', 'review:r2'), {io, baseUrl: 'https://app.test'})
    const out = io.out.join('\n')
    expect(out).toContain('[a] approve (retry)  [r] reject (cancel the workflow)')
    expect(out).not.toContain('[o] open')
    expect(summary.left).toBe(2)
  })

  it('counts failures and carries on: bad key, card gone, refused decision, refused deferral', async () => {
    apiMock.get
      .mockRejectedValueOnce(apiError(404, 'R404-APPROVAL-001', 'Approval not found'))
      .mockResolvedValue(envelope(plan))
    apiMock.post
      .mockRejectedValueOnce(apiError(403, 'R403-APPROVAL-001', 'Not offered'))
      .mockRejectedValueOnce(new Error('network down'))
    const io = scripted(['a', '', 'd'])
    const summary = await reviewApprovals(api, rows('nokey', 'agent_plan:gone', 'agent_plan:p1', 'agent_plan:p2'), {
      io,
      baseUrl: 'https://app.test',
    })
    const out = io.out.join('\n')
    expect(out).toContain('R404-APPROVAL-001')
    expect(out).toContain('R403-APPROVAL-001: Not offered. This card does not offer')
    expect(out).toContain('network down')
    expect(summary.failed).toBe(4)
  })

  it('end of input quits at every prompt', async () => {
    apiMock.get.mockResolvedValue(envelope({...plan, decisions: ['approve', 'reject', 'ask', 'reply'], questions: question.questions}))
    for (const answers of [[null], ['a', null], ['r', null], ['k', null], ['y', null], ['y', '', null]]) {
      // eslint-disable-next-line no-await-in-loop
      const summary = await reviewApprovals(api, rows('agent_plan:p1'), {io: scripted(answers), baseUrl: 'https://app.test'})
      expect(summary.left).toBe(1)
    }

    expect(apiMock.post).not.toHaveBeenCalled()
  })
})

describe('renderApprovalDetail edge cases', () => {
  it('renders sparse plan and report without versions or authors', async () => {
    const {renderApprovalDetail} = await import('../src/lib/approvals')
    const out = renderApprovalDetail(
      {
        kind: 'odd_kind',
        ticket: {code: 'X-1', technical_analysis: 'Use a job.', status: {name: 'Open'}},
        plan: {markdown: 'Plan body'},
        report: {body: 'Report body'},
        questions: [{body: 'No position'}],
        secret_change: {name: {key: 'K'}},
      },
      'https://app.test',
    )
    expect(out).toContain('odd_kind: X-1')
    expect(out).toContain('Technical analysis')
    expect(out).toContain('Ticket status: Open')
    expect(out).toContain('\nPlan\n')
    expect(out).toContain('\nReport\n')
    expect(out).not.toContain('By ')
    expect(out).toContain('?. No position')
    expect(out).toContain('name: K')
    expect(out).not.toContain('Open on the web')
    expect(renderApprovalDetail({}, 'https://app.test')).toContain('Approval')
  })

  it('parsePicks refuses an option without a label', () => {
    expect(parsePicks([{position: 1}], ['1=1'])).toEqual({error: 'Question 1 has no option 1.'})
  })

  it('a menu skips decisions the CLI does not know', async () => {
    apiMock.get.mockResolvedValue(envelope({decisions: ['approve', 'teleport']}))
    const io = scripted(['q'])
    await reviewApprovals(api, rows('agent_plan:p1'), {io, baseUrl: 'https://app.test'})
    expect(io.out.join('\n')).not.toContain('teleport]')
  })

  it('a review without decisions or detail still offers skip, defer and quit', async () => {
    apiMock.get.mockResolvedValue(envelope(null))
    const io = scripted(['s'])
    const summary = await reviewApprovals(api, rows('agent_plan:p1'), {io, baseUrl: 'https://app.test'})
    expect(summary.skipped).toBe(1)
  })
})
