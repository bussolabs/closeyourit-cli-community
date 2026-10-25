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

import AlertsCreate from '../src/commands/alerts/create'
import AlertsDelete from '../src/commands/alerts/delete'
import AlertsList from '../src/commands/alerts/list'
import AlertsShow from '../src/commands/alerts/show'
import AlertsUpdate from '../src/commands/alerts/update'

const RULE = 'ar-1'

beforeEach(() => resetApiMock())

describe('alerts — full flag coverage', () => {
  it('create maps every optional flag (all set)', async () => {
    apiMock.post.mockResolvedValue(envelope({id: RULE}))
    await runCaptured(AlertsCreate, [
      'All', '--event-type', 'metric_threshold', '--min-level', 'error',
      '--threshold-ms', '500', '--throttle-minutes', '15', '--enabled',
      '--project', PID, '--environment', 'env-1',
    ])
    expect(apiMock.post).toHaveBeenCalledWith('/cli/v1/alert_rules', {
      name: 'All',
      event_type: 'metric_threshold',
      min_level: 'error',
      threshold_ms: 500,
      throttle_minutes: 15,
      enabled: true,
      project_id: PID,
      environment_id: 'env-1',
    })
  })

  it('update maps every optional flag (all set)', async () => {
    apiMock.put.mockResolvedValue(envelope({id: RULE}))
    await runCaptured(AlertsUpdate, [
      RULE, '--name', 'N', '--event-type', 'error_new', '--min-level', 'warning',
      '--threshold-ms', '800', '--throttle-minutes', '20', '--enabled',
      '--project', PID, '--environment', 'env-2',
    ])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/alert_rules/${RULE}`, {
      name: 'N',
      event_type: 'error_new',
      min_level: 'warning',
      threshold_ms: 800,
      throttle_minutes: 20,
      enabled: true,
      project_id: PID,
      environment_id: 'env-2',
    })
  })
})

describe('alerts list / show', () => {
  it('lists alert rules', async () => {
    apiMock.get.mockResolvedValue(envelope([{name: 'New errors', event_type: 'error_new', enabled: true, id: RULE}]))
    const {stdout} = await runCaptured(AlertsList, [])
    expect(apiMock.get).toHaveBeenCalledWith('/cli/v1/alert_rules?page=1')
    expect(stdout).toContain('New errors')
  })

  it('show → fetches one rule', async () => {
    apiMock.get.mockResolvedValue(envelope({id: RULE, name: 'New errors'}))
    const {stdout} = await runCaptured(AlertsShow, [RULE])
    expect(apiMock.get).toHaveBeenCalledWith(`/cli/v1/alert_rules/${RULE}`)
    expect(stdout).toContain('New errors')
  })

  it('exits non-zero on an API error', async () => {
    apiMock.get.mockRejectedValue(apiError(403, 'R403-ALR-001', 'forbidden'))
    const {stderr} = await runExpectingExit(AlertsList, [])
    expect(stderr).toContain('R403-ALR-001')
  })
})

describe('alerts create', () => {
  it('posts name + event_type and maps scope/throttle flags', async () => {
    apiMock.post.mockResolvedValue(envelope({id: RULE}))
    await runCaptured(AlertsCreate, [
      'API down', '--event-type', 'uptime_down', '--project', PID, '--throttle-minutes', '30',
    ])
    expect(apiMock.post).toHaveBeenCalledWith('/cli/v1/alert_rules', {
      name: 'API down',
      event_type: 'uptime_down',
      throttle_minutes: 30,
      project_id: PID,
    })
  })

  it('rejects an unknown --event-type (exit 2)', async () => {
    await runExpectingExit(AlertsCreate, ['x', '--event-type', 'meltdown'], 2)
    expect(apiMock.post).not.toHaveBeenCalled()
  })
})

describe('alerts update / delete', () => {
  it('update → PUT only the changed fields (--no-enabled → enabled:false)', async () => {
    apiMock.put.mockResolvedValue(envelope({id: RULE}))
    await runCaptured(AlertsUpdate, [RULE, '--name', 'Critical errors', '--no-enabled'])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/alert_rules/${RULE}`, {name: 'Critical errors', enabled: false})
  })

  // CYCL-62: the body carries ONLY the flags passed, so the server does not clear what it does not receive.
  it('update of the name alone → sends only name, no scope or threshold', async () => {
    apiMock.put.mockResolvedValue(envelope({id: RULE}))
    await runCaptured(AlertsUpdate, [RULE, '--name', 'Solo il nome'])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/alert_rules/${RULE}`, {name: 'Solo il nome'})
  })

  it('update with an empty --project → sends an empty project_id (explicit clearing)', async () => {
    apiMock.put.mockResolvedValue(envelope({id: RULE}))
    await runCaptured(AlertsUpdate, [RULE, '--project', ''])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/alert_rules/${RULE}`, {project_id: ''})
  })

  it('delete → refuses without --confirm', async () => {
    const {message} = await runExpectingExit(AlertsDelete, [RULE], 2)
    expect(message).toContain('Refusing to delete')
  })

  it('delete → deletes with --confirm', async () => {
    apiMock.delete.mockResolvedValue(envelope({}))
    const {result} = await runCaptured(AlertsDelete, [RULE, '--confirm'])
    expect(apiMock.delete).toHaveBeenCalledWith(`/cli/v1/alert_rules/${RULE}`)
    expect((result as {deleted: string}).deleted).toBe(RULE)
  })
})
