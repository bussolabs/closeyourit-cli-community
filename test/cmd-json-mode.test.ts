import {beforeEach, describe, expect, it, vi} from 'vitest'
import {apiMock, resetApiMock} from './helpers/api-mock'
import {PID, apiError, capture, envelope, run} from './helpers/command'

vi.mock('../src/lib/api', async (io) => {
  const actual = await io<typeof import('../src/lib/api')>()
  const {apiMock} = await import('./helpers/api-mock')
  return {...actual, CliApi: vi.fn(function () { return apiMock })}
})
vi.mock('../src/lib/config', async (io) => {
  const actual = await io<typeof import('../src/lib/config')>()
  return {...actual, loadConfig: vi.fn(() => ({apiUrl: 'https://api.test', token: 'tok_test'}))}
})

import AlertsList from '../src/commands/alerts/list'
import AlertsNotificationsList from '../src/commands/alerts/notifications/list'
import AlertsNotificationsReadAll from '../src/commands/alerts/notifications/read-all'
import AlertsPreferencesShow from '../src/commands/alerts/preferences/show'
import EnvironmentsList from '../src/commands/environments/list'
import ErrorsList from '../src/commands/errors/list'
import GroupsList from '../src/commands/groups/list'
import IdeasList from '../src/commands/ideas/list'
import InvitationsList from '../src/commands/invitations/list'
import LogsList from '../src/commands/logs/list'
import MembersList from '../src/commands/members/list'
import MetricsList from '../src/commands/metrics/list'
import MilestonesList from '../src/commands/milestones/list'
import MonitorsList from '../src/commands/monitors/list'
import OrgShow from '../src/commands/org/show'
import PlatformsList from '../src/commands/platforms/list'
import ProjectsList from '../src/commands/projects/list'
import RolesList from '../src/commands/roles/list'
import TeamsList from '../src/commands/teams/list'
import TicketsDelete from '../src/commands/tickets/delete'
import TicketsList from '../src/commands/tickets/list'
import TicketsShow from '../src/commands/tickets/show'
import TokensList from '../src/commands/tokens/list'
import Whoami from '../src/commands/whoami'

/**
 * `--json` mode: `jsonEnabled()` is true, so every command must skip its human-readable
 * branch (renderTable/log) and still return the raw envelope for machine consumption.
 * This exercises the else-branch of `if (!this.jsonEnabled())` across the command surface.
 */
beforeEach(() => resetApiMock())

const orgScoped: Array<[string, {run: typeof ProjectsList.run}]> = [
  ['projects list', ProjectsList],
  ['groups list', GroupsList],
  ['roles list', RolesList],
  ['teams list', TeamsList],
  ['invitations list', InvitationsList],
  ['members list', MembersList],
  ['alerts list', AlertsList],
  ['alerts notifications list', AlertsNotificationsList],
  ['platforms list', PlatformsList],
  ['environments list', EnvironmentsList],
  ['logs list', LogsList],
]

const projectScoped: Array<[string, {run: typeof ProjectsList.run}]> = [
  ['errors list', ErrorsList],
  ['tickets list', TicketsList],
  ['monitors list', MonitorsList],
  ['tokens list', TokensList],
  ['metrics list', MetricsList],
  ['milestones list', MilestonesList],
  ['ideas list', IdeasList],
]

describe('--json mode returns the envelope and suppresses table output', () => {
  it.each(orgScoped)('%s --json', async (_name, command) => {
    apiMock.get.mockResolvedValue(envelope([{id: 'x', name: 'n'}], {total: 1}))
    const result = (await run(command, ['--json'])) as {data: unknown[]}
    expect(result.data).toHaveLength(1)
  })

  it.each(projectScoped)('%s --json', async (_name, command) => {
    apiMock.get.mockResolvedValue(envelope([{id: 'x'}]))
    const result = (await run(command, ['--project', PID, '--json'])) as {data: unknown[]}
    expect(result.data).toHaveLength(1)
  })
})

/**
 * Regression CYCL-1: in --json mode `logToStderr` is a no-op, so `base.catch` used to swallow API
 * errors entirely (empty stdout). Machine consumers must instead get `{ error: { code, message } }`
 * on stdout and a non-zero exit — never a silent success.
 */
describe('--json mode surfaces API errors as an envelope, never swallows them', () => {
  it.each(projectScoped)('%s --json emits {error:{code,message}} on stdout and exits non-zero', async (_name, command) => {
    apiMock.get.mockRejectedValue(apiError(404, 'C404-PRJ-001', 'Project not found: LBRA'))
    const cap = capture()
    try {
      const error = await run(command, ['--project', PID, '--json']).then(
        () => {
          throw new Error('expected a non-zero exit, but the command resolved (error swallowed)')
        },
        (err: unknown) => err,
      )
      expect((error as {oclif?: {exit?: number}}).oclif?.exit).not.toBe(0)
      expect(JSON.parse(cap.stdout())).toEqual({error: {code: 'C404-PRJ-001', message: 'Project not found: LBRA'}})
      expect(cap.stderr()).toBe('')
    } finally {
      cap.restore()
    }
  })

  it('without --json the same error stays on stderr as `code: message` (unchanged)', async () => {
    apiMock.get.mockRejectedValue(apiError(404, 'C404-PRJ-001', 'Project not found: LBRA'))
    const cap = capture()
    try {
      const error = await run(ErrorsList, ['--project', PID]).then(
        () => {
          throw new Error('atteso exit non-zero')
        },
        (err: unknown) => err,
      )
      expect((error as {oclif?: {exit?: number}}).oclif?.exit).not.toBe(0)
      expect(cap.stderr()).toContain('C404-PRJ-001: Project not found: LBRA')
      expect(cap.stdout()).toBe('')
    } finally {
      cap.restore()
    }
  })
})

/**
 * Regression CYCL-33: oclif rejects a bad command line (missing flag/arg, nonexistent flag) before
 * the command body runs, and a `this.error(...)` guard rejects it inside the body. In --json mode
 * both used to collapse into `C500-SYS-001 / "Command failed"`, so a script could not tell a
 * forgotten flag from a server outage. The generic code now stays for real failures only.
 */
describe('--json mode says which input is missing, not "Command failed"', () => {
  const parseFailure = async (command: Parameters<typeof run>[0], argv: string[]): Promise<{code: string; message: string}> => {
    const cap = capture()
    try {
      const error = await run(command, argv).then(
        () => {
          throw new Error('atteso exit non-zero, ma il comando ha risolto')
        },
        (err: unknown) => err,
      )
      expect((error as {oclif?: {exit?: number}}).oclif?.exit).not.toBe(0)
      expect(cap.stderr()).toBe('')
      return (JSON.parse(cap.stdout()) as {error: {code: string; message: string}}).error
    } finally {
      cap.restore()
    }
  }

  it('a forgotten required flag is named', async () => {
    expect(await parseFailure(TicketsShow, ['CYCL-33', '--json'])).toEqual({
      code: 'C400-INP-001',
      message: 'Missing required flag project',
    })
  })

  it('a forgotten required argument is named', async () => {
    const {code, message} = await parseFailure(TicketsShow, ['--project', PID, '--json'])
    expect(code).toBe('C400-INP-001')
    expect(message).toContain('Missing 1 required arg')
    expect(message).toContain('id')
  })

  it('a flag that does not exist is named', async () => {
    expect(await parseFailure(TicketsList, ['--project', PID, '--json', '--nope'])).toEqual({
      code: 'C400-INP-001',
      message: 'Nonexistent flag: --nope',
    })
  })

  // A command with no flags of its own has nothing to read from the parser, so it used to skip
  // `this.parse()` altogether — and oclif validates the command line only there. A typo then slipped
  // through and the command ran as if the flag had never been typed, with no way to notice it.
  const flagless: Array<[string, Parameters<typeof run>[0]]> = [
    ['whoami', Whoami],
    ['org show', OrgShow],
    ['alerts preferences show', AlertsPreferencesShow],
    ['alerts notifications read-all', AlertsNotificationsReadAll],
  ]

  it.each(flagless)('%s rejects a nonexistent flag instead of ignoring it', async (_name, command) => {
    apiMock.get.mockResolvedValue(envelope({}))
    apiMock.put.mockResolvedValue(envelope({}))
    expect(await parseFailure(command, ['--json', '--nope'])).toEqual({
      code: 'C400-INP-001',
      message: 'Nonexistent flag: --nope',
    })
  })

  it('a command guard (--confirm missing) arrives whole', async () => {
    expect(await parseFailure(TicketsDelete, ['t-1', '--project', PID, '--json'])).toEqual({
      code: 'C400-INP-001',
      message: 'Refusing to delete without --confirm (the action is irreversible).',
    })
    expect(apiMock.delete).not.toHaveBeenCalled()
  })

  it('a real failure keeps the generic code', async () => {
    apiMock.get.mockRejectedValue(new Error('rete a terra'))
    expect(await parseFailure(TicketsShow, ['CYCL-33', '--project', PID, '--json'])).toEqual({
      code: 'C500-SYS-001',
      message: 'Command failed',
    })
  })

  it('without --json the human oclif message stays unchanged', async () => {
    const cap = capture()
    try {
      const error = await run(TicketsShow, ['CYCL-33']).then(
        () => {
          throw new Error('atteso exit non-zero, ma il comando ha risolto')
        },
        (err: unknown) => err,
      )
      expect((error as Error).message).toContain('Missing required flag project')
      expect(cap.stdout()).toBe('')
    } finally {
      cap.restore()
    }
  })
})

describe('renderTable tolerates rows with missing fields (null-fallback branches)', () => {
  // A single empty-object row forces every `String(x ?? '')` (and the team/role count helpers)
  // down its null branch — the human-mode path that fully-populated rows never reach.
  it.each(orgScoped)('%s renders empty cells for a sparse row', async (_name, command) => {
    apiMock.get.mockResolvedValue(envelope([{}]))
    await expect(run(command, [])).resolves.toBeTruthy()
  })

  it.each(projectScoped)('%s renders empty cells for a sparse row', async (_name, command) => {
    apiMock.get.mockResolvedValue(envelope([{}]))
    await expect(run(command, ['--project', PID])).resolves.toBeTruthy()
  })
})
