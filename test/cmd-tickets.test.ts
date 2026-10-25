import {beforeEach, describe, expect, it, vi} from 'vitest'
import {apiMock, resetApiMock} from './helpers/api-mock'
import {PID, apiError, capture, envelope, run, runCaptured, runExpectingExit} from './helpers/command'
import {readFile, writeFile} from 'node:fs/promises'

vi.mock('../src/lib/api', async (io) => {
  const actual = await io<typeof import('../src/lib/api')>()
  const {apiMock} = await import('./helpers/api-mock')
  return {...actual, CliApi: vi.fn(function () { return apiMock })}
})
vi.mock('../src/lib/config', async (io) => {
  const actual = await io<typeof import('../src/lib/config')>()
  return {...actual, loadConfig: vi.fn(() => ({apiUrl: 'https://api.test', token: 'tok_test'}))}
})
vi.mock('node:fs/promises', () => ({readFile: vi.fn(), writeFile: vi.fn()}))

import TicketsApprove from '../src/commands/tickets/approve'
import TicketsAssign from '../src/commands/tickets/assign'
import TicketsAttach from '../src/commands/tickets/attach'
import TicketsAttachmentDownload from '../src/commands/tickets/attachment-download'
import TicketsAttachments from '../src/commands/tickets/attachments'
import TicketsBranch from '../src/commands/tickets/branch'
import TicketsComment from '../src/commands/tickets/comment'
import TicketsCommentDelete from '../src/commands/tickets/comment-delete'
import TicketsComments from '../src/commands/tickets/comments'
import TicketsCreate from '../src/commands/tickets/create'
import TicketsDelete from '../src/commands/tickets/delete'
import TicketsDetach from '../src/commands/tickets/detach'
import TicketsEligibility from '../src/commands/tickets/eligibility'
import TicketsLeaseClaim from '../src/commands/tickets/lease/claim'
import TicketsLeaseRelease from '../src/commands/tickets/lease/release'
import TicketsLeaseRenew from '../src/commands/tickets/lease/renew'
import TicketsLinks from '../src/commands/tickets/links'
import TicketsList from '../src/commands/tickets/list'
import TicketsMilestone from '../src/commands/tickets/milestone'
import TicketsPr from '../src/commands/tickets/pr'
import TicketsReject from '../src/commands/tickets/reject'
import TicketsReport from '../src/commands/tickets/report'
import TicketsClarifications from '../src/commands/tickets/clarifications'
import TicketsReportShow from '../src/commands/tickets/report-show'
import TicketsReportVersions from '../src/commands/tickets/report-versions'
import TicketsReviewer from '../src/commands/tickets/reviewer'
import TicketsShow from '../src/commands/tickets/show'
import TicketsPriorities from '../src/commands/tickets/priorities'
import TicketsStatus from '../src/commands/tickets/status'
import TicketsStatuses from '../src/commands/tickets/statuses'
import TicketsUnlink from '../src/commands/tickets/unlink'
import TicketsUnreviewer from '../src/commands/tickets/unreviewer'
import TicketsUnvote from '../src/commands/tickets/unvote'
import TicketsUnwatch from '../src/commands/tickets/unwatch'
import TicketsUpdate from '../src/commands/tickets/update'
import TicketsVote from '../src/commands/tickets/vote'
import TicketsWatch from '../src/commands/tickets/watch'
import TicketsWorkContext from '../src/commands/tickets/work-context'

const T = 'tk-1'
// Lookup ids: passing a UUID skips the by-name resolution, so no extra GET (CYCL-34).
const STATUS_UUID = '66666666-6666-4666-8666-666666666666'
const PRIORITY_UUID = '77777777-7777-4777-8777-777777777777'

beforeEach(() => {
  resetApiMock()
  vi.mocked(readFile).mockReset()
  vi.mocked(writeFile).mockReset()
})

describe('tickets — full flag coverage', () => {
  it('create maps every optional flag (all set)', async () => {
    apiMock.post.mockResolvedValue(envelope({code: 'DRRA-9'}))
    await runCaptured(TicketsCreate, [
      '--project', PID, '--title', 'T', '--kind', 'story', '--description', 'd',
      '--step-given', 'g', '--step-when', 'w', '--step-then', 't', '--step-expected', 'e',
      '--status', STATUS_UUID, '--priority', PRIORITY_UUID,
    ])
    expect(apiMock.post).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/tickets`, {
      title: 'T', kind: 'story', description: 'd',
      scenarios_attributes: [{step_given: 'g', step_when: 'w', step_then: 't', step_expected: 'e'}],
      status_id: STATUS_UUID, priority_id: PRIORITY_UUID,
    })
  })

  it('create maps --scenarios (JSON), --condition (repeatable) and --technical-analysis', async () => {
    apiMock.post.mockResolvedValue(envelope({code: 'DRRA-10'}))
    await runCaptured(TicketsCreate, [
      '--project', PID, '--title', 'T', '--kind', 'bug', '--technical-analysis', 'N+1',
      '--scenarios', '[{"title":"Happy","step_given":"in","step_when":"buy","step_then":"ok"}]',
      '--condition', 'mail sent', '--condition', 'order stored',
      '--status', STATUS_UUID, '--priority', PRIORITY_UUID,
    ])
    expect(apiMock.post).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/tickets`, {
      title: 'T', kind: 'bug', technical_analysis: 'N+1',
      scenarios_attributes: [{title: 'Happy', step_given: 'in', step_when: 'buy', step_then: 'ok'}],
      conditions_attributes: [{text: 'mail sent'}, {text: 'order stored'}],
      status_id: STATUS_UUID, priority_id: PRIORITY_UUID,
    })
  })

  it('create rejects an invalid --scenarios JSON', async () => {
    await expect(runCaptured(TicketsCreate, ['--project', PID, '--title', 'T', '--scenarios', 'not-json'])).rejects.toThrow(
      /valid JSON array/,
    )
  })

  // --replace: the flag → body key mapping, without the merge with the current ticket (covered separately).
  it('update maps every optional flag (all set)', async () => {
    apiMock.put.mockResolvedValue(envelope({code: 'DRRA-1'}))
    await runCaptured(TicketsUpdate, [
      T, '--project', PID, '--replace', '--title', 'T', '--kind', 'bug', '--description', 'd', '--weight', '5',
      '--step-given', 'g', '--step-when', 'w', '--step-then', 't', '--step-expected', 'e',
      '--status', STATUS_UUID, '--priority', PRIORITY_UUID, '--assignee-id', 'a1', '--milestone-id', 'm1',
      '--platform-id', 'pf1', '--platform-id', 'pf2',
    ])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/tickets/${T}`, {
      title: 'T', kind: 'bug', description: 'd', weight: '5',
      scenarios_attributes: [{step_given: 'g', step_when: 'w', step_then: 't', step_expected: 'e'}],
      status_id: STATUS_UUID, priority_id: PRIORITY_UUID, assignee_id: 'a1', milestone_id: 'm1',
      platform_ids: ['pf1', 'pf2'],
    })
  })

  it('attachments renders empty cells for a sparse row', async () => {
    apiMock.get.mockResolvedValue(envelope([{}]))
    const {result} = await runCaptured(TicketsAttachments, [T, '--project', PID])
    expect((result as {data: unknown[]}).data).toHaveLength(1)
  })

  it('attach renders empty cells for a sparse upload row', async () => {
    vi.mocked(readFile).mockResolvedValue(Buffer.from('x'))
    apiMock.upload.mockResolvedValue(envelope([{}]))
    const {stdout} = await runCaptured(TicketsAttach, [T, '--project', PID, '--file', './a.txt'])
    expect(stdout).toContain('Attached 1 file')
  })

  it('comments renders a sparse comment with fallbacks', async () => {
    apiMock.get.mockResolvedValue(envelope([{}], {total_pages: 1}))
    const {result} = await runCaptured(TicketsComments, [T, '--project', PID])
    expect((result as {data: unknown[]}).data).toHaveLength(1)
  })

  it('attachment-download falls back to the server filename', async () => {
    apiMock.download.mockResolvedValue({data: new Uint8Array([1, 2]), filename: 'server.bin'})
    await runCaptured(TicketsAttachmentDownload, [T, 'a1', '--project', PID])
    expect(vi.mocked(writeFile)).toHaveBeenCalledWith('server.bin', expect.any(Uint8Array))
  })

  it('attachment-download falls back to the attachment id when no filename is known', async () => {
    apiMock.download.mockResolvedValue({data: new Uint8Array([1]), filename: undefined})
    const {result} = await runCaptured(TicketsAttachmentDownload, [T, 'a1', '--project', PID])
    expect((result as {filename: string}).filename).toBe('a1')
  })
})

describe('tickets list', () => {
  it('lists tickets', async () => {
    apiMock.get.mockResolvedValue(envelope([{code: 'DRRA-1', title: 'Fix login', status: 'open'}]))
    const {stdout} = await runCaptured(TicketsList, ['--project', PID])
    expect(apiMock.get).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/tickets?page=1`)
    expect(stdout).toContain('DRRA-1')
  })

  it('--assignee me --open asks only for my unfinished tickets', async () => {
    apiMock.get.mockResolvedValue(envelope([]))
    await run(TicketsList, ['--project', PID, '--assignee', 'me', '--open'])
    expect(apiMock.get).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/tickets?page=1&assignee=me&open=true`)
  })

  it('exits non-zero on an API error', async () => {
    apiMock.get.mockRejectedValue(apiError(500, 'R500-SYS-001', 'boom'))
    const {stderr} = await runExpectingExit(TicketsList, ['--project', PID])
    expect(stderr).toContain('R500-SYS-001')
  })

  // CYCL-12 · A ticket with multi-line text must stay exportable: if the control
  // chars end up raw inside a JSON string, `cyi ... --json | jq` fails and the
  // pipeline goes on with an empty file — a silent failure, which is the worst
  // way. Here the payload deliberately contains newline, carriage return and tab.
  const MULTILINE = 'Prima riga\nSeconda riga\r\nCon un tab:\tfine'

  it('a ticket with multi-line text stays serializable into valid JSON', async () => {
    const ticket = {code: 'DRRA-2', title: 'Bug', status: 'open', description: MULTILINE}
    apiMock.get.mockResolvedValue(envelope([ticket]))
    const result = await run(TicketsList, ['--project', PID, '--json'])

    // The full round a pipeline does: serialize → parse again. If the control chars were
    // not escaped, JSON.parse would throw as jq does.
    const roundTrip = JSON.parse(JSON.stringify(result)) as {data: Array<{description: string}>}
    expect(roundTrip.data[0].description).toBe(MULTILINE)
  })

  it('with --json only valid JSON ends up on stdout, even across several pages', async () => {
    apiMock.get.mockResolvedValue(
      envelope([{code: 'DRRA-3', title: 'Bug', status: 'open', description: MULTILINE}], {
        page: 1,
        total: 40,
        total_pages: 4,
      }),
    )
    const {stdout} = await runCaptured(TicketsList, ['--project', PID, '--json'])

    // What stdout contains is exactly what `cyi ... --json | jq` receives: it must
    // parse again on its own. Neither the human table nor the pagination footer may end up
    // next to it — one extra line is enough to break the reader.
    expect(() => JSON.parse(stdout)).not.toThrow()
    expect((JSON.parse(stdout) as {data: Array<{description: string}>}).data[0].description).toBe(MULTILINE)
    expect(stdout).not.toContain('CODE')
  })
})

describe('tickets statuses', () => {
  it('lists the org ticket statuses with their ids (org-level, no --project)', async () => {
    // Second row is bare ({}) to exercise the id/code/label/color fallbacks without crashing.
    apiMock.get.mockResolvedValue(envelope([{id: 'st-open', code: 'open', label: 'Open', color: 'amber'}, {}]))
    const {stdout} = await runCaptured(TicketsStatuses, [])
    expect(apiMock.get).toHaveBeenCalledWith('/cli/v1/types/ticket_statuses')
    expect(stdout).toContain('st-open')
    expect(stdout).toContain('Open')
  })

  it('exits non-zero on an API error', async () => {
    apiMock.get.mockRejectedValue(apiError(500, 'R500-SYS-001', 'boom'))
    const {stderr} = await runExpectingExit(TicketsStatuses, [])
    expect(stderr).toContain('R500-SYS-001')
  })
})

describe('tickets priorities', () => {
  it('lists the org ticket priorities with their ids (org-level, no --project)', async () => {
    // Second row is bare ({}) to exercise the id/code/label/color fallbacks without crashing.
    apiMock.get.mockResolvedValue(envelope([{id: 'pr-high', code: 'high', label: 'High', color: 'red'}, {}]))
    const {stdout} = await runCaptured(TicketsPriorities, [])
    expect(apiMock.get).toHaveBeenCalledWith('/cli/v1/types/ticket_priorities')
    expect(stdout).toContain('pr-high')
    expect(stdout).toContain('High')
  })

  it('exits non-zero on an API error', async () => {
    apiMock.get.mockRejectedValue(apiError(500, 'R500-SYS-001', 'boom'))
    const {stderr} = await runExpectingExit(TicketsPriorities, [])
    expect(stderr).toContain('R500-SYS-001')
  })
})

describe('tickets show', () => {
  /** Route the 3 endpoints the full show hits: ticket, comments, attachments. */
  function mockFullShow(
    ticket: Record<string, unknown>,
    comments: Array<Record<string, unknown>> = [],
    attachments: Array<Record<string, unknown>> = [],
  ): void {
    apiMock.get.mockImplementation((path: string) => {
      if (path.includes('/comments')) return Promise.resolve(envelope(comments, {total_pages: 1}))
      if (path.includes('/attachments')) return Promise.resolve(envelope(attachments, {total_pages: 1}))
      return Promise.resolve(envelope(ticket))
    })
  }

  it('fetches ticket, comments and attachments in a single command', async () => {
    mockFullShow({code: 'DRRA-1', title: 'Fix login'})
    const {stdout} = await runCaptured(TicketsShow, [T, '--project', PID])
    expect(apiMock.get).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/tickets/${T}`)
    expect(apiMock.get).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/tickets/${T}/comments?page=1&per=100`)
    expect(apiMock.get).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/tickets/${T}/attachments?page=1&per=100`)
    expect(stdout).toContain('Fix login')
    expect(stdout).toContain('Comments (0)')
    expect(stdout).toContain('Attachments (0)')
  })

  it('renders description, technical analysis, BDD scenarios and DoD', async () => {
    mockFullShow({
      code: 'DRRA-1', title: 'Crash', kind: 'bug',
      description: 'General context', technical_analysis: 'stack trace + N+1',
      scenarios: [
        {title: 'Login', step_given: 'user logged in', step_when: 'opens the dashboard', step_then: 'error 500', step_expected: 'dashboard loads'},
      ],
      conditions: [{text: 'dashboard loads clean'}],
    })
    const {stdout} = await runCaptured(TicketsShow, [T, '--project', PID])
    expect(stdout).toContain('Description\n-----------\nGeneral context')
    expect(stdout).toContain('Technical analysis')
    expect(stdout).toContain('Scenario 1: Login')
    expect(stdout).toContain('Given: user logged in')
    expect(stdout).toContain('Expected: dashboard loads')
    expect(stdout).toContain('Definition of Done')
    expect(stdout).toContain('- dashboard loads clean')
  })

  it('omits empty scenarios and DoD (story ticket with description only)', async () => {
    mockFullShow({code: 'DRRA-2', title: 'Feat', kind: 'story', description: 'Do it', scenarios: [], conditions: []})
    const {stdout} = await runCaptured(TicketsShow, [T, '--project', PID])
    expect(stdout).toContain('Description')
    expect(stdout).not.toContain('Scenario 1')
    expect(stdout).not.toContain('Definition of Done')
  })

  it('renders the comments with their files and the attachments table', async () => {
    mockFullShow(
      {code: 'DRRA-1', title: 'Crash', platforms: ['iOS', 'Android']},
      [{id: 'c1', author: 'Mario', created_at: '2026-07-02', body: 'Screenshot allegato',
        files: [{id: 'f1', filename: 'shot.png', content_type: 'image/png', byte_size: 123}]}],
      [{id: 'a1', filename: 'log.txt', content_type: 'text/plain', byte_size: 9, created_at: '2026-07-02'}],
    )
    const {stdout} = await runCaptured(TicketsShow, [T, '--project', PID])
    expect(stdout).toContain('platforms: iOS, Android')
    expect(stdout).toContain('Comments (1)')
    expect(stdout).toContain('── Mario · 2026-07-02 · c1')
    expect(stdout).toContain('Screenshot allegato')
    expect(stdout).toContain('[file] f1 · shot.png · image/png · 123 bytes')
    expect(stdout).toContain('Attachments (1)')
    expect(stdout).toContain('log.txt')
  })

  it('returns the merged payload for --json (ticket + comments + attachments)', async () => {
    mockFullShow({code: 'DRRA-1'}, [{id: 'c1', body: 'x', files: []}], [{id: 'a1'}])
    const {result} = await runCaptured(TicketsShow, [T, '--project', PID])
    const data = (result as {data: Record<string, unknown>}).data
    expect(data.code).toBe('DRRA-1')
    expect(data.comments).toHaveLength(1)
    expect(data.attachments).toHaveLength(1)
  })

  it('neutralises control chars while keeping newlines in multi-line bodies', async () => {
    mockFullShow({code: 'DRRA-1', title: 'X', description: 'line1\nline2\u001B[31mred'})
    const {stdout} = await runCaptured(TicketsShow, [T, '--project', PID])
    expect(stdout).toContain('line1\nline2 [31mred')
  })

  it('exposes the guidance (references and procedures) without touching the description', async () => {
    mockFullShow({
      code: 'DRRA-1',
      title: 'Crash',
      description: 'Contesto',
      guidance: {
        references: [
          {key: 'global/git.md', origin: 'org', level: 'project', required: true, application_mode: 'always'},
        ],
        procedures: [
          {key: 'procedures/reset.md', origin: 'stack', level: 'global', required: false, application_mode: 'on_demand'},
        ],
      },
    })
    const {stdout} = await runCaptured(TicketsShow, [T, '--project', PID])
    expect(stdout).toContain('Description\n-----------\nContesto')
    expect(stdout).toContain('References')
    expect(stdout).toContain('Procedures')
    expect(stdout).toMatch(/global\/git\.md.*org.*project.*yes.*always/)
    expect(stdout).toMatch(/procedures\/reset\.md.*stack.*global.*no.*on_demand/)
  })

  it('no guidance section when the backend does not return it (compatibility)', async () => {
    mockFullShow({code: 'DRRA-1', title: 'Crash', description: 'Contesto'})
    const {stdout} = await runCaptured(TicketsShow, [T, '--project', PID])
    expect(stdout).not.toContain('References')
    expect(stdout).not.toContain('Procedures')
  })
})

describe('tickets create', () => {
  it('posts title + default kind', async () => {
    apiMock.post.mockResolvedValue(envelope({code: 'DRRA-2'}))
    const {stdout} = await runCaptured(TicketsCreate, [
      '--project', PID, '--title', 'Checkout fails', '--status', STATUS_UUID, '--priority', PRIORITY_UUID,
    ])
    expect(apiMock.post).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/tickets`, {
      title: 'Checkout fails', kind: 'bug', status_id: STATUS_UUID, priority_id: PRIORITY_UUID,
    })
    expect(stdout).toContain('Ticket created')
  })

  it('maps the --step-* shorthand into a single scenario (snake_case body keys)', async () => {
    apiMock.post.mockResolvedValue(envelope({code: 'DRRA-3'}))
    await runCaptured(TicketsCreate, [
      '--project', PID, '--title', 'Login bug', '--kind', 'bug',
      '--step-given', 'logged out', '--step-when', 'submit', '--step-then', '500',
      '--status', STATUS_UUID, '--priority', PRIORITY_UUID,
    ])
    expect(apiMock.post).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/tickets`, {
      title: 'Login bug',
      kind: 'bug',
      scenarios_attributes: [{step_given: 'logged out', step_when: 'submit', step_then: '500'}],
      status_id: STATUS_UUID,
      priority_id: PRIORITY_UUID,
    })
  })
})

// Status and priority: the server demands them, the help gave them as optional, and the ids had to be
// looked up first with two separate commands. Now whoever omits them gets the defaults, and whoever gives them can
// write them as they read them (code or label) instead of as UUIDs (CYCL-34).
// CYCL-52 — after a successful POST the ticket EXISTS. If the command exits non-zero without naming it, the
// reader concludes it was not created and creates it again: that is how CYRA-755 and CYRA-756 were born, the
// same ticket twice. Here rendering is broken on purpose and the code is required to come out anyway.
describe('tickets create — a rendering failure does not hide the created ticket (CYCL-52)', () => {
  /** Breaks rendering only once, then lets the requested mode answer. */
  function breakRendering(json: boolean): Error {
    const failure = new Error('rendering failed')
    vi.spyOn(TicketsCreate.prototype as unknown as {jsonEnabled: () => boolean}, 'jsonEnabled')
      .mockImplementationOnce(() => { throw failure })
      .mockImplementation(() => json)
    return failure
  }

  it('in data mode exits with a single envelope, carrying the ticket and the reason', async () => {
    apiMock.post.mockResolvedValue(envelope({code: 'DRRA-9', id: 'tk-9'}))
    const emitted: unknown[] = []
    vi.spyOn(TicketsCreate.prototype as unknown as {logJson: (v: unknown) => void}, 'logJson')
      .mockImplementation((v: unknown) => { emitted.push(v) })
    breakRendering(true)

    await runExpectingExit(TicketsCreate, [
      '--project', PID, '--title', 'Checkout fails', '--status', STATUS_UUID, '--priority', PRIORITY_UUID,
    ], 1)

    expect(emitted).toHaveLength(1)
    expect(emitted[0]).toMatchObject({data: {code: 'DRRA-9', id: 'tk-9'}, error: {message: 'rendering failed'}})
    vi.restoreAllMocks()
  })

  it('in human mode names the created ticket before propagating the failure', async () => {
    apiMock.post.mockResolvedValue(envelope({code: 'DRRA-10', id: 'tk-10'}))
    const lines: string[] = []
    vi.spyOn(TicketsCreate.prototype as unknown as {logToStderr: (m?: string) => void}, 'logToStderr')
      .mockImplementation((m?: string) => { lines.push(String(m)) })
    breakRendering(false)

    await expect(run(TicketsCreate, [
      '--project', PID, '--title', 'Checkout fails', '--status', STATUS_UUID, '--priority', PRIORITY_UUID,
    ])).rejects.toThrow()

    expect(lines.join('\n')).toContain('DRRA-10')
    vi.restoreAllMocks()
  })
})

describe('tickets create — status and priority (CYCL-34)', () => {
  const STATUSES = [
    {id: 'st-open', code: 'open', label: 'Open'},
    {id: 'st-progress', code: 'in_progress', label: 'In Progress'},
    {id: 'st-review', code: 'in_review', label: 'In Review'},
  ]
  const PRIORITIES = [
    {id: 'pr-low', code: 'low', label: 'Low'},
    {id: 'pr-medium', code: 'medium', label: 'Medium'},
    {id: 'pr-high', code: 'high', label: 'High'},
  ]

  function mockLookups(statuses: unknown[] = STATUSES, priorities: unknown[] = PRIORITIES): void {
    apiMock.post.mockResolvedValue(envelope({code: 'DRRA-4'}))
    apiMock.get.mockImplementation(async (path: string) => {
      if (path.startsWith('/cli/v1/types/ticket_statuses')) return envelope(statuses)
      if (path.startsWith('/cli/v1/types/ticket_priorities')) return envelope(priorities)
      throw new Error(`GET inattesa: ${path}`)
    })
  }

  /** The body of the create POST. */
  function postedBody(): Record<string, unknown> {
    return apiMock.post.mock.calls[0][1] as Record<string, unknown>
  }

  it('without giving them the ticket is born with the defaults, instead of being rejected by the server', async () => {
    mockLookups()
    await runCaptured(TicketsCreate, ['--project', PID, '--title', 'Checkout fails'])
    expect(postedBody()).toEqual({
      title: 'Checkout fails',
      kind: 'bug',
      status_id: 'st-open',
      priority_id: 'pr-medium',
    })
  })

  it('accepts the code instead of the id', async () => {
    mockLookups()
    await runCaptured(TicketsCreate, [
      '--project', PID, '--title', 'T', '--status', 'in_progress', '--priority', 'high',
    ])
    expect(postedBody()).toMatchObject({status_id: 'st-progress', priority_id: 'pr-high'})
  })

  it('accepts the label, case-insensitively', async () => {
    mockLookups()
    await runCaptured(TicketsCreate, [
      '--project', PID, '--title', 'T', '--status', 'in review', '--priority', 'LOW',
    ])
    expect(postedBody()).toMatchObject({status_id: 'st-review', priority_id: 'pr-low'})
  })

  it('an id passes as is, without reading the lookups', async () => {
    apiMock.post.mockResolvedValue(envelope({code: 'DRRA-5'}))
    await runCaptured(TicketsCreate, [
      '--project', PID, '--title', 'T', '--status', STATUS_UUID, '--priority', PRIORITY_UUID,
    ])
    expect(postedBody()).toMatchObject({status_id: STATUS_UUID, priority_id: PRIORITY_UUID})
    expect(apiMock.get).not.toHaveBeenCalled()
  })

  it('the old --status-id/--priority-id stay valid', async () => {
    mockLookups()
    await runCaptured(TicketsCreate, [
      '--project', PID, '--title', 'T', '--status-id', 'open', '--priority-id', PRIORITY_UUID,
    ])
    expect(postedBody()).toMatchObject({status_id: 'st-open', priority_id: PRIORITY_UUID})
  })

  it('a nonexistent status stops the command before creating the ticket and lists the valid ones', async () => {
    mockLookups()
    const {stderr} = await runExpectingExit(
      TicketsCreate,
      ['--project', PID, '--title', 'T', '--status', 'urgentissimo'],
    )
    expect(stderr).toContain('C404-STA-001')
    expect(stderr).toContain('urgentissimo')
    expect(stderr).toContain('open, in_progress, in_review')
    expect(apiMock.post).not.toHaveBeenCalled()
  })

  it('the code wins over the label of another entry, instead of creating an ambiguity', async () => {
    mockLookups(STATUSES, [
      {id: 'pr-1', code: 'urgent', label: 'Alta'},
      {id: 'pr-2', code: 'high', label: 'Urgent'},
    ])
    await runCaptured(TicketsCreate, ['--project', PID, '--title', 'T', '--priority', 'urgent'])
    expect(postedBody()).toMatchObject({priority_id: 'pr-1'})
  })

  it('two entries with the same label are not guessed', async () => {
    mockLookups(STATUSES, [
      {id: 'pr-1', code: 'urgent', label: 'Urgente'},
      {id: 'pr-2', code: 'blocker', label: 'Urgente'},
    ])
    const {stderr} = await runExpectingExit(
      TicketsCreate,
      ['--project', PID, '--title', 'T', '--priority', 'Urgente'],
    )
    expect(stderr).toContain('C404-PRI-001')
    expect(stderr).toContain('Urgente')
    expect(stderr).toContain('urgent, blocker')
    expect(apiMock.post).not.toHaveBeenCalled()
  })

  it('if the organization lacks the default status it says so, instead of letting the creation fail', async () => {
    mockLookups([{id: 'st-1', code: 'todo', label: 'Da fare'}])
    const {stderr} = await runExpectingExit(TicketsCreate, ['--project', PID, '--title', 'T'])
    expect(stderr).toContain('C404-STA-001')
    expect(stderr).toContain('open')
    expect(stderr).toContain('--status')
    expect(apiMock.post).not.toHaveBeenCalled()
  })

  it('lists by label the entry that has no code, and stays silent if there is nothing to list', async () => {
    mockLookups([], [{code: 'x'}, {id: 'pr-1', label: 'Solo etichetta'}])
    const {stderr: senzaElenco} = await runExpectingExit(
      TicketsCreate,
      ['--project', PID, '--title', 'T', '--status', 'open', '--priority', 'Solo etichetta'],
    )
    expect(senzaElenco).toContain('C404-STA-001')
    expect(senzaElenco).not.toContain('known:')

    const {stderr: conElenco} = await runExpectingExit(
      TicketsCreate,
      ['--project', PID, '--title', 'T', '--status', STATUS_UUID, '--priority', 'sconosciuta'],
    )
    expect(conElenco).toContain('known: x, Solo etichetta')
  })

  it('a lookup that does not answer with a list does not crash the command', async () => {
    apiMock.post.mockResolvedValue(envelope({code: 'DRRA-6'}))
    apiMock.get.mockResolvedValue(envelope({}))
    const {stderr} = await runExpectingExit(TicketsCreate, ['--project', PID, '--title', 'T'])
    expect(stderr).toContain('C404-STA-001')
    expect(apiMock.post).not.toHaveBeenCalled()
  })

  it('the help states the defaults the command really applies', () => {
    const flags = TicketsCreate.flags as Record<string, {description?: string}>
    expect(flags.status.description).toContain('default: open')
    expect(flags.priority.description).toContain('default: medium')
    expect(flags.status.description).toContain('code')
    expect(flags.priority.description).toContain('code')
  })
})

describe('tickets update', () => {
  // The ticket as the GET returns it: labels/names for the references (priority, assignee,
  // milestone, platforms), ids only for status_ref and parent.
  const CURRENT = {
    id: T,
    code: 'DRRA-1',
    title: 'Titolo vecchio',
    kind: 'story',
    description: 'Descrizione già scritta',
    technical_analysis: 'Analisi già scritta',
    weight: 5,
    due_at: '2026-09-01T00:00:00.000+02:00',
    parent_id: 'ep-1',
    status: 'In Progress',
    status_ref: {id: 'st-progress', code: 'in_progress', label: 'In Progress'},
    priority: 'High',
    assignee: 'Chiara',
    milestone: 'Sprint 1',
    platforms: ['CLI'],
    scenarios: [{step_given: 'g', step_when: 'w', step_then: 't'}],
    conditions: [{text: 'c'}],
  }

  /** The full state the merge must send back when nothing is touched. */
  const PRESERVED = {
    title: 'Titolo vecchio',
    kind: 'story',
    description: 'Descrizione già scritta',
    technical_analysis: 'Analisi già scritta',
    weight: 5,
    due_at: '2026-09-01T00:00:00.000+02:00',
    parent_id: 'ep-1',
    status_id: 'st-progress',
    priority_id: 'pr-high',
    assignee_id: 'acc-1',
    milestone_id: 'ms-1',
    platform_ids: ['pf-cli'],
  }

  function mockUpdateReads(
    ticket: Record<string, unknown> = CURRENT,
    lookups: Partial<Record<'priorities' | 'members' | 'milestones' | 'platforms', unknown[]>> = {},
  ): void {
    apiMock.put.mockResolvedValue(envelope({code: 'DRRA-1'}))
    apiMock.get.mockImplementation(async (path: string) => {
      if (path.startsWith(`/cli/v1/projects/${PID}/tickets/${T}`)) return envelope(ticket)
      if (path.startsWith('/cli/v1/types/ticket_priorities')) {
        return envelope(lookups.priorities ?? [{id: 'pr-high', code: 'high', label: 'High'}])
      }
      if (path.startsWith('/cli/v1/members')) {
        return envelope(lookups.members ?? [{account_id: 'acc-1', name: 'Chiara', email: 'chiara@acme.it'}])
      }
      if (path.startsWith(`/cli/v1/projects/${PID}/milestones`)) {
        return envelope(lookups.milestones ?? [{id: 'ms-1', code: 'sprint-1', label: 'Sprint 1'}])
      }
      if (path.startsWith('/cli/v1/platforms')) {
        return envelope(lookups.platforms ?? [{id: 'pf-cli', code: 'cli', label: 'CLI'}])
      }
      throw new Error(`GET inattesa: ${path}`)
    })
  }

  it('changing only the title does not erase the other fields (CYCL-30)', async () => {
    mockUpdateReads()
    const {stdout} = await runCaptured(TicketsUpdate, [T, '--project', PID, '--title', 'Titolo nuovo'])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/tickets/${T}`, {
      ...PRESERVED,
      title: 'Titolo nuovo',
    })
    expect(stdout).toContain('Ticket updated')
  })

  it('does not resend scenarios and conditions: the backend leaves them intact if the body does not carry them', async () => {
    mockUpdateReads()
    await runCaptured(TicketsUpdate, [T, '--project', PID, '--title', 'Titolo nuovo'])
    const body = apiMock.put.mock.calls[0][1] as Record<string, unknown>
    expect(body).not.toHaveProperty('scenarios_attributes')
    expect(body).not.toHaveProperty('conditions_attributes')
  })

  it('the passed flags win over the current values and spare the matching lookup', async () => {
    mockUpdateReads()
    await runCaptured(TicketsUpdate, [
      T, '--project', PID, '--description', 'Nuova descrizione', '--priority', PRIORITY_UUID,
      '--assignee-id', 'acc-9', '--milestone-id', 'ms-9', '--platform-id', 'pf-api',
    ])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/tickets/${T}`, {
      ...PRESERVED,
      description: 'Nuova descrizione',
      priority_id: PRIORITY_UUID,
      assignee_id: 'acc-9',
      milestone_id: 'ms-9',
      platform_ids: ['pf-api'],
    })
    const read = apiMock.get.mock.calls.map((call) => String(call[0]))
    expect(read.some((path) => path.startsWith('/cli/v1/types/ticket_priorities'))).toBe(false)
    expect(read.some((path) => path.startsWith('/cli/v1/members'))).toBe(false)
    expect(read.some((path) => path.startsWith('/cli/v1/platforms'))).toBe(false)
  })

  // Changing priority must not force looking up its id first (CYCL-34).
  it('--status and --priority accept the name and resolve it to an id', async () => {
    apiMock.put.mockResolvedValue(envelope({code: 'DRRA-1'}))
    apiMock.get.mockImplementation(async (path: string) => {
      if (path.startsWith(`/cli/v1/projects/${PID}/tickets/${T}`)) return envelope(CURRENT)
      if (path.startsWith('/cli/v1/types/ticket_statuses')) {
        return envelope([{id: 'st-review', code: 'in_review', label: 'In Review'}])
      }
      if (path.startsWith('/cli/v1/types/ticket_priorities')) {
        return envelope([{id: 'pr-low', code: 'low', label: 'Low'}])
      }
      if (path.startsWith('/cli/v1/members')) return envelope([{account_id: 'acc-1', name: 'Chiara'}])
      if (path.startsWith(`/cli/v1/projects/${PID}/milestones`)) return envelope([{id: 'ms-1', label: 'Sprint 1'}])
      if (path.startsWith('/cli/v1/platforms')) return envelope([{id: 'pf-cli', label: 'CLI'}])
      throw new Error(`GET inattesa: ${path}`)
    })
    await runCaptured(TicketsUpdate, [T, '--project', PID, '--status', 'in_review', '--priority', 'Low'])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/tickets/${T}`, {
      ...PRESERVED,
      status_id: 'st-review',
      priority_id: 'pr-low',
    })
  })

  it('fields already empty on the server do not end up in the body', async () => {
    mockUpdateReads({
      id: T, title: 'Solo titolo', kind: 'bug', description: null, technical_analysis: null,
      weight: null, due_at: null, parent_id: null, assignee: null, milestone: null, platforms: [],
      status_ref: {id: 'st-open'}, priority: 'High',
    })
    await runCaptured(TicketsUpdate, [T, '--project', PID, '--title', 'Titolo nuovo'])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/tickets/${T}`, {
      title: 'Titolo nuovo',
      kind: 'bug',
      status_id: 'st-open',
      priority_id: 'pr-high',
    })
  })

  it('--clear empties the given field and leaves the others in place', async () => {
    mockUpdateReads()
    await runCaptured(TicketsUpdate, [T, '--project', PID, '--clear', 'description', '--clear', 'platforms'])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/tickets/${T}`, {
      ...PRESERVED,
      description: null,
      platform_ids: [],
    })
  })

  it('--clear on a field also passed as a flag → rejection without PUT (exit 2)', async () => {
    mockUpdateReads()
    const {message} = await runExpectingExit(
      TicketsUpdate,
      [T, '--project', PID, '--description', 'x', '--clear', 'description'],
      2,
    )
    expect(message).toContain('--clear description')
    expect(apiMock.put).not.toHaveBeenCalled()
  })

  it('--clear of a nonexistent field → parse error (exit 2)', async () => {
    mockUpdateReads()
    await runExpectingExit(TicketsUpdate, [T, '--project', PID, '--clear', 'titolo'], 2)
    expect(apiMock.put).not.toHaveBeenCalled()
  })

  it('--replace sends only the passed fields, without reading the ticket (full replacement)', async () => {
    mockUpdateReads()
    await runCaptured(TicketsUpdate, [
      T, '--project', PID, '--replace', '--title', 'New', '--platform-id', 'pf1', '--platform-id', 'pf2',
    ])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/tickets/${T}`, {
      title: 'New',
      platform_ids: ['pf1', 'pf2'],
    })
    expect(apiMock.get).not.toHaveBeenCalled()
  })

  it('current assignee not resolvable → stops before the PUT instead of erasing it', async () => {
    mockUpdateReads(CURRENT, {members: [{account_id: 'acc-2', name: 'Marco', email: 'marco@acme.it'}]})
    const {message} = await runExpectingExit(TicketsUpdate, [T, '--project', PID, '--title', 'Titolo nuovo'], 2)
    expect(message).toContain('Chiara')
    expect(message).toContain('--assignee-id')
    expect(apiMock.put).not.toHaveBeenCalled()
  })

  it('ambiguous current reference (two namesakes) → stops before the PUT', async () => {
    mockUpdateReads(CURRENT, {
      members: [
        {account_id: 'acc-1', name: 'Chiara', email: 'chiara@acme.it'},
        {account_id: 'acc-3', name: 'Chiara', email: 'chiara.b@acme.it'},
      ],
    })
    const {message} = await runExpectingExit(TicketsUpdate, [T, '--project', PID, '--title', 'Titolo nuovo'], 2)
    expect(message).toContain('Chiara')
    expect(apiMock.put).not.toHaveBeenCalled()
  })

  it('unreadable current status (backend without status_ref) → stops before the PUT', async () => {
    mockUpdateReads({id: T, title: 'X', kind: 'bug', priority: 'High'})
    const {message} = await runExpectingExit(TicketsUpdate, [T, '--project', PID, '--title', 'Titolo nuovo'], 2)
    expect(message).toContain('--status')
    expect(apiMock.put).not.toHaveBeenCalled()
  })

  it('reads every lookup page: the current milestone may be beyond the first', async () => {
    apiMock.put.mockResolvedValue(envelope({code: 'DRRA-1'}))
    apiMock.get.mockImplementation(async (path: string) => {
      if (path.startsWith(`/cli/v1/projects/${PID}/tickets/${T}`)) return envelope(CURRENT)
      if (path.startsWith('/cli/v1/types/ticket_priorities')) return envelope([{id: 'pr-high', label: 'High'}])
      if (path.startsWith('/cli/v1/members')) return envelope([{account_id: 'acc-1', name: 'Chiara'}])
      if (path.startsWith('/cli/v1/platforms')) return envelope([{id: 'pf-cli', label: 'CLI'}])
      if (path.startsWith(`/cli/v1/projects/${PID}/milestones`)) {
        return path.includes('page=1')
          ? envelope([{id: 'ms-0', label: 'Sprint 0'}], {page: 1, total_pages: 2})
          : envelope([{id: 'ms-1', label: 'Sprint 1'}], {page: 2, total_pages: 2})
      }
      throw new Error(`GET inattesa: ${path}`)
    })
    await runCaptured(TicketsUpdate, [T, '--project', PID, '--title', 'Titolo nuovo'])
    expect((apiMock.put.mock.calls[0][1] as Record<string, unknown>).milestone_id).toBe('ms-1')
  })
})

describe('tickets status', () => {
  it('PUTs the target status id', async () => {
    apiMock.put.mockResolvedValue(envelope({code: 'DRRA-1', status: 'in_progress'}))
    const {stdout} = await runCaptured(TicketsStatus, [T, '--project', PID, '--status', STATUS_UUID])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/tickets/${T}/status`, {status_id: STATUS_UUID})
    expect(apiMock.get).not.toHaveBeenCalled()
    expect(stdout).toContain('status updated')
  })

  // Here too the status is written as it is read, without looking up its id first (CYCL-34).
  it('accepts the status code, and the old --status-id stays valid', async () => {
    apiMock.put.mockResolvedValue(envelope({code: 'DRRA-1', status: 'in_review'}))
    apiMock.get.mockResolvedValue(envelope([{id: 'st-review', code: 'in_review', label: 'In Review'}]))
    await runCaptured(TicketsStatus, [T, '--project', PID, '--status-id', 'In Review'])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/tickets/${T}/status`, {status_id: 'st-review'})
  })
})

describe('tickets reject / approve (review decision)', () => {
  it('reject → POST review/rejection with the reason', async () => {
    apiMock.post.mockResolvedValue(envelope({code: 'DRRA-1', status: 'In Progress'}))
    const {stdout} = await runCaptured(TicketsReject, [T, '--project', PID, '--reason', 'Manca il test'])
    expect(apiMock.post).toHaveBeenCalledWith(
      `/cli/v1/projects/${PID}/tickets/${T}/review/rejection`,
      {reason: 'Manca il test'},
    )
    expect(stdout).toContain('review rejected')
  })

  it('reject without --reason → parse error (required flag, exit 2)', async () => {
    await runExpectingExit(TicketsReject, [T, '--project', PID], 2)
    expect(apiMock.post).not.toHaveBeenCalled()
  })

  it('reject: API error R422-TICKET-006 → exit with message', async () => {
    apiMock.post.mockRejectedValue(apiError(422, 'R422-TICKET-006', 'Il ticket non è in review.'))
    await runExpectingExit(TicketsReject, [T, '--project', PID, '--reason', 'x'])
  })

  it('approve → POST review/approval without body', async () => {
    apiMock.post.mockResolvedValue(envelope({code: 'DRRA-1', status: 'Resolved'}))
    const {stdout} = await runCaptured(TicketsApprove, [T, '--project', PID])
    expect(apiMock.post).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/tickets/${T}/review/approval`)
    expect(stdout).toContain('review approved')
  })
})

describe('tickets assign', () => {
  it('assigns via PUT with assignee_id', async () => {
    apiMock.put.mockResolvedValue(envelope({code: 'DRRA-1'}))
    const {stdout} = await runCaptured(TicketsAssign, [T, '--project', PID, '--assignee-id', 'acc-1'])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/tickets/${T}/assignee`, {assignee_id: 'acc-1'})
    expect(stdout).toContain('assigned')
  })

  it('unassigns via DELETE', async () => {
    apiMock.delete.mockResolvedValue(envelope({code: 'DRRA-1'}))
    const {stdout} = await runCaptured(TicketsAssign, [T, '--project', PID, '--unassign'])
    expect(apiMock.delete).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/tickets/${T}/assignee`)
    expect(stdout).toContain('unassigned')
  })

  it('requires --assignee-id or --unassign (exit 2)', async () => {
    const {message} = await runExpectingExit(TicketsAssign, [T, '--project', PID], 2)
    expect(message).toContain('--assignee-id')
  })
})

describe('tickets comment / comments / comment-delete', () => {
  it('comment → POST body', async () => {
    apiMock.post.mockResolvedValue(envelope({id: 'c1', body: 'Reproduced'}))
    const {stdout} = await runCaptured(TicketsComment, [T, '--project', PID, '--body', 'Reproduced'])
    expect(apiMock.post).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/tickets/${T}/comments`, {body: 'Reproduced'})
    expect(stdout).toContain('Comment added')
  })

  it('comments → reads a single page', async () => {
    apiMock.get.mockResolvedValue(envelope([{id: 'c1', author: 'Ada', body: 'hi'}], {total_pages: 1}))
    const {result, stdout} = await runCaptured(TicketsComments, [T, '--project', PID])
    expect(apiMock.get).toHaveBeenCalledTimes(1)
    expect(stdout).toContain('Ada')
    expect((result as {data: unknown[]}).data).toHaveLength(1)
  })

  it('comments → follows pagination across pages', async () => {
    apiMock.get
      .mockResolvedValueOnce(envelope([{id: 'c1', body: 'a'}], {total_pages: 2}))
      .mockResolvedValueOnce(envelope([{id: 'c2', body: 'b'}], {total_pages: 2}))
    const {result} = await runCaptured(TicketsComments, [T, '--project', PID])
    expect(apiMock.get).toHaveBeenCalledTimes(2)
    expect((result as {data: unknown[]}).data).toHaveLength(2)
  })

  it('comments → prints a placeholder when empty', async () => {
    apiMock.get.mockResolvedValue(envelope([], {total_pages: 1}))
    const {stdout} = await runCaptured(TicketsComments, [T, '--project', PID])
    expect(stdout).toContain('nessun commento')
  })

  it('comments → renders the files attached to a comment', async () => {
    apiMock.get.mockResolvedValue(envelope([
      {id: 'c1', author: 'Ada', created_at: '2026-07-02', body: 'screenshot qui',
       files: [{id: 'f1', filename: 'shot.png', content_type: 'image/png', byte_size: 456}]},
    ], {total_pages: 1}))
    const {stdout} = await runCaptured(TicketsComments, [T, '--project', PID])
    expect(stdout).toContain('[file] f1 · shot.png · image/png · 456 bytes')
  })

  it('comments → sanitizes the control chars in author and body', async () => {
    apiMock.get.mockResolvedValue(envelope([
      {id: 'c1', author: 'Ada\u001B[1m', body: 'riga1\nriga2\u001B[31m'},
    ], {total_pages: 1}))
    const {stdout} = await runCaptured(TicketsComments, [T, '--project', PID])
    expect(stdout).toContain('Ada [1m')
    expect(stdout).toContain('riga1\nriga2 [31m')
  })

  it('comment-delete → refuses without --confirm', async () => {
    const {message} = await runExpectingExit(TicketsCommentDelete, [T, '--project', PID, '--comment-id', 'c1'], 2)
    expect(message).toContain('Refusing to delete')
    expect(apiMock.delete).not.toHaveBeenCalled()
  })

  it('comment-delete → deletes with --confirm', async () => {
    apiMock.delete.mockResolvedValue(envelope({}))
    const {stdout} = await runCaptured(TicketsCommentDelete, [T, '--project', PID, '--comment-id', 'c1', '--confirm'])
    expect(apiMock.delete).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/tickets/${T}/comments/c1`)
    expect(stdout).toContain('Deleted comment c1')
  })

  // CYCL-31: the server rejects the too-long comment pointing «to the work report». The pointer is
  // useful only if it says which command writes it, with the ticket and the project already written by the user.
  it('comment → the length rejection points to the report command (CYCL-31)', async () => {
    apiMock.get.mockResolvedValue(envelope([{id: PID, key: 'CYCL'}], {total_pages: 1}))
    apiMock.post.mockRejectedValue(
      apiError(
        422,
        'R422-COMMENT-002',
        'The comment is over 240 characters (currently 300). For a long text use the work report.',
      ),
    )
    const {stderr} = await runExpectingExit(TicketsComment, [T, '--project', 'CYCL', '--body', 'x'.repeat(300)])
    expect(stderr).toContain('R422-COMMENT-002')
    expect(stderr).toContain('For a long text use the work report.')
    expect(stderr).toContain(`tickets report ${T} --project CYCL`)
  })

  it('comment → with --json the hint travels in the message, with the server code intact (CYCL-31)', async () => {
    apiMock.post.mockRejectedValue(apiError(422, 'R422-COMMENT-002', 'The comment is over 240 characters (currently 300).'))
    const cap = capture()
    try {
      await run(TicketsComment, [T, '--project', PID, '--body', 'x'.repeat(300), '--json']).catch(() => undefined)
      const payload = JSON.parse(cap.stdout()) as {error: {code: string; message: string}}
      expect(payload.error.code).toBe('R422-COMMENT-002')
      expect(payload.error.message).toContain(`tickets report ${T} --project ${PID}`)
    } finally {
      cap.restore()
    }
  })

  it('comment → a different rejection stays the server one, without hints (CYCL-31)', async () => {
    apiMock.post.mockRejectedValue(apiError(403, 'R403-TICKET-001', 'Forbidden'))
    const {stderr} = await runExpectingExit(TicketsComment, [T, '--project', PID, '--body', 'ciao'])
    expect(stderr).toContain('R403-TICKET-001: Forbidden')
    expect(stderr).not.toContain('tickets report')
  })
})

describe('tickets report — work report (CYCL-31)', () => {
  // Well beyond the 240 characters of a comment: it is exactly the text that today fits nowhere.
  const LONG = 'Resoconto della lavorazione, riga per riga. '.repeat(20)

  it('report → writes the whole text to /report, without the comment limit', async () => {
    apiMock.post.mockResolvedValue(
      envelope({id: 'r1', ticket_id: T, version: 1, body: LONG, author: 'Ada', source: 'agent', created_at: '2026-08-15T10:00:00+02:00'}),
    )
    const {stdout} = await runCaptured(TicketsReport, [T, '--project', PID, '--body', LONG])
    expect(LONG.length).toBeGreaterThan(240)
    expect(apiMock.post).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/tickets/${T}/report`, {body: LONG})
    expect(stdout).toContain('Work report saved')
    expect(stdout).toContain('version 1')
    expect(stdout).toContain('Ada')
    expect(stdout).toContain(LONG.trim())
  })

  it('report → reads the text from a file with --body-file', async () => {
    vi.mocked(readFile).mockResolvedValue(LONG)
    apiMock.post.mockResolvedValue(envelope({id: 'r1', version: 2, body: LONG}))
    await runCaptured(TicketsReport, [T, '--project', PID, '--body-file', './report.md'])
    expect(vi.mocked(readFile)).toHaveBeenCalledWith('./report.md', 'utf8')
    expect(apiMock.post).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/tickets/${T}/report`, {body: LONG})
  })

  it('report → keeps the report newlines instead of flattening it on one line', async () => {
    apiMock.post.mockResolvedValue(envelope({id: 'r1', version: 1, body: 'Fatto:\n- primo\n- secondo'}))
    const {stdout} = await runCaptured(TicketsReport, [T, '--project', PID, '--body', 'Fatto:\n- primo\n- secondo'])
    expect(stdout).toContain('Fatto:\n- primo\n- secondo')
  })

  it('report → exits 2 without --body or --body-file', async () => {
    const {message} = await runExpectingExit(TicketsReport, [T, '--project', PID], 2)
    expect(message).toContain('Provide the report body')
    expect(apiMock.post).not.toHaveBeenCalled()
  })

  it('report → exits 2 if the file is not readable', async () => {
    vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'))
    const {message} = await runExpectingExit(TicketsReport, [T, '--project', PID, '--body-file', './missing.md'], 2)
    expect(message).toContain('File not found or unreadable')
    expect(apiMock.post).not.toHaveBeenCalled()
  })

  // A version is immutable: if the text passed by hand and the file one diverge, writing one of the
  // two at random leaves the report wrong forever. Better to stop before writing.
  it('report → exits 2 if it receives --body and --body-file together', async () => {
    const {message} = await runExpectingExit(
      TicketsReport,
      [T, '--project', PID, '--body', 'a', '--body-file', './report.md'],
      2,
    )
    expect(message).toContain('not both')
    expect(vi.mocked(readFile)).not.toHaveBeenCalled()
    expect(apiMock.post).not.toHaveBeenCalled()
  })

  // ── CYRA-628 ──────────────────────────────────────────────────────────────────────────────────
  //
  // The system knows the state of the clarification cycle, and it is the only one that really knows it. Before, it lived
  // in the discussion text: it was enough for the system itself to write any line there
  // for a reader to mistake it for an answer and restart a ticket nobody had
  // answered.
  it('clarifications → asks the system for the state, not the discussion', async () => {
    apiMock.get.mockResolvedValue(envelope({
      state: 'waiting', cycles: 2, has_reply: false,
      rounds: [{cycle: 1, questions: 'Quale ambiente?', response: 'production', answered_at: '2026-08-20T10:00:00Z'},
               {cycle: 2, questions: 'Con quale credenziale?', response: null, answered_at: null}],
    }))

    const {stdout} = await runCaptured(TicketsClarifications, [T, '--project', PID])

    expect(apiMock.get).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/tickets/${T}/clarifications`)
    expect(stdout).toContain('waiting')
    expect(stdout).toContain('giri: 2')
    expect(stdout).toContain('Quale ambiente?')
    expect(stdout).toContain('senza risposta')
  })

  // A ticket without pending questions says so with a sentence, not with a blank: a reader interprets
  // blank space as «I could not look», which is something else.
  it('clarifications → no pending question says so in words', async () => {
    apiMock.get.mockResolvedValue(envelope({state: 'ready', cycles: 0, has_reply: false, rounds: []}))

    const {stdout} = await runCaptured(TicketsClarifications, [T, '--project', PID])

    expect(stdout).toContain('Nessuna domanda in corso')
  })

  it('report-show → reads the current report', async () => {
    apiMock.get.mockResolvedValue(envelope({id: 'r1', version: 3, body: LONG, author: 'Ada', source: 'manual'}))
    const {stdout} = await runCaptured(TicketsReportShow, [T, '--project', PID])
    expect(apiMock.get).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/tickets/${T}/report`)
    expect(stdout).toContain('version 3')
    expect(stdout).toContain(LONG.trim())
  })

  it('report-show → with --version reads that version from the history', async () => {
    apiMock.get.mockResolvedValue(envelope({id: 'r1', version: 2, body: 'prima stesura'}))
    const {stdout} = await runCaptured(TicketsReportShow, [T, '--project', PID, '--version', '2'])
    expect(apiMock.get).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/tickets/${T}/report/versions/2`)
    expect(stdout).toContain('prima stesura')
  })

  it('report-show → propagates the 404 of the ticket without a report', async () => {
    apiMock.get.mockRejectedValue(apiError(404, 'R404-REPORT-001', 'This ticket has no work report yet.'))
    const {stderr} = await runExpectingExit(TicketsReportShow, [T, '--project', PID])
    expect(stderr).toContain('R404-REPORT-001: This ticket has no work report yet.')
  })

  it('report-versions → lists the history with the length of each draft', async () => {
    apiMock.get.mockResolvedValue(
      envelope(
        [
          {version: 2, author: 'Ada', source: 'agent', body: 'ab', created_at: '2026-08-15'},
          {version: 1, author: 'Bea', source: 'manual', body: 'a', created_at: '2026-08-14'},
        ],
        {page: 1, total_pages: 1},
      ),
    )
    const {stdout} = await runCaptured(TicketsReportVersions, [T, '--project', PID])
    expect(apiMock.get).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/tickets/${T}/report/versions?page=1`)
    expect(stdout).toContain('VERSION')
    expect(stdout).toContain('Ada')
    expect(stdout).toContain('2026-08-14')
  })

  // The server counts characters like Ruby (code points): JS `.length` counts UTF-16 units and on
  // an emoji counts two, so the column would show a length the server does not recognise.
  it('report-versions → counts characters like the server, emoji included', async () => {
    apiMock.get.mockResolvedValue(envelope([{version: 1, author: 'Ada', source: 'agent', body: '🔴 ok'}]))
    const {stdout} = await runCaptured(TicketsReportVersions, [T, '--project', PID])
    expect('🔴 ok'.length).toBe(5) // UTF-16: the emoji weighs two
    expect(stdout).toMatch(/agent\s+4$/m)
  })

  it('report-versions → requests the page given with --page', async () => {
    apiMock.get.mockResolvedValue(envelope([], {page: 2, total_pages: 2}))
    await runCaptured(TicketsReportVersions, [T, '--project', PID, '--page', '2'])
    expect(apiMock.get).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/tickets/${T}/report/versions?page=2`)
  })

  it('report → the ticket code and the project end up encoded in the path', async () => {
    apiMock.get.mockResolvedValue(envelope([{id: PID, key: 'CYCL'}], {total_pages: 1}))
    apiMock.post.mockResolvedValue(envelope({id: 'r1', version: 1, body: 'ok'}))
    await runCaptured(TicketsReport, ['CYCL-31', '--project', 'CYCL', '--body', 'ok'])
    expect(apiMock.post).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/tickets/CYCL-31/report`, {body: 'ok'})
  })
})

describe('tickets attachments', () => {
  it('lists attachments (per=100)', async () => {
    apiMock.get.mockResolvedValue(envelope([{id: 'a1', filename: 'x.png', content_type: 'image/png', byte_size: 10}]))
    const {stdout} = await runCaptured(TicketsAttachments, [T, '--project', PID])
    expect(apiMock.get).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/tickets/${T}/attachments?per=100`)
    expect(stdout).toContain('x.png')
  })

  it('attach → reads the file and uploads a multipart body', async () => {
    vi.mocked(readFile).mockResolvedValue(Buffer.from('hello'))
    apiMock.upload.mockResolvedValue(envelope([{id: 'a1', filename: 'log.txt'}]))
    const {stdout} = await runCaptured(TicketsAttach, [T, '--project', PID, '--file', './log.txt'])
    expect(vi.mocked(readFile)).toHaveBeenCalledWith('./log.txt')
    const [method, path, files] = apiMock.upload.mock.calls[0] as [string, string, Array<{filename: string}>]
    expect(method).toBe('POST')
    expect(path).toBe(`/cli/v1/projects/${PID}/tickets/${T}/attachments`)
    expect(files[0].filename).toBe('log.txt')
    expect(stdout).toContain('Attached 1 file')
  })

  it('attach → exits 2 when a file is unreadable', async () => {
    vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'))
    const {message} = await runExpectingExit(TicketsAttach, [T, '--project', PID, '--file', './missing.png'], 2)
    expect(message).toContain('File not found or unreadable')
    expect(apiMock.upload).not.toHaveBeenCalled()
  })

  it('detach → refuses without --confirm', async () => {
    const {message} = await runExpectingExit(TicketsDetach, [T, '--project', PID, '--attachment', 'a1'], 2)
    expect(message).toContain('Refusing to delete')
  })

  it('detach → removes with --confirm', async () => {
    apiMock.delete.mockResolvedValue(envelope({}))
    const {result} = await runCaptured(TicketsDetach, [T, '--project', PID, '--attachment', 'a1', '--confirm'])
    expect(apiMock.delete).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/tickets/${T}/attachments/a1`)
    expect((result as {detached: string}).detached).toBe('a1')
  })

  it('attachment-download → writes the bytes to the chosen filename', async () => {
    apiMock.download.mockResolvedValue({data: new Uint8Array([1, 2, 3, 4]), filename: 'server.png'})
    const {result, stdout} = await runCaptured(TicketsAttachmentDownload, [
      T, 'a1', '--project', PID, '--out', '/tmp/cyi', '--filename', 'custom.png',
    ])
    expect(apiMock.download).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/tickets/${T}/attachments/a1/download`)
    expect(vi.mocked(writeFile)).toHaveBeenCalledWith('/tmp/cyi/custom.png', expect.any(Uint8Array))
    expect((result as {bytes: number}).bytes).toBe(4)
    expect(stdout).toContain('Saved 4 bytes')
  })
})

describe('tickets vote / unvote', () => {
  it('vote → PUT and reports the count', async () => {
    apiMock.put.mockResolvedValue(envelope({votes_count: 5}))
    const {stdout} = await runCaptured(TicketsVote, [T, '--project', PID])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/tickets/${T}/vote`)
    expect(stdout).toContain('(5 votes)')
  })

  it('unvote → DELETE', async () => {
    apiMock.delete.mockResolvedValue(envelope({votes_count: 4}))
    const {stdout} = await runCaptured(TicketsUnvote, [T, '--project', PID])
    expect(apiMock.delete).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/tickets/${T}/vote`)
    expect(stdout).toContain('(4 votes)')
  })
})

describe('tickets milestone', () => {
  it('sets via PUT with milestone_id', async () => {
    apiMock.put.mockResolvedValue(envelope({code: 'DRRA-1'}))
    const {stdout} = await runCaptured(TicketsMilestone, [T, '--project', PID, '--milestone-id', 'm1'])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/tickets/${T}/milestone`, {milestone_id: 'm1'})
    expect(stdout).toContain('milestone set')
  })

  it('clears via DELETE', async () => {
    apiMock.delete.mockResolvedValue(envelope({code: 'DRRA-1'}))
    const {stdout} = await runCaptured(TicketsMilestone, [T, '--project', PID, '--clear'])
    expect(apiMock.delete).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/tickets/${T}/milestone`)
    expect(stdout).toContain('milestone cleared')
  })

  it('requires --milestone-id or --clear (exit 2)', async () => {
    const {message} = await runExpectingExit(TicketsMilestone, [T, '--project', PID], 2)
    expect(message).toContain('--milestone-id')
  })
})

describe('tickets delete', () => {
  it('refuses without --confirm', async () => {
    const {message} = await runExpectingExit(TicketsDelete, [T, '--project', PID], 2)
    expect(message).toContain('Refusing to delete')
  })

  it('deletes with --confirm', async () => {
    apiMock.delete.mockResolvedValue(envelope({}))
    const {result} = await runCaptured(TicketsDelete, [T, '--project', PID, '--confirm'])
    expect(apiMock.delete).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/tickets/${T}`)
    expect((result as {deleted: string}).deleted).toBe(T)
  })
})

describe('tickets links / unlink', () => {
  it('links → GET and renders id/kind/other_ticket_code', async () => {
    apiMock.get.mockResolvedValue(envelope([{id: 'lk-1', kind: 'duplicate', other_ticket_code: 'DRRA-9'}]))
    const {stdout} = await runCaptured(TicketsLinks, [T, '--project', PID])
    expect(apiMock.get).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/tickets/${T}/links`)
    expect(stdout).toContain('lk-1')
    expect(stdout).toContain('duplicate')
    expect(stdout).toContain('DRRA-9')
  })

  it('unlink → rejects without --confirm (exit 2)', async () => {
    const {message} = await runExpectingExit(TicketsUnlink, [T, 'lk-1', '--project', PID], 2)
    expect(message).toContain('Refusing to remove')
    expect(apiMock.delete).not.toHaveBeenCalled()
  })

  it('unlink → DELETE with --confirm', async () => {
    apiMock.delete.mockResolvedValue(envelope({}))
    const {result} = await runCaptured(TicketsUnlink, [T, 'lk-1', '--project', PID, '--confirm'])
    expect(apiMock.delete).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/tickets/${T}/links/lk-1`)
    expect((result as {removed: string}).removed).toBe('lk-1')
  })

  it('unlink → skips the human line with --json', async () => {
    apiMock.delete.mockResolvedValue(envelope({}))
    const {result} = await runCaptured(TicketsUnlink, [T, 'lk-1', '--project', PID, '--confirm', '--json'])
    expect((result as {removed: string}).removed).toBe('lk-1')
  })
})

describe('tickets reviewer / unreviewer', () => {
  it('reviewer → PUT with reviewer_id', async () => {
    apiMock.put.mockResolvedValue(envelope({code: 'DRRA-1', reviewer: 'Ada'}))
    const {stdout} = await runCaptured(TicketsReviewer, [T, '--project', PID, '--reviewer-id', 'acc-1'])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/tickets/${T}/reviewer`, {reviewer_id: 'acc-1'})
    expect(stdout).toContain('reviewer set')
  })

  it('reviewer without --reviewer-id → parse error (required flag, exit 2)', async () => {
    await runExpectingExit(TicketsReviewer, [T, '--project', PID], 2)
    expect(apiMock.put).not.toHaveBeenCalled()
  })

  it('unreviewer → DELETE', async () => {
    apiMock.delete.mockResolvedValue(envelope({code: 'DRRA-1'}))
    const {stdout} = await runCaptured(TicketsUnreviewer, [T, '--project', PID])
    expect(apiMock.delete).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/tickets/${T}/reviewer`)
    expect(stdout).toContain('reviewer removed')
  })
})

describe('tickets eligibility (agent gate)', () => {
  it('--allow → PUT allowed', async () => {
    apiMock.put.mockResolvedValue(envelope({code: 'DRRA-1', agent_eligibility: 'allowed'}))
    const {stdout} = await runCaptured(TicketsEligibility, [T, '--project', PID, '--allow'])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/tickets/${T}/eligibility`, {
      eligibility: 'allowed',
    })
    expect(stdout).toContain('allowed')
  })

  it('--block with --reason forwards the rationale', async () => {
    apiMock.put.mockResolvedValue(envelope({code: 'DRRA-1', agent_eligibility: 'blocked'}))
    await run(TicketsEligibility, [T, '--project', PID, '--block', '--reason', 'tocca la produzione'])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/tickets/${T}/eligibility`, {
      eligibility: 'blocked',
      reason: 'tocca la produzione',
    })
  })

  it('--auto defers to the automatic evaluation and ignores the rationale', async () => {
    apiMock.put.mockResolvedValue(envelope({code: 'DRRA-1', agent_eligibility: 'pending'}))
    await run(TicketsEligibility, [T, '--project', PID, '--auto'])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/tickets/${T}/eligibility`, {
      eligibility: 'auto',
    })
  })

  // No default: opening the gate because of a typo would be the worst failure.
  it('without any decision does not call the backend', async () => {
    await runExpectingExit(TicketsEligibility, [T, '--project', PID], 2)
    expect(apiMock.put).not.toHaveBeenCalled()
  })

  it('two decisions together are rejected by parsing', async () => {
    await runExpectingExit(TicketsEligibility, [T, '--project', PID, '--allow', '--block'], 2)
    expect(apiMock.put).not.toHaveBeenCalled()
  })
})

describe('tickets watch / unwatch', () => {
  it('watch → PUT (idempotent)', async () => {
    apiMock.put.mockResolvedValue(envelope({ticket_id: T, watching: true, watchers_count: 3}))
    const {stdout} = await runCaptured(TicketsWatch, [T, '--project', PID])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/tickets/${T}/watch`)
    expect(stdout).toContain('Watching ticket')
  })

  it('unwatch → DELETE (idempotent)', async () => {
    apiMock.delete.mockResolvedValue(envelope({ticket_id: T, watching: false, watchers_count: 2}))
    const {stdout} = await runCaptured(TicketsUnwatch, [T, '--project', PID])
    expect(apiMock.delete).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/tickets/${T}/watch`)
    expect(stdout).toContain('Stopped watching')
  })
})

describe('tickets branch / pr', () => {
  it('branch → POST github/branch (ticket ref passthrough)', async () => {
    apiMock.post.mockResolvedValue(envelope({kind: 'branch', name: 'DRFL-3-fix', html_url: 'https://github.com/x/tree/DRFL-3-fix'}))
    const {stdout} = await runCaptured(TicketsBranch, ['DRFL-3', '--project', PID])
    expect(apiMock.post).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/tickets/DRFL-3/github/branch`)
    expect(stdout).toContain('Branch created')
    expect(stdout).toContain('DRFL-3-fix')
  })

  it('branch --json returns the envelope', async () => {
    apiMock.post.mockResolvedValue(envelope({kind: 'branch', name: 'DRFL-3-fix'}))
    const res = (await run(TicketsBranch, ['DRFL-3', '--project', PID, '--json'])) as {data: {kind: string}}
    expect(res.data.kind).toBe('branch')
  })

  it('pr → POST github/pull_request', async () => {
    apiMock.post.mockResolvedValue(envelope({kind: 'pull_request', number: 7, state: 'open'}))
    const {stdout} = await runCaptured(TicketsPr, ['DRFL-3', '--project', PID])
    expect(apiMock.post).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/tickets/DRFL-3/github/pull_request`)
    expect(stdout).toContain('Pull request opened')
  })

  it('pr tolerates an envelope without data', async () => {
    apiMock.post.mockResolvedValue({})
    await expect(runCaptured(TicketsPr, ['DRFL-3', '--project', PID])).resolves.toBeTruthy()
  })
})

// Lease success payload (shape shared by claim and renew — see the CYCL-14 contract).
const LEASE = {
  ticket: 'DRRA-1',
  run_id: 'run-42',
  expires_at: '2026-08-06T18:00:00Z',
  host_id: 'host-1',
  account_id: 'acc-1',
  agent: 'claude',
  execution_phase: 'implementation',
  profile_digest: 'digest-abc',
  held_by: {kind: 'account', id: 'acc-1', name: 'Mario Rossi'},
}

/** The 409 R409-LEASE-001 as the backend sends it: holder details for the CLI enrichment. */
function leaseConflict(): ReturnType<typeof apiError> {
  return apiError(409, 'R409-LEASE-001', 'Ticket is already leased', {
    holder: {held_by: {kind: 'host', id: 'host-9', name: 'mac-mini-2'}, expires_at: '2026-08-06T20:00:00Z'},
  })
}

describe('tickets lease claim', () => {
  it('claim → POST with ttl_seconds and run_id, shows expiry and holder', async () => {
    apiMock.post.mockResolvedValue(envelope(LEASE))
    const {stdout} = await runCaptured(TicketsLeaseClaim, [T, '--project', PID, '--ttl', '3600', '--run-id', 'run-42'])
    expect(apiMock.post).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/tickets/${T}/lease`, {
      ttl_seconds: 3600,
      run_id: 'run-42',
    })
    expect(stdout).toContain('leased until 2026-08-06T18:00:00Z')
    expect(stdout).toContain('held_by: account Mario Rossi')
  })

  it('claim → without --ttl/--run-id sends an empty body (server-side default)', async () => {
    apiMock.post.mockResolvedValue(envelope(LEASE))
    await runCaptured(TicketsLeaseClaim, [T, '--project', PID])
    expect(apiMock.post).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/tickets/${T}/lease`, {})
  })

  it('claim → 409 says who holds the ticket and until when, and exits non-zero', async () => {
    apiMock.post.mockRejectedValue(leaseConflict())
    const {stderr} = await runExpectingExit(TicketsLeaseClaim, [T, '--project', PID])
    expect(stderr).toContain('R409-LEASE-001')
    expect(stderr).toContain('host "mac-mini-2"')
    expect(stderr).toContain('until 2026-08-06T20:00:00Z')
  })

  it('claim → 409 with --json includes the backend details (holder) in the error envelope', async () => {
    // Regression: BaseCommand.catch (shared by all commands) prints only {code,message} and
    // drops the details — here the command prints them itself and must NOT have catch() reprint them
    // a second time (two concatenated JSONs would break parsing for a script).
    apiMock.post.mockRejectedValue(leaseConflict())
    const originalExitCode = process.exitCode
    const cap = capture()
    try {
      const result = await run(TicketsLeaseClaim, [T, '--project', PID, '--json'])
      expect(result).toBeUndefined()
      expect(process.exitCode).toBe(1)
      expect(JSON.parse(cap.stdout())).toEqual({
        error: {
          code: 'R409-LEASE-001',
          message: 'Ticket is already leased',
          details: {
            holder: {held_by: {kind: 'host', id: 'host-9', name: 'mac-mini-2'}, expires_at: '2026-08-06T20:00:00Z'},
          },
        },
      })
    } finally {
      cap.restore()
      process.exitCode = originalExitCode
    }
  })

  it('claim → 409 with --json drops the extra backend fields outside the allow-list (e.g. holder.ticket)', async () => {
    // Same shape observed from the real backend: holder also carries `ticket` next to held_by/expires_at.
    // Only held_by.{kind,id,name} and expires_at must reach the --json envelope (CYCL-14).
    apiMock.post.mockRejectedValue(
      apiError(409, 'R409-LEASE-001', "Ticket già detenuto da un'altra lavorazione", {
        holder: {
          ticket: 'CYRA-1',
          held_by: {kind: 'account', id: 'acc-1', name: 'Alessio Bussolari', email: 'a@example.com'},
          expires_at: '2026-08-06T18:00:00Z',
        },
      }),
    )
    const originalExitCode = process.exitCode
    const cap = capture()
    try {
      await run(TicketsLeaseClaim, [T, '--project', PID, '--json'])
      expect(JSON.parse(cap.stdout())).toEqual({
        error: {
          code: 'R409-LEASE-001',
          message: "Ticket già detenuto da un'altra lavorazione",
          details: {
            holder: {held_by: {kind: 'account', id: 'acc-1', name: 'Alessio Bussolari'}, expires_at: '2026-08-06T18:00:00Z'},
          },
        },
      })
    } finally {
      cap.restore()
      process.exitCode = originalExitCode
    }
  })

  it('claim → an error that is not an ApiRequestError in --json propagates unchanged to BaseCommand.catch', async () => {
    apiMock.post.mockRejectedValue(new Error('rete a terra'))
    const cap = capture()
    try {
      const error = await run(TicketsLeaseClaim, [T, '--project', PID, '--json']).then(
        () => {
          throw new Error('atteso exit non-zero, ma il comando ha risolto')
        },
        (err: unknown) => err,
      )
      expect((error as {oclif?: {exit?: number}}).oclif?.exit).not.toBe(0)
      expect(JSON.parse(cap.stdout())).toEqual({error: {code: 'C500-SYS-001', message: 'Command failed'}})
    } finally {
      cap.restore()
    }
  })

  it('claim → tolerates an envelope without data (fallback {})', async () => {
    apiMock.post.mockResolvedValue({})
    await expect(runCaptured(TicketsLeaseClaim, [T, '--project', PID])).resolves.toBeTruthy()
  })

  it('claim → held_by missing from the payload prints a dash instead of crashing', async () => {
    const {held_by: _heldBy, ...leaseWithoutHolder} = LEASE
    apiMock.post.mockResolvedValue(envelope(leaseWithoutHolder))
    const {stdout} = await runCaptured(TicketsLeaseClaim, [T, '--project', PID])
    expect(stdout).toContain('held_by: -')
  })

  it('claim → held_by without a name uses the id as holder', async () => {
    apiMock.post.mockResolvedValue(envelope({...LEASE, held_by: {kind: 'host', id: 'host-3'}}))
    const {stdout} = await runCaptured(TicketsLeaseClaim, [T, '--project', PID])
    expect(stdout).toContain('held_by: host host-3')
  })
})

describe('tickets lease renew', () => {
  it('renew → PUT with ttl_seconds and run_id, shows the new expiry', async () => {
    apiMock.put.mockResolvedValue(envelope({...LEASE, expires_at: '2026-08-06T22:00:00Z'}))
    const {stdout} = await runCaptured(TicketsLeaseRenew, [T, '--project', PID, '--ttl', '7200'])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/tickets/${T}/lease`, {ttl_seconds: 7200})
    expect(stdout).toContain('lease renewed until 2026-08-06T22:00:00Z')
  })

  it('renew → --run-id alone (without --ttl) ends up in the body', async () => {
    apiMock.put.mockResolvedValue(envelope(LEASE))
    await runCaptured(TicketsLeaseRenew, [T, '--project', PID, '--run-id', 'run-77'])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/tickets/${T}/lease`, {run_id: 'run-77'})
  })

  it('renew → 409 says who holds the ticket, and exits non-zero', async () => {
    apiMock.put.mockRejectedValue(leaseConflict())
    const {stderr} = await runExpectingExit(TicketsLeaseRenew, [T, '--project', PID])
    expect(stderr).toContain('host "mac-mini-2"')
    expect(stderr).toContain('until 2026-08-06T20:00:00Z')
  })

  it('renew → 409 with --json includes the backend details (holder) in the error envelope', async () => {
    apiMock.put.mockRejectedValue(leaseConflict())
    const originalExitCode = process.exitCode
    const cap = capture()
    try {
      const result = await run(TicketsLeaseRenew, [T, '--project', PID, '--json'])
      expect(result).toBeUndefined()
      expect(process.exitCode).toBe(1)
      expect(JSON.parse(cap.stdout())).toEqual({
        error: {
          code: 'R409-LEASE-001',
          message: 'Ticket is already leased',
          details: {
            holder: {held_by: {kind: 'host', id: 'host-9', name: 'mac-mini-2'}, expires_at: '2026-08-06T20:00:00Z'},
          },
        },
      })
    } finally {
      cap.restore()
      process.exitCode = originalExitCode
    }
  })

  it('renew → 404 (no lease to extend) propagated unchanged by BaseCommand.catch', async () => {
    apiMock.put.mockRejectedValue(apiError(404, 'R404-LEASE-002', 'No lease to renew'))
    const {stderr} = await runExpectingExit(TicketsLeaseRenew, [T, '--project', PID])
    expect(stderr).toContain('R404-LEASE-002: No lease to renew')
  })

  it('renew → 404 with --json: same envelope as before, without details (the command prints it itself)', async () => {
    apiMock.put.mockRejectedValue(apiError(404, 'R404-LEASE-002', 'No lease to renew'))
    const originalExitCode = process.exitCode
    const cap = capture()
    try {
      const result = await run(TicketsLeaseRenew, [T, '--project', PID, '--json'])
      expect(result).toBeUndefined()
      expect(process.exitCode).toBe(1)
      expect(JSON.parse(cap.stdout())).toEqual({error: {code: 'R404-LEASE-002', message: 'No lease to renew'}})
    } finally {
      cap.restore()
      process.exitCode = originalExitCode
    }
  })

  it('renew → an error that is not an ApiRequestError in --json propagates unchanged to BaseCommand.catch', async () => {
    apiMock.put.mockRejectedValue(new Error('rete a terra'))
    const cap = capture()
    try {
      const error = await run(TicketsLeaseRenew, [T, '--project', PID, '--json']).then(
        () => {
          throw new Error('atteso exit non-zero, ma il comando ha risolto')
        },
        (err: unknown) => err,
      )
      expect((error as {oclif?: {exit?: number}}).oclif?.exit).not.toBe(0)
      expect(JSON.parse(cap.stdout())).toEqual({error: {code: 'C500-SYS-001', message: 'Command failed'}})
    } finally {
      cap.restore()
    }
  })

  it('renew → --json skips the human line and returns the envelope', async () => {
    apiMock.put.mockResolvedValue(envelope(LEASE))
    const res = (await run(TicketsLeaseRenew, [T, '--project', PID, '--json'])) as {data: {run_id: string}}
    expect(res.data.run_id).toBe('run-42')
  })

  it('renew → tolerates an envelope without data (fallback {})', async () => {
    apiMock.put.mockResolvedValue({})
    await expect(runCaptured(TicketsLeaseRenew, [T, '--project', PID])).resolves.toBeTruthy()
  })

  it('renew → held_by missing from the payload prints a dash instead of crashing', async () => {
    const {held_by: _heldBy, ...leaseWithoutHolder} = LEASE
    apiMock.put.mockResolvedValue(envelope(leaseWithoutHolder))
    const {stdout} = await runCaptured(TicketsLeaseRenew, [T, '--project', PID])
    expect(stdout).toContain('held_by: -')
  })

  it('renew → held_by without a name uses the id as holder', async () => {
    apiMock.put.mockResolvedValue(envelope({...LEASE, held_by: {kind: 'host', id: 'host-3'}}))
    const {stdout} = await runCaptured(TicketsLeaseRenew, [T, '--project', PID])
    expect(stdout).toContain('held_by: host host-3')
  })
})

describe('tickets lease release', () => {
  it('release → DELETE with run_id in the body, confirms the release', async () => {
    apiMock.delete.mockResolvedValue(envelope({released: true}))
    const {stdout} = await runCaptured(TicketsLeaseRelease, [T, '--project', PID, '--run-id', 'run-42'])
    expect(apiMock.delete).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/tickets/${T}/lease`, {
      body: {run_id: 'run-42'},
    })
    expect(stdout).toContain('lease released')
  })

  it('release → without --run-id sends an empty body', async () => {
    apiMock.delete.mockResolvedValue(envelope({released: true}))
    await runCaptured(TicketsLeaseRelease, [T, '--project', PID])
    expect(apiMock.delete).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/tickets/${T}/lease`, {body: {}})
  })

  it('release → 409 says who holds the ticket, and exits non-zero', async () => {
    apiMock.delete.mockRejectedValue(leaseConflict())
    const {stderr} = await runExpectingExit(TicketsLeaseRelease, [T, '--project', PID])
    expect(stderr).toContain('host "mac-mini-2"')
    expect(stderr).toContain('until 2026-08-06T20:00:00Z')
  })

  it('release → 409 with --json includes the backend details (holder) in the error envelope', async () => {
    apiMock.delete.mockRejectedValue(leaseConflict())
    const originalExitCode = process.exitCode
    const cap = capture()
    try {
      const result = await run(TicketsLeaseRelease, [T, '--project', PID, '--json'])
      expect(result).toBeUndefined()
      expect(process.exitCode).toBe(1)
      expect(JSON.parse(cap.stdout())).toEqual({
        error: {
          code: 'R409-LEASE-001',
          message: 'Ticket is already leased',
          details: {
            holder: {held_by: {kind: 'host', id: 'host-9', name: 'mac-mini-2'}, expires_at: '2026-08-06T20:00:00Z'},
          },
        },
      })
    } finally {
      cap.restore()
      process.exitCode = originalExitCode
    }
  })

  it('release → 404 (no lease to release) propagated unchanged', async () => {
    apiMock.delete.mockRejectedValue(apiError(404, 'R404-LEASE-002', 'No lease to release'))
    const {stderr} = await runExpectingExit(TicketsLeaseRelease, [T, '--project', PID])
    expect(stderr).toContain('R404-LEASE-002: No lease to release')
  })

  it('release → an error that is not an ApiRequestError in --json propagates unchanged to BaseCommand.catch', async () => {
    apiMock.delete.mockRejectedValue(new Error('rete a terra'))
    const cap = capture()
    try {
      const error = await run(TicketsLeaseRelease, [T, '--project', PID, '--json']).then(
        () => {
          throw new Error('atteso exit non-zero, ma il comando ha risolto')
        },
        (err: unknown) => err,
      )
      expect((error as {oclif?: {exit?: number}}).oclif?.exit).not.toBe(0)
      expect(JSON.parse(cap.stdout())).toEqual({error: {code: 'C500-SYS-001', message: 'Command failed'}})
    } finally {
      cap.restore()
    }
  })

  it('release → tolerates an envelope without data (fallback {})', async () => {
    apiMock.delete.mockResolvedValue({})
    await expect(runCaptured(TicketsLeaseRelease, [T, '--project', PID])).resolves.toBeTruthy()
  })

  it('release → --json skips the human line and returns the envelope', async () => {
    apiMock.delete.mockResolvedValue(envelope({released: true}))
    const res = (await run(TicketsLeaseRelease, [T, '--project', PID, '--json'])) as {data: {released: boolean}}
    expect(res.data.released).toBe(true)
  })
})

describe('tickets work-context — the snapshot delivered at claim time (CYCL-47)', () => {
  const SNAPSHOT = {
    id: 'wcs-1',
    payload_version: 1,
    digest: 'a1b2c3',
    generated_at: '2026-08-06T18:00:00Z',
    actor_name: 'Host mac-mini-2',
    payload: {
      references: [
        {
          key: 'global/git.md',
          kind: 'document',
          location: 'knowledge-base/global/git.md',
          instructions: 'Branch per ticket, mai push diretti su main',
          required: true,
          position: 1,
          level: 'organization',
        },
      ],
      procedures: [
        {
          key: 'procedures/reset.md',
          content: 'Prima il backup, poi il reset',
          application_mode: 'inherit',
          merge_strategy: 'append',
          position: 1,
          level: 'project',
        },
      ],
    },
  }

  it('reads the ticket snapshot and no other source (the current guidance is irrelevant)', async () => {
    apiMock.get.mockResolvedValue(envelope(SNAPSHOT))
    await runCaptured(TicketsWorkContext, [T, '--project', PID])
    expect(apiMock.get).toHaveBeenCalledTimes(1)
    expect(apiMock.get).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/tickets/${T}/work_context`)
  })

  it('accepts the human ticket code', async () => {
    apiMock.get.mockResolvedValue(envelope(SNAPSHOT))
    await runCaptured(TicketsWorkContext, ['DRFL-3', '--project', PID])
    expect(apiMock.get).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/tickets/DRFL-3/work_context`)
  })

  it('shows the snapshot metadata and its references/procedures', async () => {
    apiMock.get.mockResolvedValue(envelope(SNAPSHOT))
    const {stdout} = await runCaptured(TicketsWorkContext, [T, '--project', PID])
    expect(stdout).toContain('captured_at: 2026-08-06T18:00:00Z')
    expect(stdout).toContain('captured_by: Host mac-mini-2')
    expect(stdout).toContain('digest: a1b2c3')
    expect(stdout).toContain('payload_version: 1')
    expect(stdout).toContain('References')
    expect(stdout).toContain('global/git.md')
    expect(stdout).toContain('Procedures')
    expect(stdout).toContain('procedures/reset.md')
  })

  it('says plainly that it is frozen and not the current project guidance', async () => {
    apiMock.get.mockResolvedValue(envelope(SNAPSHOT))
    const {stdout} = await runCaptured(TicketsWorkContext, [T, '--project', PID])
    expect(stdout).toMatch(/frozen/i)
    expect(stdout).toContain('guidance show')
  })

  it('does not pass off the frozen text as the current one: without --full it stays out', async () => {
    apiMock.get.mockResolvedValue(envelope(SNAPSHOT))
    const {stdout} = await runCaptured(TicketsWorkContext, [T, '--project', PID])
    expect(stdout).not.toContain('Prima il backup, poi il reset')
    expect(stdout).toContain('--full')
  })

  it('--full prints in full the instructions and the text of the frozen procedures', async () => {
    apiMock.get.mockResolvedValue(envelope(SNAPSHOT))
    const {stdout} = await runCaptured(TicketsWorkContext, [T, '--project', PID, '--full'])
    expect(stdout).toContain('Branch per ticket, mai push diretti su main')
    expect(stdout).toContain('knowledge-base/global/git.md')
    expect(stdout).toContain('Prima il backup, poi il reset')
  })

  it('--full on an entry without text does not print an empty section', async () => {
    apiMock.get.mockResolvedValue(
      envelope({...SNAPSHOT, payload: {references: [{key: 'solo-chiave'}], procedures: [{key: 'p-vuota'}]}}),
    )
    const {stdout} = await runCaptured(TicketsWorkContext, [T, '--project', PID, '--full'])
    expect(stdout).toContain('solo-chiave')
    expect(stdout).toContain('p-vuota')
    expect(stdout).not.toMatch(/\n\n\n/)
  })

  it('a snapshot without references or procedures says so instead of faking a table', async () => {
    apiMock.get.mockResolvedValue(envelope({...SNAPSHOT, payload: {references: [], procedures: []}}))
    const {stdout} = await runCaptured(TicketsWorkContext, [T, '--project', PID])
    expect(stdout).not.toContain('References')
    expect(stdout).not.toContain('Procedures')
    expect(stdout).toMatch(/no references and no procedures/i)
  })

  it('tolerates an envelope without data (fallback {})', async () => {
    apiMock.get.mockResolvedValue({})
    await expect(runCaptured(TicketsWorkContext, [T, '--project', PID])).resolves.toBeTruthy()
  })

  it('missing actor: the row stays, with a dash', async () => {
    apiMock.get.mockResolvedValue(envelope({...SNAPSHOT, actor_name: null}))
    const {stdout} = await runCaptured(TicketsWorkContext, [T, '--project', PID])
    expect(stdout).toContain('captured_by: -')
  })

  it('--json returns the backend payload unchanged', async () => {
    apiMock.get.mockResolvedValue(envelope(SNAPSHOT))
    const res = (await run(TicketsWorkContext, [T, '--project', PID, '--json'])) as {
      data: Record<string, unknown>
    }
    expect(res.data).toEqual(SNAPSHOT)
  })

  it('missing snapshot: distinct message, not «ticket not found», and non-zero exit', async () => {
    apiMock.get.mockRejectedValue(
      apiError(404, 'R404-TICKET-004', 'Il ticket non ha ancora uno snapshot del contesto di lavoro'),
    )
    const {stderr} = await runExpectingExit(TicketsWorkContext, ['DRFL-3', '--project', PID])
    expect(stderr).toContain('R404-TICKET-004')
    expect(stderr).toMatch(/no work context was captured/i)
    expect(stderr).toContain('DRFL-3')
  })

  // The snapshot is taken ONLY by the claim from the automatic hosts queue: a ticket taken by hand
  // has none, and reading «never claimed» would lead the audit astray.
  it('missing snapshot: does not declare that nobody ever claimed the ticket', async () => {
    apiMock.get.mockRejectedValue(
      apiError(404, 'R404-TICKET-004', 'Il ticket non ha ancora uno snapshot del contesto di lavoro'),
    )
    const {stderr} = await runExpectingExit(TicketsWorkContext, ['DRFL-3', '--project', PID])
    expect(stderr).not.toMatch(/never been claimed/i)
    expect(stderr).toMatch(/manual claim/i)
  })

  it('missing snapshot: with --json the server code stays intact for scripts', async () => {
    apiMock.get.mockRejectedValue(
      apiError(404, 'R404-TICKET-004', 'Il ticket non ha ancora uno snapshot del contesto di lavoro'),
    )
    const cap = capture()
    try {
      await run(TicketsWorkContext, ['DRFL-3', '--project', PID, '--json']).catch(() => undefined)
      const printed = JSON.parse(cap.stdout()) as {error: {code: string; message: string}}
      expect(printed.error.code).toBe('R404-TICKET-004')
      expect(printed.error.message).toMatch(/no work context was captured/i)
    } finally {
      cap.restore()
    }
  })

  it('without the audit permission: names the permission and does not fall back to the current guidance', async () => {
    apiMock.get.mockRejectedValue(apiError(403, 'R403-CLIAUTH-002', 'Permesso negato'))
    const {stderr} = await runExpectingExit(TicketsWorkContext, [T, '--project', PID])
    expect(stderr).toContain('R403-CLIAUTH-002')
    expect(stderr).toContain('tickets.audit.view')
    expect(apiMock.get).toHaveBeenCalledTimes(1)
  })

  it('a different 404 (nonexistent ticket) passes with the server words', async () => {
    apiMock.get.mockRejectedValue(apiError(404, 'R404-TICKET-001', 'Ticket non trovato'))
    const {stderr} = await runExpectingExit(TicketsWorkContext, [T, '--project', PID])
    expect(stderr).toContain('R404-TICKET-001: Ticket non trovato')
    expect(stderr).not.toMatch(/no work context was captured/i)
  })

  it('an error that is not an ApiRequestError propagates unchanged', async () => {
    apiMock.get.mockRejectedValue(new Error('rete a terra'))
    const cap = capture()
    try {
      const error = await run(TicketsWorkContext, [T, '--project', PID, '--json']).then(
        () => {
          throw new Error('atteso exit non-zero, ma il comando ha risolto')
        },
        (err: unknown) => err,
      )
      expect((error as {oclif?: {exit?: number}}).oclif?.exit).not.toBe(0)
      expect(JSON.parse(cap.stdout())).toEqual({error: {code: 'C500-SYS-001', message: 'Command failed'}})
    } finally {
      cap.restore()
    }
  })
})

describe('length limits declared and checked before saving (CYCL-32)', () => {
  describe("the command help", () => {
    it('states the limit of every tickets create field', () => {
      const flags = TicketsCreate.flags as Record<string, {description?: string}>
      expect(flags.title.description).toContain('255')
      expect(flags.description.description).toContain('4000')
      expect(flags['technical-analysis'].description).toContain('1500')
    })

    it('states the limit of every tickets update field', () => {
      const flags = TicketsUpdate.flags as Record<string, {description?: string}>
      expect(flags.title.description).toContain('255')
      expect(flags.description.description).toContain('4000')
      expect(flags['technical-analysis'].description).toContain('1500')
    })

    it('states the comment limit and the report limit', () => {
      const comment = TicketsComment.flags as Record<string, {description?: string}>
      const report = TicketsReport.flags as Record<string, {description?: string}>
      expect(comment.body.description).toContain('240')
      expect(report.body.description).toContain('20000')
      expect(report['body-file'].description).toContain('20000')
    })
  })

  describe('tickets create', () => {
    it('lists all the too-long fields in a single error, without calling the server', async () => {
      const {message} = await runExpectingExit(
        TicketsCreate,
        [
          '--project', PID, '--title', 'T'.repeat(300),
          '--description', 'd'.repeat(4200), '--technical-analysis', 'a'.repeat(1700),
        ],
        2,
      )
      expect(message).toContain('--title is 300 characters (max 255)')
      expect(message).toContain('--description is 4200 characters (max 4000)')
      expect(message).toContain('--technical-analysis is 1700 characters (max 1500)')
      expect(apiMock.post).not.toHaveBeenCalled()
    })

    it('lets through the fields at the limit', async () => {
      apiMock.post.mockResolvedValue(envelope({code: 'DRRA-9'}))
      await runCaptured(TicketsCreate, [
        '--project', PID, '--title', 'Corto', '--status', STATUS_UUID, '--priority', PRIORITY_UUID,
        '--description', 'd'.repeat(4000), '--technical-analysis', 'a'.repeat(1500),
      ])
      expect(apiMock.post).toHaveBeenCalled()
    })
  })

  describe('tickets report', () => {
    it('stops a report over the cap without sending it', async () => {
      vi.mocked(readFile).mockResolvedValue('r'.repeat(20_001))
      const {message} = await runExpectingExit(
        TicketsReport,
        [T, '--project', PID, '--body-file', './report.md'],
        2,
      )
      expect(message).toContain('--body-file is 20001 characters (max 20000)')
      expect(apiMock.post).not.toHaveBeenCalled()
    })
  })

  describe('tickets update', () => {
    const CURRENT = {
      id: T,
      title: 'Titolo',
      kind: 'bug',
      description: 'Descrizione corta',
      technical_analysis: 'Analisi corta',
      status_ref: {id: 'st-1', label: 'Open'},
      priority: 'High',
    }

    function mockReads(ticket: Record<string, unknown> = CURRENT): void {
      apiMock.put.mockResolvedValue(envelope({code: 'DRRA-1'}))
      apiMock.get.mockImplementation(async (path: string) => {
        if (path.startsWith(`/cli/v1/projects/${PID}/tickets/${T}`)) return envelope(ticket)
        if (path.startsWith('/cli/v1/types/ticket_priorities')) {
          return envelope([{id: 'pr-high', code: 'high', label: 'High'}])
        }
        throw new Error(`GET inattesa: ${path}`)
      })
    }

    it("stops the technical analysis that grows beyond the limit before writing", async () => {
      mockReads()
      const {message} = await runExpectingExit(
        TicketsUpdate,
        [T, '--project', PID, '--technical-analysis', 'a'.repeat(1501)],
        2,
      )
      expect(message).toContain('--technical-analysis is 1501 characters (max 1500)')
      expect(apiMock.put).not.toHaveBeenCalled()
    })

    it('does not block a field already over the limit that is being shortened', async () => {
      mockReads({...CURRENT, technical_analysis: 'a'.repeat(1800)})
      await runCaptured(TicketsUpdate, [T, '--project', PID, '--technical-analysis', 'a'.repeat(1600)])
      expect(apiMock.put).toHaveBeenCalled()
    })

    it("does not block the title change of a ticket whose description is already over the limit", async () => {
      mockReads({...CURRENT, description: 'd'.repeat(4500)})
      await runCaptured(TicketsUpdate, [T, '--project', PID, '--title', 'Nuovo'])
      expect(apiMock.put).toHaveBeenCalled()
    })

    it('with --replace does not know the current state and lets the server decide', async () => {
      apiMock.put.mockResolvedValue(envelope({code: 'DRRA-1'}))
      await runCaptured(TicketsUpdate, [
        T, '--project', PID, '--replace', '--title', 'Nuovo',
        '--description', 'd'.repeat(4200), '--status', STATUS_UUID, '--priority', PRIORITY_UUID,
      ])
      expect(apiMock.get).not.toHaveBeenCalled()
      expect(apiMock.put).toHaveBeenCalled()
    })
  })
})
