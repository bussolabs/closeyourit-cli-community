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

import PlatformsCreate from '../src/commands/platforms/create'
import PlatformsDelete from '../src/commands/platforms/delete'
import PlatformsList from '../src/commands/platforms/list'
import PlatformsUpdate from '../src/commands/platforms/update'

beforeEach(() => resetApiMock())

describe('platforms — full flag coverage', () => {
  it('update maps every optional flag (all set)', async () => {
    apiMock.put.mockResolvedValue(envelope({code: 'web'}))
    await runCaptured(PlatformsUpdate, ['web', '--code', 'webapp', '--label', 'Web', '--color', 'indigo', '--position', '1', '--active'])
    expect(apiMock.put).toHaveBeenCalledWith('/cli/v1/platforms/web', {
      code: 'webapp', label: 'Web', color: 'indigo', position: 1, active: true,
    })
  })
})

describe('platforms list', () => {
  it('lists platforms', async () => {
    apiMock.get.mockResolvedValue(envelope([{code: 'ios', label: 'iOS', color: 'sky', active: true, id: 'pf1'}]))
    const {stdout} = await runCaptured(PlatformsList, [])
    expect(apiMock.get).toHaveBeenCalledWith('/cli/v1/platforms?page=1')
    expect(stdout).toContain('iOS')
  })

  it('exits non-zero on an API error', async () => {
    apiMock.get.mockRejectedValue(apiError(403, 'R403-PLT-001', 'forbidden'))
    const {stderr} = await runExpectingExit(PlatformsList, [])
    expect(stderr).toContain('R403-PLT-001')
  })
})

describe('platforms create', () => {
  it('posts code + label with the default color', async () => {
    apiMock.post.mockResolvedValue(envelope({code: 'ios'}))
    await runCaptured(PlatformsCreate, ['ios', '--label', 'iOS'])
    expect(apiMock.post).toHaveBeenCalledWith('/cli/v1/platforms', {code: 'ios', label: 'iOS', color: 'sky'})
  })

  it('includes position and --no-active', async () => {
    apiMock.post.mockResolvedValue(envelope({code: 'legacy'}))
    await runCaptured(PlatformsCreate, ['legacy', '--label', 'Legacy', '--position', '2', '--no-active'])
    expect(apiMock.post).toHaveBeenCalledWith('/cli/v1/platforms', {
      code: 'legacy',
      label: 'Legacy',
      color: 'sky',
      position: 2,
      active: false,
    })
  })
})

describe('platforms update / delete', () => {
  it('update → PUT by id-or-code with only the changed fields', async () => {
    apiMock.put.mockResolvedValue(envelope({code: 'ios'}))
    await runCaptured(PlatformsUpdate, ['ios', '--label', 'iOS / iPadOS'])
    expect(apiMock.put).toHaveBeenCalledWith('/cli/v1/platforms/ios', {label: 'iOS / iPadOS'})
  })

  it('delete → refuses without --confirm', async () => {
    const {message} = await runExpectingExit(PlatformsDelete, ['legacy'], 2)
    expect(message).toContain('Refusing to delete')
  })

  it('delete → deletes with --confirm', async () => {
    apiMock.delete.mockResolvedValue(envelope({}))
    const {result} = await runCaptured(PlatformsDelete, ['legacy', '--confirm'])
    expect(apiMock.delete).toHaveBeenCalledWith('/cli/v1/platforms/legacy')
    expect((result as {deleted: string}).deleted).toBe('legacy')
  })
})

describe('platforms — supports-uptime flag', () => {
  it('create → POST includes supports_uptime when set', async () => {
    apiMock.post.mockResolvedValue(envelope({code: 'web'}))
    await runCaptured(PlatformsCreate, ['web', '--label', 'Web', '--supports-uptime'])
    expect(apiMock.post).toHaveBeenCalledWith('/cli/v1/platforms', {
      code: 'web', label: 'Web', color: 'sky', supports_uptime: true,
    })
  })

  it('update → PUT maps --no-supports-uptime to false', async () => {
    apiMock.put.mockResolvedValue(envelope({code: 'web'}))
    await runCaptured(PlatformsUpdate, ['web', '--no-supports-uptime'])
    expect(apiMock.put).toHaveBeenCalledWith('/cli/v1/platforms/web', {supports_uptime: false})
  })
})
