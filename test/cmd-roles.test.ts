import {beforeEach, describe, expect, it, vi} from 'vitest'
import {apiMock, resetApiMock} from './helpers/api-mock'
import {RID, apiError, envelope, runCaptured, runExpectingExit} from './helpers/command'

vi.mock('../src/lib/api', async (io) => {
  const actual = await io<typeof import('../src/lib/api')>()
  const {apiMock} = await import('./helpers/api-mock')
  return {...actual, CliApi: vi.fn(function () { return apiMock })}
})
vi.mock('../src/lib/config', async (io) => {
  const actual = await io<typeof import('../src/lib/config')>()
  return {...actual, loadConfig: vi.fn(() => ({apiUrl: 'https://api.test', token: 'tok_test'}))}
})

import RolesCreate from '../src/commands/roles/create'
import RolesDelete from '../src/commands/roles/delete'
import RolesList from '../src/commands/roles/list'
import RolesShow from '../src/commands/roles/show'
import RolesUpdate from '../src/commands/roles/update'

beforeEach(() => resetApiMock())

describe('roles — full flag coverage', () => {
  it('create includes --color', async () => {
    apiMock.post.mockResolvedValue(envelope({id: RID, name: 'Client'}))
    await runCaptured(RolesCreate, ['Client', '--color', 'indigo', '--permission', 'tickets.edit'])
    expect(apiMock.post).toHaveBeenCalledWith('/cli/v1/roles', {name: 'Client', color: 'indigo', permission_keys: ['tickets.edit']})
  })

  it('update maps name + color + permission (all set)', async () => {
    apiMock.put.mockResolvedValue(envelope({id: RID}))
    await runCaptured(RolesUpdate, [RID, '--name', 'Client manager', '--color', 'rose', '--permission', 'tickets.edit'])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/roles/${RID}`, {
      name: 'Client manager', color: 'rose', permission_keys: ['tickets.edit'],
    })
  })
})

describe('roles list', () => {
  it('lists roles with a permission count', async () => {
    apiMock.get.mockResolvedValue(envelope([{id: RID, name: 'Client', permission_keys: ['tickets.edit', 'tickets.assign']}]))
    const {stdout} = await runCaptured(RolesList, [])
    expect(apiMock.get).toHaveBeenCalledWith('/cli/v1/roles?page=1')
    expect(stdout).toContain('Client')
    expect(stdout).toContain('2')
  })

  it('exits non-zero on an API error', async () => {
    apiMock.get.mockRejectedValue(apiError(403, 'R403-ROL-001', 'forbidden'))
    const {stderr} = await runExpectingExit(RolesList, [])
    expect(stderr).toContain('R403-ROL-001')
  })
})

describe('roles show', () => {
  it('resolves the name, fetches the role and lists its permissions', async () => {
    apiMock.get
      .mockResolvedValueOnce(envelope([{id: RID, name: 'Client'}]))
      .mockResolvedValueOnce(envelope({id: RID, name: 'Client', permission_keys: ['tickets.edit']}))
    const {stdout} = await runCaptured(RolesShow, ['Client'])
    expect(apiMock.get).toHaveBeenNthCalledWith(1, '/cli/v1/roles?page=1&per=100')
    expect(apiMock.get).toHaveBeenNthCalledWith(2, `/cli/v1/roles/${RID}`)
    expect(stdout).toContain('permissions: tickets.edit')
  })

  it('exits C404 when the name matches no role', async () => {
    apiMock.get.mockResolvedValue(envelope([{id: RID, name: 'Client'}]))
    const {stderr} = await runExpectingExit(RolesShow, ['Ghost'])
    expect(stderr).toContain('C404-ROL-001')
  })
})

describe('roles create / update / delete', () => {
  it('create → POST name + permission_keys', async () => {
    apiMock.post.mockResolvedValue(envelope({id: RID, name: 'Client', permission_keys: ['tickets.edit', 'tickets.assign']}))
    await runCaptured(RolesCreate, ['Client', '--permission', 'tickets.edit', '--permission', 'tickets.assign'])
    expect(apiMock.post).toHaveBeenCalledWith('/cli/v1/roles', {
      name: 'Client',
      permission_keys: ['tickets.edit', 'tickets.assign'],
    })
  })

  it('update by UUID → PUT replacing the permission set', async () => {
    apiMock.put.mockResolvedValue(envelope({id: RID, name: 'Client', permission_keys: ['tickets.edit']}))
    await runCaptured(RolesUpdate, [RID, '--permission', 'tickets.edit'])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/roles/${RID}`, {permission_keys: ['tickets.edit']})
  })

  it('delete by UUID → DELETE', async () => {
    apiMock.delete.mockResolvedValue(envelope({}))
    const {result, stdout} = await runCaptured(RolesDelete, [RID])
    expect(apiMock.delete).toHaveBeenCalledWith(`/cli/v1/roles/${RID}`)
    expect(stdout).toContain('Role deleted')
    expect((result as {deleted: string}).deleted).toBe(RID)
  })
})
