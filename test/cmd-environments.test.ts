import {beforeEach, describe, expect, it, vi} from 'vitest'
import {apiMock, resetApiMock} from './helpers/api-mock'
import {apiError, envelope, runCaptured, runExpectingExit} from './helpers/command'

vi.mock('../src/lib/api', async (io) => {
  const actual = await io<typeof import('../src/lib/api')>()
  const {apiMock} = await import('./helpers/api-mock')
  return {...actual, CliApi: vi.fn(function () { return apiMock })}
})
vi.mock('../src/lib/config', async (io) => {
  const actual = await io<typeof import('../src/lib/config')>()
  return {...actual, loadConfig: vi.fn(() => ({apiUrl: 'https://api.test', token: 'tok_test'}))}
})

import EnvironmentsCreate from '../src/commands/environments/create'
import EnvironmentsDelete from '../src/commands/environments/delete'
import EnvironmentsList from '../src/commands/environments/list'
import EnvironmentsUpdate from '../src/commands/environments/update'

beforeEach(() => resetApiMock())

describe('environments — full flag coverage', () => {
  it('create includes position + --no-active', async () => {
    apiMock.post.mockResolvedValue(envelope({code: 'staging'}))
    await runCaptured(EnvironmentsCreate, ['staging', '--label', 'Staging', '--color', 'amber', '--position', '3', '--no-active'])
    expect(apiMock.post).toHaveBeenCalledWith('/cli/v1/environments', {
      code: 'staging', label: 'Staging', color: 'amber', position: 3, active: false,
    })
  })

  it('update maps every optional flag (all set)', async () => {
    apiMock.put.mockResolvedValue(envelope({code: 'prod'}))
    await runCaptured(EnvironmentsUpdate, ['staging', '--code', 'prod', '--label', 'Prod', '--color', 'indigo', '--position', '1', '--active'])
    expect(apiMock.put).toHaveBeenCalledWith('/cli/v1/environments/staging', {
      code: 'prod', label: 'Prod', color: 'indigo', position: 1, active: true,
    })
  })

  it('create maps the capability flags to *_enabled', async () => {
    apiMock.post.mockResolvedValue(envelope({code: 'qa'}))
    await runCaptured(EnvironmentsCreate, ['qa', '--label', 'QA', '--servers', '--no-uptime', '--secrets'])
    expect(apiMock.post).toHaveBeenCalledWith('/cli/v1/environments', {
      code: 'qa', label: 'QA', color: 'emerald', servers_enabled: true, uptime_enabled: false, secrets_enabled: true,
    })
  })

  it('update sends only the capability flags provided', async () => {
    apiMock.put.mockResolvedValue(envelope({code: 'staging'}))
    await runCaptured(EnvironmentsUpdate, ['staging', '--no-servers', '--uptime'])
    expect(apiMock.put).toHaveBeenCalledWith('/cli/v1/environments/staging', {
      servers_enabled: false, uptime_enabled: true,
    })
  })
})

describe('environments list', () => {
  it('lists environments', async () => {
    apiMock.get.mockResolvedValue(envelope([{code: 'production', label: 'Production', color: 'emerald', active: true, id: 'e1'}]))
    const {stdout} = await runCaptured(EnvironmentsList, [])
    expect(apiMock.get).toHaveBeenCalledWith('/cli/v1/environments?page=1')
    expect(stdout).toContain('production')
  })

  it('exits non-zero on an API error', async () => {
    apiMock.get.mockRejectedValue(apiError(403, 'R403-ENV-001', 'forbidden'))
    const {stderr} = await runExpectingExit(EnvironmentsList, [])
    expect(stderr).toContain('R403-ENV-001')
  })
})

describe('environments create', () => {
  it('posts code + label with the default color', async () => {
    apiMock.post.mockResolvedValue(envelope({code: 'production'}))
    await runCaptured(EnvironmentsCreate, ['production', '--label', 'Production'])
    expect(apiMock.post).toHaveBeenCalledWith('/cli/v1/environments', {code: 'production', label: 'Production', color: 'emerald'})
  })
})

describe('environments update / delete', () => {
  it('update → PUT by id-or-code', async () => {
    apiMock.put.mockResolvedValue(envelope({code: 'staging'}))
    await runCaptured(EnvironmentsUpdate, ['staging', '--label', 'Staging env', '--no-active'])
    expect(apiMock.put).toHaveBeenCalledWith('/cli/v1/environments/staging', {label: 'Staging env', active: false})
  })

  it('delete → refuses without --confirm', async () => {
    const {message} = await runExpectingExit(EnvironmentsDelete, ['staging'], 2)
    expect(message).toContain('Refusing to delete')
  })

  it('delete → deletes with --confirm', async () => {
    apiMock.delete.mockResolvedValue(envelope({}))
    const {result} = await runCaptured(EnvironmentsDelete, ['staging', '--confirm'])
    expect(apiMock.delete).toHaveBeenCalledWith('/cli/v1/environments/staging')
    expect((result as {deleted: string}).deleted).toBe('staging')
  })
})
