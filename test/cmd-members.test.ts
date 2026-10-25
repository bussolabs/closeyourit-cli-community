import {beforeEach, describe, expect, it, vi} from 'vitest'
import {apiMock, resetApiMock} from './helpers/api-mock'
import {GID, MID, PID, RID, apiError, envelope, runCaptured, runExpectingExit} from './helpers/command'

vi.mock('../src/lib/api', async (io) => {
  const actual = await io<typeof import('../src/lib/api')>()
  const {apiMock} = await import('./helpers/api-mock')
  return {...actual, CliApi: vi.fn(function () { return apiMock })}
})
vi.mock('../src/lib/config', async (io) => {
  const actual = await io<typeof import('../src/lib/config')>()
  return {...actual, loadConfig: vi.fn(() => ({apiUrl: 'https://api.test', token: 'tok_test'}))}
})

import MembersList from '../src/commands/members/list'
import MembersRemove from '../src/commands/members/remove'
import MembersSetAccess from '../src/commands/members/set-access'
import MembersSetRole from '../src/commands/members/set-role'
import MembersUpdate from '../src/commands/members/update'

const MEMBERSHIP = 'ms-1'

beforeEach(() => resetApiMock())

describe('members list', () => {
  it('lists members', async () => {
    apiMock.get.mockResolvedValue(envelope([{email: 'a@acme.test', name: 'Ada', membership_role: 'admin', account_id: MID}]))
    const {stdout} = await runCaptured(MembersList, [])
    expect(apiMock.get).toHaveBeenCalledWith('/cli/v1/members?page=1')
    expect(stdout).toContain('a@acme.test')
  })

  it('exits non-zero on an API error', async () => {
    apiMock.get.mockRejectedValue(apiError(403, 'R403-MBR-001', 'forbidden'))
    const {stderr} = await runExpectingExit(MembersList, [])
    expect(stderr).toContain('R403-MBR-001')
  })
})

describe('members set-role', () => {
  it('PUTs the new role', async () => {
    apiMock.put.mockResolvedValue(envelope({id: MEMBERSHIP, membership_role: 'admin'}))
    const {stdout} = await runCaptured(MembersSetRole, [MEMBERSHIP, '--role', 'admin'])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/members/${MEMBERSHIP}/role`, {role: 'admin'})
    expect(stdout).toContain('Member role updated')
  })

  it('rejects an invalid --role (exit 2)', async () => {
    await runExpectingExit(MembersSetRole, [MEMBERSHIP, '--role', 'superuser'], 2)
    expect(apiMock.put).not.toHaveBeenCalled()
  })
})

describe('members set-access', () => {
  it('replaces the access set with the resolved ids (UUIDs pass through)', async () => {
    apiMock.put.mockResolvedValue(envelope({id: MEMBERSHIP}))
    await runCaptured(MembersSetAccess, [MEMBERSHIP, '--group', GID, '--project', PID])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/members/${MEMBERSHIP}/access`, {
      group_ids: [GID],
      project_ids: [PID],
    })
  })

  it('clears both dimensions when no flags are given (empty arrays)', async () => {
    apiMock.put.mockResolvedValue(envelope({id: MEMBERSHIP}))
    const {stdout} = await runCaptured(MembersSetAccess, [MEMBERSHIP])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/members/${MEMBERSHIP}/access`, {group_ids: [], project_ids: []})
    expect(stdout).toContain('Member access updated')
  })
})

describe('members set-access — roles and overrides', () => {
  it('adds role_ids (UUID pass-through) without touching group/project', async () => {
    apiMock.put.mockResolvedValue(envelope({id: MEMBERSHIP}))
    await runCaptured(MembersSetAccess, [MEMBERSHIP, '--role-id', RID])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/members/${MEMBERSHIP}/access`, {
      group_ids: [],
      project_ids: [],
      role_ids: [RID],
    })
  })

  it('parses repeated --override into a {key: value} map', async () => {
    apiMock.put.mockResolvedValue(envelope({id: MEMBERSHIP}))
    await runCaptured(MembersSetAccess, [
      MEMBERSHIP,
      '--override', 'tickets.edit=allow',
      '--override', 'tickets.delete=deny',
      '--override', 'errors.triage=inherit',
    ])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/members/${MEMBERSHIP}/access`, {
      group_ids: [],
      project_ids: [],
      overrides: {'tickets.edit': 'allow', 'tickets.delete': 'deny', 'errors.triage': 'inherit'},
    })
  })

  it('does NOT send role_ids/overrides when the flags are not passed', async () => {
    apiMock.put.mockResolvedValue(envelope({id: MEMBERSHIP}))
    await runCaptured(MembersSetAccess, [MEMBERSHIP, '--project', PID])
    const [, body] = apiMock.put.mock.calls[0] as [string, Record<string, unknown>]
    expect(body).not.toHaveProperty('role_ids')
    expect(body).not.toHaveProperty('overrides')
  })

  it('rejects an --override without "=" (exit 2), without calling the put', async () => {
    await runExpectingExit(MembersSetAccess, [MEMBERSHIP, '--override', 'tickets.edit'], 2)
    expect(apiMock.put).not.toHaveBeenCalled()
  })

  it('rejects a disallowed --override value (exit 2)', async () => {
    await runExpectingExit(MembersSetAccess, [MEMBERSHIP, '--override', 'tickets.edit=maybe'], 2)
    expect(apiMock.put).not.toHaveBeenCalled()
  })
})

describe('members update', () => {
  it('sends only the passed fields (profile PUT)', async () => {
    apiMock.put.mockResolvedValue(envelope({account_id: MID, name: 'Ada Lovelace'}))
    const {stdout} = await runCaptured(MembersUpdate, [MEMBERSHIP, '--name', 'Ada Lovelace'])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/members/${MEMBERSHIP}`, {name: 'Ada Lovelace'})
    expect(stdout).toContain('Member updated')
  })

  // The server refuses any email change made through membership management (R422-ACCOUNT-001): the help
  // must not suggest it (CYRA-914 D9).
  it('does not offer --email in the help or the examples', () => {
    expect(MembersUpdate.description).not.toContain('email')
    expect(MembersUpdate.examples.join('\n')).not.toContain('--email')
    expect(MembersUpdate.flags.email.hidden).toBe(true)
  })

  it('maps email and handle into the body', async () => {
    apiMock.put.mockResolvedValue(envelope({account_id: MID}))
    await runCaptured(MembersUpdate, [MEMBERSHIP, '--email', 'ada@acme.test', '--handle', 'ada'])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/members/${MEMBERSHIP}`, {email: 'ada@acme.test', handle: 'ada'})
  })

  it('exits non-zero on an API error (protected target)', async () => {
    apiMock.put.mockRejectedValue(apiError(403, 'R403-CLIAUTH-002', 'Permesso negato'))
    const {stderr} = await runExpectingExit(MembersUpdate, [MEMBERSHIP, '--name', 'x'])
    expect(stderr).toContain('R403-CLIAUTH-002')
  })
})

describe('members remove', () => {
  it('rejects without --confirm (exit 2)', async () => {
    const {message} = await runExpectingExit(MembersRemove, [MEMBERSHIP], 2)
    expect(message).toContain('Refusing to remove')
    expect(apiMock.delete).not.toHaveBeenCalled()
  })

  it('deletes the membership with --confirm', async () => {
    apiMock.delete.mockResolvedValue(envelope({}))
    const {result} = await runCaptured(MembersRemove, [MEMBERSHIP, '--confirm'])
    expect(apiMock.delete).toHaveBeenCalledWith(`/cli/v1/members/${MEMBERSHIP}`)
    expect((result as {removed: string}).removed).toBe(MEMBERSHIP)
  })

  it('skips the human line with --json', async () => {
    apiMock.delete.mockResolvedValue(envelope({}))
    const {result} = await runCaptured(MembersRemove, [MEMBERSHIP, '--confirm', '--json'])
    expect((result as {removed: string}).removed).toBe(MEMBERSHIP)
  })
})
