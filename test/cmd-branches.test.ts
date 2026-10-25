import {beforeEach, describe, expect, it, vi} from 'vitest'
import {apiMock, resetApiMock} from './helpers/api-mock'
import {GID, MID, PID, RID, TID, envelope, runCaptured} from './helpers/command'

vi.mock('../src/lib/api', async (io) => {
  const actual = await io<typeof import('../src/lib/api')>()
  const {apiMock} = await import('./helpers/api-mock')
  return {...actual, CliApi: vi.fn(function () { return apiMock })}
})
vi.mock('../src/lib/config', async (io) => {
  const actual = await io<typeof import('../src/lib/config')>()
  return {...actual, loadConfig: vi.fn(() => ({apiUrl: 'https://api.test', token: 'tok_test'}))}
})

import AlertsCreate from '../src/commands/alerts/create'
import AlertsNotificationsRead from '../src/commands/alerts/notifications/read'
import AlertsNotificationsReadAll from '../src/commands/alerts/notifications/read-all'
import AlertsPreferencesShow from '../src/commands/alerts/preferences/show'
import AlertsPreferencesUpdate from '../src/commands/alerts/preferences/update'
import AlertsShow from '../src/commands/alerts/show'
import AlertsUpdate from '../src/commands/alerts/update'
import EnvironmentsCreate from '../src/commands/environments/create'
import EnvironmentsUpdate from '../src/commands/environments/update'
import ErrorsAssign from '../src/commands/errors/assign'
import ErrorsDelete from '../src/commands/errors/delete'
import ErrorsGroupingRulesCreate from '../src/commands/errors/grouping-rules/create'
import ErrorsGroupingRulesList from '../src/commands/errors/grouping-rules/list'
import ErrorsGroupingRulesUpdate from '../src/commands/errors/grouping-rules/update'
import ErrorsMerge from '../src/commands/errors/merge'
import ErrorsPromote from '../src/commands/errors/promote'
import ErrorsSplit from '../src/commands/errors/split'
import ErrorsShow from '../src/commands/errors/show'
import GroupsCreate from '../src/commands/groups/create'
import GroupsUpdate from '../src/commands/groups/update'
import InvitationsCreate from '../src/commands/invitations/create'
import InvitationsResend from '../src/commands/invitations/resend'
import LogsLink from '../src/commands/logs/link'
import LogsShow from '../src/commands/logs/show'
import MembersSetAccess from '../src/commands/members/set-access'
import MembersSetRole from '../src/commands/members/set-role'
import MembersUpdate from '../src/commands/members/update'
import MetricsPromote from '../src/commands/metrics/promote'
import MetricsShow from '../src/commands/metrics/show'
import MilestonesCreate from '../src/commands/milestones/create'
import MilestonesShow from '../src/commands/milestones/show'
import MilestonesUpdate from '../src/commands/milestones/update'
import MonitorsCreate from '../src/commands/monitors/create'
import MonitorsShow from '../src/commands/monitors/show'
import MonitorsUpdate from '../src/commands/monitors/update'
import OrgShow from '../src/commands/org/show'
import OrgUpdate from '../src/commands/org/update'
import PlatformsCreate from '../src/commands/platforms/create'
import PlatformsUpdate from '../src/commands/platforms/update'
import ProjectsCreate from '../src/commands/projects/create'
import ProjectsSetEnvironments from '../src/commands/projects/set-environments'
import ProjectsShow from '../src/commands/projects/show'
import ProjectsUpdate from '../src/commands/projects/update'
import RolesCreate from '../src/commands/roles/create'
import RolesShow from '../src/commands/roles/show'
import RolesUpdate from '../src/commands/roles/update'
import TeamsCreate from '../src/commands/teams/create'
import TeamsShow from '../src/commands/teams/show'
import TeamsUpdate from '../src/commands/teams/update'
import TicketsAttachments from '../src/commands/tickets/attachments'
import TicketsComment from '../src/commands/tickets/comment'
import TicketsComments from '../src/commands/tickets/comments'
import TicketsCreate from '../src/commands/tickets/create'
import TicketsLinks from '../src/commands/tickets/links'
import TicketsReport from '../src/commands/tickets/report'
import TicketsReportShow from '../src/commands/tickets/report-show'
import TicketsReportVersions from '../src/commands/tickets/report-versions'
import TicketsReviewer from '../src/commands/tickets/reviewer'
import TicketsShow from '../src/commands/tickets/show'
import TicketsStatus from '../src/commands/tickets/status'
import TicketsUnreviewer from '../src/commands/tickets/unreviewer'
import TicketsUnvote from '../src/commands/tickets/unvote'
import TicketsUnwatch from '../src/commands/tickets/unwatch'
import TicketsVote from '../src/commands/tickets/vote'
import TicketsWatch from '../src/commands/tickets/watch'
import TicketsWorkContext from '../src/commands/tickets/work-context'
import TokensCreate from '../src/commands/tokens/create'
import TokensRotate from '../src/commands/tokens/rotate'

/**
 * Cross-command branch coverage for the two guards every show/create/update/action command shares:
 *  - `if (!this.jsonEnabled())` — the `--json` run exercises the else (machine-output) side.
 *  - `res.data ?? {}` / `?? []` — the null-envelope run exercises the fallback side that a
 *    fully-populated response never reaches.
 * Minimal argv (only the required flags) means the optional `!== undefined` guards take their
 * false side here; the per-domain "all flags" tests cover their true side. UUID args/flags let
 * the base `resolve*` helpers short-circuit, so each command makes exactly its one intended call.
 * Excluded on purpose: `whoami` and teams add/remove-member read fields off `res.data` directly
 * (a null envelope would throw), and `tickets attach`/`attachment-download` need the fs mock.
 */
type Entry = [name: string, command: {run: typeof TicketsShow.run}, argv: string[]]

/** Id of a type lookup (status/priority): passing it as a UUID skips the by-name resolution. */
const LOOKUP_UUID = '66666666-6666-4666-8666-666666666666'

const recordCommands: Entry[] = [
  ['alerts show', AlertsShow, ['ar-1']],
  ['alerts create', AlertsCreate, ['A', '--event-type', 'error_new']],
  ['alerts update', AlertsUpdate, ['ar-1', '--name', 'A']],
  ['alerts notifications read', AlertsNotificationsRead, ['an-1']],
  ['alerts notifications read-all', AlertsNotificationsReadAll, []],
  ['alerts preferences show', AlertsPreferencesShow, []],
  ['alerts preferences update', AlertsPreferencesUpdate, []],
  ['environments create', EnvironmentsCreate, ['staging', '--label', 'S']],
  ['environments update', EnvironmentsUpdate, ['staging', '--label', 'S']],
  ['groups create', GroupsCreate, ['G']],
  ['groups update', GroupsUpdate, [GID, '--name', 'G']],
  ['milestones show', MilestonesShow, ['ms-1', '-p', PID]],
  ['milestones create', MilestonesCreate, ['-p', PID, '--code', 'v', '--label', 'V']],
  ['milestones update', MilestonesUpdate, ['ms-1', '-p', PID, '--label', 'V']],
  ['monitors show', MonitorsShow, ['mon-1', '-p', PID]],
  ['monitors create', MonitorsCreate, ['-p', PID, '--url', 'https://a/up']],
  ['monitors update', MonitorsUpdate, ['mon-1', '-p', PID, '--url', 'https://a/up']],
  ['org show', OrgShow, []],
  ['org update', OrgUpdate, ['--name', 'x']],
  ['platforms create', PlatformsCreate, ['ios', '--label', 'iOS']],
  ['platforms update', PlatformsUpdate, ['ios', '--label', 'iOS']],
  ['projects show', ProjectsShow, [PID]],
  ['projects create', ProjectsCreate, ['app', '--key', 'AP']],
  ['projects update', ProjectsUpdate, ['-p', PID, '--name', 'x']],
  ['roles show', RolesShow, [RID]],
  ['roles create', RolesCreate, ['Client']],
  ['roles update', RolesUpdate, [RID, '--name', 'C']],
  ['teams show', TeamsShow, [TID]],
  ['teams create', TeamsCreate, ['T']],
  ['teams update', TeamsUpdate, [TID, '--name', 'T']],
  ['metrics show', MetricsShow, ['mg-1', '-p', PID]],
  ['metrics promote', MetricsPromote, ['mg-1', '-p', PID]],
  ['errors show', ErrorsShow, ['eg-1', '-p', PID]],
  ['errors promote', ErrorsPromote, ['eg-1', '-p', PID]],
  ['errors assign', ErrorsAssign, ['eg-1', '-p', PID, '--unassign']],
  ['errors merge', ErrorsMerge, ['eg-1', '-p', PID, '--group', 'eg-2', '--confirm']],
  ['errors split', ErrorsSplit, ['eg-1', '-p', PID, '--event', 'ev-1']],
  ['errors delete', ErrorsDelete, ['eg-1', '-p', PID, '--confirm']],
  ['errors grouping-rules create', ErrorsGroupingRulesCreate,
    ['-p', PID, '--field', 'message', '--operator', 'contains', '--value', 'x', '--fingerprint-key', 'k']],
  ['errors grouping-rules update', ErrorsGroupingRulesUpdate, ['egr-1', '-p', PID, '--value', 'x']],
  ['logs show', LogsShow, ['log-1']],
  ['logs link', LogsLink, ['log-1', '--to', 'Errors::Group:eg-1']],
  ['tickets show', TicketsShow, ['tk-1', '-p', PID]],
  // Status and priority passed as ids: the by-name resolution has its own lookup, covered elsewhere (CYCL-34).
  ['tickets create', TicketsCreate, ['-p', PID, '--title', 'x', '--status', LOOKUP_UUID, '--priority', LOOKUP_UUID]],
  ['tickets status', TicketsStatus, ['tk-1', '-p', PID, '--status', LOOKUP_UUID]],
  ['tickets vote', TicketsVote, ['tk-1', '-p', PID]],
  ['tickets unvote', TicketsUnvote, ['tk-1', '-p', PID]],
  ['tickets comment', TicketsComment, ['tk-1', '-p', PID, '--body', 'x']],
  ['tickets report', TicketsReport, ['tk-1', '-p', PID, '--body', 'x']],
  ['tickets report-show', TicketsReportShow, ['tk-1', '-p', PID]],
  ['tickets reviewer', TicketsReviewer, ['tk-1', '-p', PID, '--reviewer-id', 'acc-1']],
  ['tickets unreviewer', TicketsUnreviewer, ['tk-1', '-p', PID]],
  ['tickets watch', TicketsWatch, ['tk-1', '-p', PID]],
  ['tickets unwatch', TicketsUnwatch, ['tk-1', '-p', PID]],
  ['tickets work-context', TicketsWorkContext, ['tk-1', '-p', PID]],
  ['tokens create', TokensCreate, ['-p', PID, '--name', 'x', '--environment-id', 'e1']],
  ['tokens rotate', TokensRotate, ['ing-1', '-p', PID]],
  ['invitations create', InvitationsCreate, ['a@acme.test']],
  ['invitations resend', InvitationsResend, ['inv-1']],
  ['members set-role', MembersSetRole, [MID, '--role', 'admin']],
  ['members set-access', MembersSetAccess, [MID]],
  ['members update', MembersUpdate, [MID, '--name', 'x']],
]

const arrayCommands: Entry[] = [
  ['tickets comments', TicketsComments, ['tk-1', '-p', PID]],
  ['tickets attachments', TicketsAttachments, ['tk-1', '-p', PID]],
  ['tickets links', TicketsLinks, ['tk-1', '-p', PID]],
  ['tickets report-versions', TicketsReportVersions, ['tk-1', '-p', PID]],
  ['projects set-environments', ProjectsSetEnvironments, ['-p', PID, '--code', 'production']],
  ['errors grouping-rules list', ErrorsGroupingRulesList, ['-p', PID]],
]

/** Every api verb resolves to the same value, so a command gets its payload whatever method it calls. */
function resolveAllWith(value: unknown): void {
  for (const method of ['get', 'post', 'put', 'patch', 'delete'] as const) apiMock[method].mockResolvedValue(value)
}

beforeEach(() => resetApiMock())

describe('--json suppresses human output and returns the envelope', () => {
  // In `--json` mode oclif prints the envelope itself (through console.log) and the command skips
  // its human-readable block, so stdout is the JSON payload — asserting it proves the else-branch ran.
  it.each(recordCommands)('%s --json', async (_name, command, argv) => {
    resolveAllWith(envelope({id: 'x', votes_count: 2}))
    const {result, stdout} = await runCaptured(command, [...argv, '--json'])
    expect(result).toBeTruthy()
    expect(stdout).toContain('"data"')
  })

  it.each(arrayCommands)('%s --json', async (_name, command, argv) => {
    resolveAllWith(envelope([{id: 'x'}]))
    const {result, stdout} = await runCaptured(command, [...argv, '--json'])
    expect(result).toBeTruthy()
    expect(stdout).toContain('"data"')
  })
})

describe('a null envelope falls back to an empty record/list without crashing', () => {
  it.each([...recordCommands, ...arrayCommands])('%s tolerates data: undefined', async (_name, command, argv) => {
    resolveAllWith({data: undefined})
    await expect(runCaptured(command, argv)).resolves.toBeTruthy()
  })
})
