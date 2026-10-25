import {beforeEach, describe, expect, it, vi} from 'vitest'
import {apiMock, resetApiMock} from './helpers/api-mock'
import {PID, envelope, runCaptured} from './helpers/command'

vi.mock('../src/lib/api', async (io) => {
  const actual = await io<typeof import('../src/lib/api')>()
  const {apiMock} = await import('./helpers/api-mock')
  return {...actual, CliApi: vi.fn(function () { return apiMock })}
})
vi.mock('../src/lib/config', async (io) => {
  const actual = await io<typeof import('../src/lib/config')>()
  return {...actual, loadConfig: vi.fn(() => ({apiUrl: 'https://api.test', token: 'tok_test'}))}
})

import UsageList from '../src/commands/usage/list'
import UsageReporters from '../src/commands/usage/reporters'

beforeEach(() => resetApiMock())

// CYSK-29 — reading back usage telemetry: seen symbols + live reporters.
describe('usage list', () => {
  it('lists the symbols with kind and environment filters', async () => {
    apiMock.get.mockResolvedValue(
      envelope([{kind: 'route', symbol: 'Users#index', last_seen_at: '2026-08-31T10:00:00Z', hits_count: 42, environment: 'production'}]),
    )
    const {stdout} = await runCaptured(UsageList, ['--project', PID, '--kind', 'route', '--environment', 'production'])
    expect(apiMock.get).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/usage?page=1&kind=route&environment=production`)
    expect(stdout).toContain('Users#index')
  })
})

describe('usage reporters', () => {
  it('lists reporters and shouts the truncated flag', async () => {
    apiMock.get.mockResolvedValue(
      envelope([{kind: 'route', sdk_name: 'closeyourit-ruby', sdk_version: '0.9.0', truncated_last_window: true, environment: 'production'}]),
    )
    const {stdout} = await runCaptured(UsageReporters, ['--project', PID])
    expect(apiMock.get).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/usage/reporters`)
    expect(stdout).toContain('truncated YES')
  })
})
