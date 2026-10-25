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

import AlertsNotificationsDelete from '../src/commands/alerts/notifications/delete'
import AlertsNotificationsList from '../src/commands/alerts/notifications/list'
import AlertsNotificationsRead from '../src/commands/alerts/notifications/read'
import AlertsNotificationsReadAll from '../src/commands/alerts/notifications/read-all'

const NOTIF = 'an-1'

beforeEach(() => resetApiMock())

describe('alerts notifications list', () => {
  it('lists notifications and prints the unread count from meta', async () => {
    apiMock.get.mockResolvedValue(
      envelope(
        [{id: NOTIF, event_type: 'ticket_created', title: 'New ticket', read: false, created_at: '2026-07-01T10:00:00Z'}],
        {unread: 3},
      ),
    )
    const {stdout} = await runCaptured(AlertsNotificationsList, [])
    expect(apiMock.get).toHaveBeenCalledWith('/cli/v1/alert_notifications?page=1')
    expect(stdout).toContain('New ticket')
    expect(stdout).toContain('Unread: 3')
  })

  it('honours --page', async () => {
    apiMock.get.mockResolvedValue(envelope([], {unread: 0}))
    await runCaptured(AlertsNotificationsList, ['--page', '2'])
    expect(apiMock.get).toHaveBeenCalledWith('/cli/v1/alert_notifications?page=2')
  })

  it('defaults the unread count to 0 when meta is absent', async () => {
    apiMock.get.mockResolvedValue(envelope([]))
    const {stdout} = await runCaptured(AlertsNotificationsList, [])
    expect(stdout).toContain('Unread: 0')
  })

  it('exits non-zero on an API error', async () => {
    apiMock.get.mockRejectedValue(apiError(500, 'R500-SYS-001', 'boom'))
    const {stderr} = await runExpectingExit(AlertsNotificationsList, [])
    expect(stderr).toContain('R500-SYS-001')
  })
})

describe('alerts notifications read / read-all', () => {
  it('read → PUT marks a single notification read', async () => {
    apiMock.put.mockResolvedValue(envelope({id: NOTIF, read: true}))
    const {stdout} = await runCaptured(AlertsNotificationsRead, [NOTIF])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/alert_notifications/${NOTIF}/read`)
    expect(stdout).toContain('marked read')
  })

  it('read-all → PUT the collection and reports the count', async () => {
    apiMock.put.mockResolvedValue(envelope({marked_read: 5}))
    const {stdout} = await runCaptured(AlertsNotificationsReadAll, [])
    expect(apiMock.put).toHaveBeenCalledWith('/cli/v1/alert_notifications/read_all')
    expect(stdout).toContain('Marked 5 notification(s) read')
  })
})

describe('alerts notifications delete', () => {
  it('refuses without --confirm (exit 2, no api call)', async () => {
    const {message} = await runExpectingExit(AlertsNotificationsDelete, [NOTIF], 2)
    expect(message).toContain('Refusing to delete')
    expect(apiMock.delete).not.toHaveBeenCalled()
  })

  it('deletes with --confirm', async () => {
    apiMock.delete.mockResolvedValue(envelope({}))
    const {result, stdout} = await runCaptured(AlertsNotificationsDelete, [NOTIF, '--confirm'])
    expect(apiMock.delete).toHaveBeenCalledWith(`/cli/v1/alert_notifications/${NOTIF}`)
    expect(stdout).toContain(`Deleted notification ${NOTIF}`)
    expect((result as {deleted: string}).deleted).toBe(NOTIF)
  })
})
