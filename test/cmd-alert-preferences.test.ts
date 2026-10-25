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

import AlertsPreferencesShow from '../src/commands/alerts/preferences/show'
import AlertsPreferencesUpdate from '../src/commands/alerts/preferences/update'

beforeEach(() => resetApiMock())

describe('alerts preferences show', () => {
  it('fetches the personal preferences', async () => {
    apiMock.get.mockResolvedValue(envelope({in_app_enabled: true, min_level: 'error'}))
    const {stdout} = await runCaptured(AlertsPreferencesShow, [])
    expect(apiMock.get).toHaveBeenCalledWith('/cli/v1/alert_preferences')
    expect(stdout).toContain('in_app_enabled')
  })

  it('exits non-zero on an API error', async () => {
    apiMock.get.mockRejectedValue(apiError(500, 'R500-SYS-001', 'boom'))
    const {stderr} = await runExpectingExit(AlertsPreferencesShow, [])
    expect(stderr).toContain('R500-SYS-001')
  })
})

describe('alerts preferences update', () => {
  it('sends only the provided source toggles and min-level', async () => {
    apiMock.put.mockResolvedValue(envelope({email_enabled: false}))
    const {stdout} = await runCaptured(AlertsPreferencesUpdate, [
      '--no-email-enabled', '--tickets-enabled', '--min-level', 'error',
    ])
    expect(apiMock.put).toHaveBeenCalledWith('/cli/v1/alert_preferences', {
      email_enabled: false,
      tickets_enabled: true,
      min_level: 'error',
    })
    expect(stdout).toContain('Alert preferences updated')
  })

  it('maps every remaining source toggle', async () => {
    apiMock.put.mockResolvedValue(envelope({}))
    await runCaptured(AlertsPreferencesUpdate, [
      '--in-app-enabled', '--errors-enabled', '--uptime-enabled', '--chat-enabled', '--servers-enabled',
    ])
    expect(apiMock.put).toHaveBeenCalledWith('/cli/v1/alert_preferences', {
      in_app_enabled: true,
      errors_enabled: true,
      uptime_enabled: true,
      chat_enabled: true,
      servers_enabled: true,
    })
  })

  it('maps --quiet-hours-enabled to the "1" sentinel and forwards the window', async () => {
    apiMock.put.mockResolvedValue(envelope({}))
    await runCaptured(AlertsPreferencesUpdate, [
      '--quiet-hours-enabled',
      '--quiet-hours-start', '22:00',
      '--quiet-hours-end', '07:00',
      '--quiet-hours-tz', 'Europe/Rome',
    ])
    expect(apiMock.put).toHaveBeenCalledWith('/cli/v1/alert_preferences', {
      quiet_hours_enabled: '1',
      quiet_hours_start: '22:00',
      quiet_hours_end: '07:00',
      quiet_hours_tz: 'Europe/Rome',
    })
  })

  it('maps --no-quiet-hours-enabled to the "0" sentinel', async () => {
    apiMock.put.mockResolvedValue(envelope({}))
    await runCaptured(AlertsPreferencesUpdate, ['--no-quiet-hours-enabled'])
    expect(apiMock.put).toHaveBeenCalledWith('/cli/v1/alert_preferences', {quiet_hours_enabled: '0'})
  })

  it('sends an empty body when no flags are given', async () => {
    apiMock.put.mockResolvedValue(envelope({}))
    await runCaptured(AlertsPreferencesUpdate, [])
    expect(apiMock.put).toHaveBeenCalledWith('/cli/v1/alert_preferences', {})
  })
})
