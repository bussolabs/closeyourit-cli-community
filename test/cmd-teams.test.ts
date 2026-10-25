import {beforeEach, describe, expect, it, vi} from 'vitest'
import {apiMock, resetApiMock} from './helpers/api-mock'
import {GID, MID, PID, RID, TID, apiError, envelope, runCaptured, runExpectingExit} from './helpers/command'

vi.mock('../src/lib/api', async (io) => {
  const actual = await io<typeof import('../src/lib/api')>()
  const {apiMock} = await import('./helpers/api-mock')
  return {...actual, CliApi: vi.fn(function () { return apiMock })}
})
vi.mock('../src/lib/config', async (io) => {
  const actual = await io<typeof import('../src/lib/config')>()
  return {...actual, loadConfig: vi.fn(() => ({apiUrl: 'https://api.test', token: 'tok_test'}))}
})

import TeamsAddMember from '../src/commands/teams/add-member'
import TeamsCreate from '../src/commands/teams/create'
import TeamsDelete from '../src/commands/teams/delete'
import TeamsList from '../src/commands/teams/list'
import TeamsRemoveMember from '../src/commands/teams/remove-member'
import TeamsShow from '../src/commands/teams/show'
import TeamsUpdate from '../src/commands/teams/update'

beforeEach(() => resetApiMock())

describe('teams — full flag coverage', () => {
  it('create maps color + every dimension (UUIDs pass through)', async () => {
    apiMock.post.mockResolvedValue(envelope({id: TID}))
    await runCaptured(TeamsCreate, [
      'DriverOne', '--color', 'indigo', '--role', RID, '--group', GID, '--project', PID, '--member', MID,
    ])
    expect(apiMock.post).toHaveBeenCalledWith('/cli/v1/teams', {
      name: 'DriverOne', color: 'indigo', role_ids: [RID], group_ids: [GID], project_ids: [PID], member_ids: [MID],
    })
  })

  it('update replaces color + every dimension (all set)', async () => {
    apiMock.put.mockResolvedValue(envelope({id: TID}))
    await runCaptured(TeamsUpdate, [
      TID, '--name', 'N', '--color', 'rose', '--role', RID, '--group', GID, '--project', PID, '--member', MID,
    ])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/teams/${TID}`, {
      name: 'N', color: 'rose', role_ids: [RID], group_ids: [GID], project_ids: [PID], member_ids: [MID],
    })
  })

  // CYCL-62: an omitted axis does not end up in the body, so the server does not clear it.
  it('update of the role alone → sends only role_ids, no group_ids or project_ids', async () => {
    apiMock.put.mockResolvedValue(envelope({id: TID}))
    await runCaptured(TeamsUpdate, [TID, '--role', RID])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/teams/${TID}`, {role_ids: [RID]})
  })

  it('update of the group alone → sends only group_ids, projects stay out of the body', async () => {
    apiMock.put.mockResolvedValue(envelope({id: TID}))
    await runCaptured(TeamsUpdate, [TID, '--group', GID])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/teams/${TID}`, {group_ids: [GID]})
  })

  it('resolves a member email to its account id (base resolveMemberId)', async () => {
    apiMock.get.mockResolvedValue(envelope([{account_id: MID, email: 'client@acme.test'}]))
    apiMock.post.mockResolvedValue(envelope({id: TID}))
    await runCaptured(TeamsCreate, ['DriverOne', '--member', 'client@acme.test'])
    expect(apiMock.get).toHaveBeenCalledWith('/cli/v1/members?page=1&per=100')
    expect(apiMock.post).toHaveBeenCalledWith('/cli/v1/teams', {name: 'DriverOne', member_ids: [MID]})
  })

  it('exits C404 when a member email matches no org member', async () => {
    apiMock.get.mockResolvedValue(envelope([{account_id: MID, email: 'someone@acme.test'}]))
    const {stderr} = await runExpectingExit(TeamsCreate, ['DriverOne', '--member', 'ghost@acme.test'])
    expect(stderr).toContain('C404-MBR-001')
  })

  it('add-member starts from an empty set when the team has no member_ids', async () => {
    apiMock.get.mockResolvedValue(envelope({id: TID}))
    apiMock.put.mockResolvedValue(envelope({id: TID}))
    await runCaptured(TeamsAddMember, [TID, MID])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/teams/${TID}`, {member_ids: [MID]})
  })

  it('remove-member yields an empty set when the team has no member_ids', async () => {
    apiMock.get.mockResolvedValue(envelope({id: TID}))
    apiMock.put.mockResolvedValue(envelope({id: TID}))
    await runCaptured(TeamsRemoveMember, [TID, MID])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/teams/${TID}`, {member_ids: []})
  })
})

describe('teams list / show', () => {
  it('lists teams with dimension counts', async () => {
    apiMock.get.mockResolvedValue(envelope([{name: 'DriverOne', role_ids: [RID], member_ids: [MID], id: TID}]))
    const {stdout} = await runCaptured(TeamsList, [])
    expect(apiMock.get).toHaveBeenCalledWith('/cli/v1/teams?page=1')
    expect(stdout).toContain('DriverOne')
  })

  it('show by UUID → fetches and prints the id dimensions', async () => {
    apiMock.get.mockResolvedValue(envelope({id: TID, name: 'DriverOne', role_ids: [RID], member_ids: []}))
    const {stdout} = await runCaptured(TeamsShow, [TID])
    expect(apiMock.get).toHaveBeenCalledWith(`/cli/v1/teams/${TID}`)
    expect(stdout).toContain(`role_ids: ${RID}`)
    expect(stdout).toContain('member_ids: -')
  })
})

describe('teams create', () => {
  it('resolves each dimension (UUIDs pass through) and posts the id arrays', async () => {
    apiMock.post.mockResolvedValue(envelope({id: TID, name: 'DriverOne'}))
    await runCaptured(TeamsCreate, [
      'DriverOne', '--role', RID, '--group', GID, '--project', PID, '--member', MID,
    ])
    expect(apiMock.post).toHaveBeenCalledWith('/cli/v1/teams', {
      name: 'DriverOne',
      role_ids: [RID],
      group_ids: [GID],
      project_ids: [PID],
      member_ids: [MID],
    })
  })

  it('resolves a role name to its id before posting', async () => {
    apiMock.get.mockResolvedValue(envelope([{id: RID, name: 'Client'}]))
    apiMock.post.mockResolvedValue(envelope({id: TID}))
    await runCaptured(TeamsCreate, ['DriverOne', '--role', 'Client'])
    expect(apiMock.get).toHaveBeenCalledWith('/cli/v1/roles?page=1&per=100')
    expect(apiMock.post).toHaveBeenCalledWith('/cli/v1/teams', {name: 'DriverOne', role_ids: [RID]})
  })
})

describe('teams update / delete', () => {
  it('update by UUID → PUT the replaced dimensions', async () => {
    apiMock.put.mockResolvedValue(envelope({id: TID}))
    await runCaptured(TeamsUpdate, [TID, '--name', 'DriverOne clients'])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/teams/${TID}`, {name: 'DriverOne clients'})
  })

  it('delete by UUID → DELETE', async () => {
    apiMock.delete.mockResolvedValue(envelope({}))
    const {result} = await runCaptured(TeamsDelete, [TID])
    expect(apiMock.delete).toHaveBeenCalledWith(`/cli/v1/teams/${TID}`)
    expect((result as {deleted: string}).deleted).toBe(TID)
  })
})

describe('teams add-member / remove-member', () => {
  it('add-member → reads the current members then PUTs the union', async () => {
    apiMock.get.mockResolvedValue(envelope({id: TID, member_ids: ['existing']}))
    apiMock.put.mockResolvedValue(envelope({id: TID}))
    const {stdout} = await runCaptured(TeamsAddMember, [TID, MID])
    expect(apiMock.get).toHaveBeenCalledWith(`/cli/v1/teams/${TID}`)
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/teams/${TID}`, {member_ids: ['existing', MID]})
    expect(stdout).toContain('2 members total')
  })

  it('remove-member → PUTs the members minus the target', async () => {
    apiMock.get.mockResolvedValue(envelope({id: TID, member_ids: [MID, 'other']}))
    apiMock.put.mockResolvedValue(envelope({id: TID}))
    const {stdout} = await runCaptured(TeamsRemoveMember, [TID, MID])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/teams/${TID}`, {member_ids: ['other']})
    expect(stdout).toContain('1 members left')
  })

  it('exits non-zero when reading the team fails', async () => {
    apiMock.get.mockRejectedValue(apiError(404, 'R404-TEM-001', 'no team'))
    const {stderr} = await runExpectingExit(TeamsAddMember, [TID, MID])
    expect(stderr).toContain('R404-TEM-001')
  })
})
