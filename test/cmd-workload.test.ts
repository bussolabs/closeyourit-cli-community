import {beforeEach, describe, expect, it, vi} from 'vitest'
import {apiMock, resetApiMock} from './helpers/api-mock'
import {MID, PID, TID, apiError, capture, envelope, run, runCaptured, runExpectingExit} from './helpers/command'

vi.mock('../src/lib/api', async (io) => {
  const actual = await io<typeof import('../src/lib/api')>()
  const {apiMock} = await import('./helpers/api-mock')
  return {...actual, CliApi: vi.fn(function () { return apiMock })}
})
vi.mock('../src/lib/config', async (io) => {
  const actual = await io<typeof import('../src/lib/config')>()
  return {...actual, loadConfig: vi.fn(() => ({apiUrl: 'https://api.test', token: 'tok_test'}))}
})

import WorkloadCreate from '../src/commands/workload/create'
import WorkloadDelete from '../src/commands/workload/delete'
import WorkloadList from '../src/commands/workload/list'
import WorkloadParticipantAdd from '../src/commands/workload/participant/add'
import WorkloadParticipantRemove from '../src/commands/workload/participant/remove'
import WorkloadPromote from '../src/commands/workload/promote'
import WorkloadShow from '../src/commands/workload/show'
import WorkloadUpdate from '../src/commands/workload/update'

const AID = 'wa-1' // action id (opaque: workload actions have no by-name resolver)
const TKID = '66666666-6666-4666-8666-666666666666' // ticket id
const ACTIONS = '/cli/v1/workload/actions'

/** An action as the CLI serializer ships it. */
const ACTION = {
  id: AID,
  title: 'Fiera di Rimini',
  description: 'Stand + materiale cartaceo',
  status: 'planned',
  team: 'Marketing',
  team_id: TID,
  ticket_id: null,
  ticket_code: null,
  participants: ['Ada Lovelace', 'Bo Rossi'],
  scheduled_at: '2026-09-01T09:00:00.000Z',
  due_at: null,
  created_by: 'Ada Lovelace',
}

/** Run a command keeping stdout AND stderr (warnings live on stderr). */
async function runWithStderr(
  command: Parameters<typeof run>[0],
  argv: string[],
): Promise<{stderr: string; stdout: string}> {
  const cap = capture()
  try {
    await run(command, argv)
    return {stderr: cap.stderr(), stdout: cap.stdout()}
  } finally {
    cap.restore()
  }
}

beforeEach(() => resetApiMock())

describe('workload list', () => {
  it('lists the actions of my teams with team, status and linked ticket', async () => {
    apiMock.get.mockResolvedValue(envelope([{...ACTION, ticket_code: 'DRFL-3'}], {total: 1}))
    const {result, stdout} = await runCaptured(WorkloadList, [])
    expect(apiMock.get).toHaveBeenCalledWith(`${ACTIONS}?page=1`)
    expect(stdout).toContain('Fiera di Rimini')
    expect(stdout).toContain('Marketing')
    expect(stdout).toContain('planned')
    expect(stdout).toContain('DRFL-3')
    expect((result as {data: unknown[]}).data).toHaveLength(1)
  })

  it('renders rows with missing fields', async () => {
    apiMock.get.mockResolvedValue(envelope([{}]))
    const {stdout} = await runCaptured(WorkloadList, [])
    expect(stdout).toContain('TITLE')
  })

  it('honours --page', async () => {
    apiMock.get.mockResolvedValue(envelope([]))
    await runCaptured(WorkloadList, ['--page', '2'])
    expect(apiMock.get).toHaveBeenCalledWith(`${ACTIONS}?page=2`)
  })

  it('emits the raw envelope in --json mode, without the table', async () => {
    apiMock.get.mockResolvedValue(envelope([ACTION], {total: 1}))
    const {result, stdout} = await runCaptured(WorkloadList, ['--json'])
    expect(stdout).not.toContain('TITLE')
    expect(JSON.parse(stdout)).toEqual({data: [ACTION], meta: {total: 1}})
    expect((result as {data: unknown[]}).data).toHaveLength(1)
  })

  it('exits non-zero on an API error', async () => {
    apiMock.get.mockRejectedValue(apiError(500, 'R500-SYS-001', 'server down'))
    const {stderr} = await runExpectingExit(WorkloadList, [])
    expect(stderr).toContain('R500-SYS-001')
  })
})

describe('workload show', () => {
  it('shows one action with its participants', async () => {
    apiMock.get.mockResolvedValue(envelope(ACTION))
    const {stdout} = await runCaptured(WorkloadShow, [AID])
    expect(apiMock.get).toHaveBeenCalledWith(`${ACTIONS}/${AID}`)
    expect(stdout).toContain('Fiera di Rimini')
    expect(stdout).toContain('Ada Lovelace, Bo Rossi')
  })

  it('prints a dash when nobody takes part yet', async () => {
    apiMock.get.mockResolvedValue(envelope({...ACTION, participants: []}))
    const {stdout} = await runCaptured(WorkloadShow, [AID])
    expect(stdout).toContain('participants: -')
  })

  // Scenario 1: whoever is not in the team cannot see the action — the server answers 404 (never 403, so as not
  // to reveal it exists) and the command must report that code, not mask it.
  it('surfaces the 404 an action of another team returns', async () => {
    apiMock.get.mockRejectedValue(apiError(404, 'R404-CLI-001', 'Not found'))
    const {stderr} = await runExpectingExit(WorkloadShow, [AID])
    expect(stderr).toContain('R404-CLI-001')
  })
})

describe('workload create', () => {
  it('resolves the team by name and posts the title', async () => {
    apiMock.get.mockResolvedValue(envelope([{id: TID, name: 'Marketing'}], {total_pages: 1}))
    apiMock.post.mockResolvedValue(envelope(ACTION))
    const {stdout} = await runCaptured(WorkloadCreate, ['--team', 'Marketing', '--title', 'Fiera di Rimini'])
    expect(apiMock.get).toHaveBeenCalledWith('/cli/v1/teams?page=1&per=100')
    expect(apiMock.post).toHaveBeenCalledWith(ACTIONS, {team_id: TID, title: 'Fiera di Rimini'})
    expect(stdout).toContain('Workload action created')
  })

  it('maps every optional field into the body', async () => {
    apiMock.post.mockResolvedValue(envelope({...ACTION, ticket_id: TKID}))
    await runCaptured(WorkloadCreate, [
      '--team', TID,
      '--title', 'Fiera',
      '--description', 'Stand',
      '--status', 'in_progress',
      '--scheduled-at', '2026-09-01T09:00:00Z',
      '--due-at', '2026-09-10T18:00:00Z',
      '--ticket', TKID,
    ])
    expect(apiMock.post).toHaveBeenCalledWith(ACTIONS, {
      team_id: TID,
      title: 'Fiera',
      description: 'Stand',
      status: 'in_progress',
      scheduled_at: '2026-09-01T09:00:00Z',
      due_at: '2026-09-10T18:00:00Z',
      ticket_id: TKID,
    })
  })

  it('resolves a human ticket code into its id', async () => {
    apiMock.get.mockImplementation(async (path: string) => {
      if (path.startsWith('/cli/v1/projects?')) return envelope([{id: PID, key: 'DRFL'}], {total_pages: 1})
      if (path === `/cli/v1/projects/${PID}/tickets/DRFL-3`) return envelope({id: TKID, code: 'DRFL-3'})
      throw new Error(`unexpected GET ${path}`)
    })
    apiMock.post.mockResolvedValue(envelope({...ACTION, ticket_id: TKID, ticket_code: 'DRFL-3'}))
    await runCaptured(WorkloadCreate, ['--team', TID, '--title', 'Firma accordo', '--ticket', 'DRFL-3'])
    expect(apiMock.post).toHaveBeenCalledWith(ACTIONS, {
      team_id: TID,
      title: 'Firma accordo',
      ticket_id: TKID,
    })
  })

  it('refuses a ticket reference that is neither an id nor a code, without calling the server', async () => {
    const {message} = await runExpectingExit(WorkloadCreate, ['--team', TID, '--title', 'X', '--ticket', 'nope'], 1)
    expect(message).toContain('C404-TKT-001')
    expect(apiMock.post).not.toHaveBeenCalled()
  })

  it('refuses a code the server answers without an id', async () => {
    apiMock.get.mockImplementation(async (path: string) => {
      if (path.startsWith('/cli/v1/projects?')) return envelope([{id: PID, key: 'DRFL'}], {total_pages: 1})
      return envelope({})
    })
    const {message} = await runExpectingExit(WorkloadCreate, ['--team', TID, '--title', 'X', '--ticket', 'DRFL-9'], 1)
    expect(message).toContain('C404-TKT-001')
    expect(apiMock.post).not.toHaveBeenCalled()
  })

  // The server silently replaces with "no ticket" an id the caller cannot see: without
  // this warning the activity would look linked to whoever created it, and it is not.
  it('warns when the server did not link the ticket', async () => {
    apiMock.post.mockResolvedValue(envelope({...ACTION, ticket_id: null}))
    const {stderr} = await runWithStderr(WorkloadCreate, ['--team', TID, '--title', 'Fiera', '--ticket', TKID])
    expect(stderr).toContain(TKID)
    expect(stderr).toContain('created without it')
  })

  it('keeps quiet when the ticket did land on the action', async () => {
    apiMock.post.mockResolvedValue(envelope({...ACTION, ticket_id: TKID, ticket_code: 'DRFL-3'}))
    const {stderr} = await runWithStderr(WorkloadCreate, ['--team', TID, '--title', 'Fiera', '--ticket', TKID])
    expect(stderr).toBe('')
  })

  // The server serves ten rows per page: the eleventh team must not become "not found".
  it('finds a team that lives past the first page of the lookup', async () => {
    apiMock.get.mockImplementation(async (path: string) => {
      if (path === '/cli/v1/teams?page=1&per=100') {
        return envelope([{id: 'other-team', name: 'Vendite'}], {total_pages: 2})
      }

      return envelope([{id: TID, name: 'Marketing'}], {total_pages: 2})
    })
    apiMock.post.mockResolvedValue(envelope(ACTION))
    await runCaptured(WorkloadCreate, ['--team', 'Marketing', '--title', 'Fiera'])
    expect(apiMock.get).toHaveBeenCalledWith('/cli/v1/teams?page=2&per=100')
    expect(apiMock.post).toHaveBeenCalledWith(ACTIONS, {team_id: TID, title: 'Fiera'})
  })

  // Listing teams needs permissions.manage, which the workload board does not require: without
  // an explanation the rejection would seem to concern the activity, not the list read for convenience.
  it('turns the 403 of the team lookup into the way out', async () => {
    apiMock.get.mockRejectedValue(apiError(403, 'R403-CLIAUTH-002', 'Permesso negato'))
    const {stderr} = await runExpectingExit(WorkloadCreate, ['--team', 'Marketing', '--title', 'Fiera'])
    expect(stderr).toContain('R403-CLIAUTH-002')
    expect(stderr).toContain('pass the team id instead of its name')
    expect(apiMock.post).not.toHaveBeenCalled()
  })

  it('surfaces the 422 a team I do not belong to returns', async () => {
    apiMock.post.mockRejectedValue(apiError(422, 'R422-WORKLOAD-001', 'Team must exist'))
    const {stderr} = await runExpectingExit(WorkloadCreate, ['--team', TID, '--title', 'Fiera'])
    expect(stderr).toContain('R422-WORKLOAD-001')
  })
})

describe('workload update', () => {
  it('sends only the flags passed', async () => {
    apiMock.put.mockResolvedValue(envelope({...ACTION, status: 'done'}))
    const {stdout} = await runCaptured(WorkloadUpdate, [AID, '--status', 'done'])
    expect(apiMock.put).toHaveBeenCalledWith(`${ACTIONS}/${AID}`, {status: 'done'})
    expect(stdout).toContain('Workload action updated')
  })

  it('rewrites title, description and the two dates', async () => {
    apiMock.put.mockResolvedValue(envelope(ACTION))
    await runCaptured(WorkloadUpdate, [
      AID,
      '--title', 'Fiera 2027',
      '--description', 'Nuovo stand',
      '--scheduled-at', '2027-09-01T09:00:00Z',
      '--due-at', '2027-09-10T18:00:00Z',
    ])
    expect(apiMock.put).toHaveBeenCalledWith(`${ACTIONS}/${AID}`, {
      title: 'Fiera 2027',
      description: 'Nuovo stand',
      scheduled_at: '2027-09-01T09:00:00Z',
      due_at: '2027-09-10T18:00:00Z',
    })
  })

  it('unlinks the ticket with an empty --ticket, without warning about it', async () => {
    apiMock.put.mockResolvedValue(envelope({...ACTION, ticket_id: null}))
    const {stderr} = await runWithStderr(WorkloadUpdate, [AID, '--ticket', ''])
    expect(apiMock.put).toHaveBeenCalledWith(`${ACTIONS}/${AID}`, {ticket_id: null})
    expect(stderr).toBe('')
  })

  // On an update the server's silent rejection does not leave things as they were: it clears the
  // field, so it also takes away the ticket linked before. The warning must say it in full.
  it('warns that the update left the action with no ticket at all', async () => {
    apiMock.put.mockResolvedValue(envelope({...ACTION, ticket_id: null}))
    const {stderr} = await runWithStderr(WorkloadUpdate, [AID, '--ticket', TKID])
    expect(stderr).toContain(TKID)
    expect(stderr).toContain('no linked ticket at all')
  })

  it('surfaces the 404 an action of another team returns', async () => {
    apiMock.put.mockRejectedValue(apiError(404, 'R404-CLI-001', 'Not found'))
    const {stderr} = await runExpectingExit(WorkloadUpdate, [AID, '--title', 'Mia'])
    expect(stderr).toContain('R404-CLI-001')
  })
})

describe('workload delete', () => {
  it('refuses without --confirm (exit 2, no api call)', async () => {
    const {message} = await runExpectingExit(WorkloadDelete, [AID], 2)
    expect(message).toContain('Refusing to delete')
    expect(apiMock.delete).not.toHaveBeenCalled()
  })

  it('deletes with --confirm', async () => {
    apiMock.delete.mockResolvedValue(envelope({}))
    const {result, stdout} = await runCaptured(WorkloadDelete, [AID, '--confirm'])
    expect(apiMock.delete).toHaveBeenCalledWith(`${ACTIONS}/${AID}`)
    expect(stdout).toContain('Deleted workload action')
    expect((result as {deleted: string}).deleted).toBe(AID)
  })

  it('deletes without the human line in --json mode', async () => {
    apiMock.delete.mockResolvedValue(envelope({}))
    const {result, stdout} = await runCaptured(WorkloadDelete, [AID, '--confirm', '--json'])
    expect(stdout).not.toContain('Deleted workload action')
    expect(JSON.parse(stdout)).toEqual({deleted: AID})
    expect((result as {deleted: string}).deleted).toBe(AID)
  })
})

describe('workload participant', () => {
  it('resolves the member email and adds them to the action', async () => {
    apiMock.get.mockResolvedValue(envelope([{account_id: MID, email: 'ada@acme.com'}], {total_pages: 1}))
    apiMock.post.mockResolvedValue(envelope({...ACTION, participants: ['Ada Lovelace']}))
    const {stdout} = await runCaptured(WorkloadParticipantAdd, [AID, 'ada@acme.com'])
    expect(apiMock.get).toHaveBeenCalledWith('/cli/v1/members?page=1&per=100')
    expect(apiMock.post).toHaveBeenCalledWith(`${ACTIONS}/${AID}/participants`, {account_id: MID})
    expect(stdout).toContain('Ada Lovelace')
  })

  it('finds a member that lives past the first page of the lookup', async () => {
    apiMock.get.mockImplementation(async (path: string) => {
      if (path === '/cli/v1/members?page=1&per=100') {
        return envelope([{account_id: 'other-account', email: 'bo@acme.com'}], {total_pages: 2})
      }

      return envelope([{account_id: MID, email: 'ada@acme.com'}], {total_pages: 2})
    })
    apiMock.post.mockResolvedValue(envelope(ACTION))
    await runCaptured(WorkloadParticipantAdd, [AID, 'ada@acme.com'])
    expect(apiMock.get).toHaveBeenCalledWith('/cli/v1/members?page=2&per=100')
    expect(apiMock.post).toHaveBeenCalledWith(`${ACTIONS}/${AID}/participants`, {account_id: MID})
  })

  it('turns the 403 of the member lookup into the way out', async () => {
    apiMock.get.mockRejectedValue(apiError(403, 'R403-CLIAUTH-002', 'Permesso negato'))
    const {stderr} = await runExpectingExit(WorkloadParticipantRemove, [AID, 'ada@acme.com'])
    expect(stderr).toContain('pass the account id instead of the email')
    expect(apiMock.delete).not.toHaveBeenCalled()
  })

  it('surfaces R422-WORKLOAD-002 when the person is not on the team', async () => {
    apiMock.post.mockRejectedValue(apiError(422, 'R422-WORKLOAD-002', 'Account must be a member of the team'))
    const {stderr} = await runExpectingExit(WorkloadParticipantAdd, [AID, MID])
    expect(stderr).toContain('R422-WORKLOAD-002')
  })

  it('removes a participant by account id', async () => {
    apiMock.delete.mockResolvedValue(envelope({}))
    const {result, stdout} = await runCaptured(WorkloadParticipantRemove, [AID, MID])
    expect(apiMock.delete).toHaveBeenCalledWith(`${ACTIONS}/${AID}/participants/${MID}`)
    expect(stdout).toContain('Removed')
    expect((result as {removed: string}).removed).toBe(MID)
  })

  it('removes without the human line in --json mode', async () => {
    apiMock.delete.mockResolvedValue(envelope({}))
    const {result, stdout} = await runCaptured(WorkloadParticipantRemove, [AID, MID, '--json'])
    expect(stdout).not.toContain('Removed')
    expect(JSON.parse(stdout)).toEqual({removed: MID})
    expect((result as {removed: string}).removed).toBe(MID)
  })
})

describe('workload promote', () => {
  it('creates the ticket in the resolved project and prints it', async () => {
    apiMock.get.mockResolvedValue(envelope([{id: PID, key: 'DRFL'}], {total_pages: 1}))
    apiMock.post.mockResolvedValue(envelope({id: TKID, code: 'DRFL-4', title: 'Firma accordo'}))
    const {stdout} = await runCaptured(WorkloadPromote, [AID, '--project', 'DRFL'])
    expect(apiMock.post).toHaveBeenCalledWith(`${ACTIONS}/${AID}/promotion`, {project_id: PID})
    expect(stdout).toContain('DRFL-4')
  })

  it('passes the draft fields and the resolved status/priority', async () => {
    apiMock.get.mockImplementation(async (path: string) => {
      if (path.startsWith('/cli/v1/types/ticket_statuses')) return envelope([{id: 'st-open', code: 'open'}])
      if (path.startsWith('/cli/v1/types/ticket_priorities')) return envelope([{id: 'pr-high', label: 'High'}])
      throw new Error(`unexpected GET ${path}`)
    })
    apiMock.post.mockResolvedValue(envelope({id: TKID, code: 'DRFL-4'}))
    await runCaptured(WorkloadPromote, [
      AID,
      '--project', PID,
      '--title', 'Implementare API servizio esterno',
      '--description', 'Nato dalla riunione di firma',
      '--kind', 'story',
      '--status', 'open',
      '--priority', 'High',
    ])
    expect(apiMock.post).toHaveBeenCalledWith(`${ACTIONS}/${AID}/promotion`, {
      project_id: PID,
      title: 'Implementare API servizio esterno',
      description: 'Nato dalla riunione di firma',
      kind: 'story',
      status_id: 'st-open',
      priority_id: 'pr-high',
    })
  })

  it('refuses a title longer than the server limit before calling', async () => {
    const {message} = await runExpectingExit(
      WorkloadPromote,
      [AID, '--project', PID, '--title', 'x'.repeat(256)],
      2,
    )
    expect(message).toContain('Too long for the server')
    expect(apiMock.post).not.toHaveBeenCalled()
  })

  it('surfaces R422-WORKLOAD-003 when the action already has a ticket', async () => {
    apiMock.post.mockRejectedValue(apiError(422, 'R422-WORKLOAD-003', 'Already linked'))
    const {stderr} = await runExpectingExit(WorkloadPromote, [AID, '--project', PID])
    expect(stderr).toContain('R422-WORKLOAD-003')
  })

  it('surfaces R404-WORKLOAD-001 when the project is not visible', async () => {
    apiMock.post.mockRejectedValue(apiError(404, 'R404-WORKLOAD-001', 'Project not found'))
    const {stderr} = await runExpectingExit(WorkloadPromote, [AID, '--project', PID])
    expect(stderr).toContain('R404-WORKLOAD-001')
  })

  it('emits the raw ticket envelope in --json mode', async () => {
    apiMock.post.mockResolvedValue(envelope({id: TKID, code: 'DRFL-4'}))
    const {result, stdout} = await runCaptured(WorkloadPromote, [AID, '--project', PID, '--json'])
    expect(stdout).not.toContain('Ticket created from')
    expect(JSON.parse(stdout)).toEqual({data: {id: TKID, code: 'DRFL-4'}})
    expect((result as {data: {code: string}}).data.code).toBe('DRFL-4')
  })
})
