import {beforeEach, describe, expect, it, vi} from 'vitest'
import {apiMock, resetApiMock} from './helpers/api-mock'
import {GID, apiError, envelope, runCaptured, runExpectingExit} from './helpers/command'

vi.mock('../src/lib/api', async (io) => {
  const actual = await io<typeof import('../src/lib/api')>()
  const {apiMock} = await import('./helpers/api-mock')
  return {...actual, CliApi: vi.fn(function () { return apiMock })}
})
vi.mock('../src/lib/config', async (io) => {
  const actual = await io<typeof import('../src/lib/config')>()
  return {...actual, loadConfig: vi.fn(() => ({apiUrl: 'https://api.test', token: 'tok_test'}))}
})

import GroupsCreate from '../src/commands/groups/create'
import GroupsDelete from '../src/commands/groups/delete'
import GroupsList from '../src/commands/groups/list'
import GroupsUpdate from '../src/commands/groups/update'

beforeEach(() => resetApiMock())

describe('groups list / create', () => {
  it('lists groups', async () => {
    apiMock.get.mockResolvedValue(envelope([{name: 'DriverOne', color: 'indigo', id: GID}]))
    const {stdout} = await runCaptured(GroupsList, [])
    expect(apiMock.get).toHaveBeenCalledWith('/cli/v1/groups?page=1')
    expect(stdout).toContain('DriverOne')
  })

  it('create → POST name (+ color)', async () => {
    apiMock.post.mockResolvedValue(envelope({id: GID, name: 'DriverOne'}))
    await runCaptured(GroupsCreate, ['DriverOne', '--color', 'indigo'])
    expect(apiMock.post).toHaveBeenCalledWith('/cli/v1/groups', {name: 'DriverOne', color: 'indigo'})
  })

  it('exits non-zero on an API error', async () => {
    apiMock.post.mockRejectedValue(apiError(422, 'R422-GRP-001', 'name taken'))
    const {stderr} = await runExpectingExit(GroupsCreate, ['DriverOne'])
    expect(stderr).toContain('R422-GRP-001')
  })
})

describe('groups update / delete', () => {
  it('update by UUID → PUT with changed fields', async () => {
    apiMock.put.mockResolvedValue(envelope({id: GID, name: 'Backend services'}))
    await runCaptured(GroupsUpdate, [GID, '--name', 'Backend services'])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/groups/${GID}`, {name: 'Backend services'})
  })

  it('update by name → resolves the id first', async () => {
    apiMock.get.mockResolvedValue(envelope([{id: GID, name: 'Backend'}]))
    apiMock.put.mockResolvedValue(envelope({id: GID}))
    await runCaptured(GroupsUpdate, ['Backend', '--color', 'indigo'])
    expect(apiMock.get).toHaveBeenCalledWith('/cli/v1/groups?page=1&per=100')
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/groups/${GID}`, {color: 'indigo'})
  })

  it('delete → refuses without --confirm', async () => {
    const {message} = await runExpectingExit(GroupsDelete, [GID], 2)
    expect(message).toContain('Refusing to delete')
  })

  it('delete → deletes with --confirm', async () => {
    apiMock.delete.mockResolvedValue(envelope({}))
    const {result} = await runCaptured(GroupsDelete, [GID, '--confirm'])
    expect(apiMock.delete).toHaveBeenCalledWith(`/cli/v1/groups/${GID}`)
    expect((result as {deleted: string}).deleted).toBe(GID)
  })
})
