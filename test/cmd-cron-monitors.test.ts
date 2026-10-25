import {beforeEach, describe, expect, it, vi} from 'vitest'
import {apiMock, resetApiMock} from './helpers/api-mock'
import {PID, apiError, envelope, runCaptured, runExpectingExit} from './helpers/command'

vi.mock('../src/lib/api', async (io) => {
  const actual = await io<typeof import('../src/lib/api')>()
  const {apiMock} = await import('./helpers/api-mock')
  return {...actual, CliApi: vi.fn(function () { return apiMock })}
})
vi.mock('../src/lib/config', async (io) => {
  const actual = await io<typeof import('../src/lib/config')>()
  return {...actual, loadConfig: vi.fn(() => ({apiUrl: 'https://api.test', token: 'tok_test'}))}
})

import CronMonitorsList from '../src/commands/cron-monitors/list'
import CronMonitorsShow from '../src/commands/cron-monitors/show'

const CM = 'cm-1'

beforeEach(() => resetApiMock())

describe('cron-monitors list', () => {
  it('lists monitors across visible projects (default page, no filters)', async () => {
    apiMock.get.mockResolvedValue(
      envelope([{id: CM, name: 'nightly-billing', status: 'ok', expected_interval_minutes: 60}], {total: 1}),
    )
    const {stdout} = await runCaptured(CronMonitorsList, [])
    expect(apiMock.get).toHaveBeenCalledWith('/cli/v1/cron_monitors?page=1')
    expect(stdout).toContain('nightly-billing')
  })

  it('forwards --status', async () => {
    apiMock.get.mockResolvedValue(envelope([]))
    await runCaptured(CronMonitorsList, ['--status', 'missed'])
    expect(apiMock.get).toHaveBeenCalledWith('/cli/v1/cron_monitors?page=1&status=missed')
  })

  it('resolves a UUID --project to project_id (single call, no lookup)', async () => {
    apiMock.get.mockResolvedValue(envelope([]))
    await runCaptured(CronMonitorsList, ['--project', PID])
    expect(apiMock.get).toHaveBeenCalledTimes(1)
    expect(apiMock.get).toHaveBeenCalledWith(`/cli/v1/cron_monitors?page=1&project_id=${PID}`)
  })

  it('combines --status and --project', async () => {
    apiMock.get.mockResolvedValue(envelope([]))
    await runCaptured(CronMonitorsList, ['--status', 'late', '--project', PID])
    expect(apiMock.get).toHaveBeenCalledWith(`/cli/v1/cron_monitors?page=1&status=late&project_id=${PID}`)
  })

  it('rejects an invalid --status (usage error, no api call)', async () => {
    const {message} = await runExpectingExit(CronMonitorsList, ['--status', 'nope'], 2)
    expect(message).toContain('status')
    expect(apiMock.get).not.toHaveBeenCalled()
  })

  it('prints JSON and skips the human table with --json', async () => {
    apiMock.get.mockResolvedValue(envelope([{id: CM}]))
    const {stdout} = await runCaptured(CronMonitorsList, ['--json'])
    expect(stdout).toContain('"data"')
  })

  it('tolerates a null envelope', async () => {
    apiMock.get.mockResolvedValue({data: undefined})
    await expect(runCaptured(CronMonitorsList, [])).resolves.toBeTruthy()
  })

  it('exits non-zero on an API error', async () => {
    apiMock.get.mockRejectedValue(apiError(500, 'R500-SYS-001', 'boom'))
    const {stderr} = await runExpectingExit(CronMonitorsList, [])
    expect(stderr).toContain('R500-SYS-001')
  })
})

describe('cron-monitors show', () => {
  it('fetches a single monitor', async () => {
    apiMock.get.mockResolvedValue(envelope({id: CM, name: 'nightly-billing', status: 'ok'}))
    const {stdout} = await runCaptured(CronMonitorsShow, [CM])
    expect(apiMock.get).toHaveBeenCalledWith(`/cli/v1/cron_monitors/${CM}`)
    expect(stdout).toContain('nightly-billing')
  })

  it('prints JSON with --json', async () => {
    apiMock.get.mockResolvedValue(envelope({id: CM}))
    const {stdout} = await runCaptured(CronMonitorsShow, [CM, '--json'])
    expect(stdout).toContain('"data"')
  })

  it('tolerates a null envelope', async () => {
    apiMock.get.mockResolvedValue({data: undefined})
    await expect(runCaptured(CronMonitorsShow, [CM])).resolves.toBeTruthy()
  })
})
