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

import LogsLink from '../src/commands/logs/link'
import LogsList from '../src/commands/logs/list'
import LogsShow from '../src/commands/logs/show'
import LogsUnlink from '../src/commands/logs/unlink'

const LOG = 'log-1'
const LINK = 'lnk-1'

beforeEach(() => resetApiMock())

describe('logs list', () => {
  it('lists the cross-app stream with no filters', async () => {
    apiMock.get.mockResolvedValue(
      envelope([{occurred_at: '2026-07-01T10:00:00Z', level: 'error', environment: 'production', logger: 'app', message: 'boom'}]),
    )
    const {stdout} = await runCaptured(LogsList, [])
    expect(apiMock.get).toHaveBeenCalledWith('/cli/v1/log_entries?page=1')
    expect(stdout).toContain('boom')
  })

  it('collapses a multi-line message onto a single row', async () => {
    apiMock.get.mockResolvedValue(envelope([{level: 'info', message: 'line one\n   line two'}]))
    const {stdout} = await runCaptured(LogsList, [])
    expect(stdout).toContain('line one line two')
    expect(stdout).not.toContain('line one\n   line two')
  })

  it('resolves --project to project_id and forwards level/trace/environment filters', async () => {
    apiMock.get
      // resolveProjectId('acme') → look up the key, then the actual log query.
      .mockResolvedValueOnce(envelope([{id: 'p-uuid', key: 'ACME'}]))
      .mockResolvedValueOnce(envelope([]))
    await runCaptured(LogsList, ['--project', 'acme', '--level', 'error', '--trace-id', '7f3c', '--environment', 'production'])
    expect(apiMock.get).toHaveBeenNthCalledWith(2, '/cli/v1/log_entries?page=1&project_id=p-uuid&level=error&trace_id=7f3c&environment=production')
  })

  it('passes a UUID --project straight through (no lookup)', async () => {
    apiMock.get.mockResolvedValue(envelope([]))
    await runCaptured(LogsList, ['--project', PID])
    expect(apiMock.get).toHaveBeenCalledTimes(1)
    expect(apiMock.get).toHaveBeenCalledWith(`/cli/v1/log_entries?page=1&project_id=${PID}`)
  })

  it('exits non-zero on an API error', async () => {
    apiMock.get.mockRejectedValue(apiError(500, 'R500-SYS-001', 'boom'))
    const {stderr} = await runExpectingExit(LogsList, [])
    expect(stderr).toContain('R500-SYS-001')
  })
})

describe('logs show', () => {
  it('fetches a single log entry by id', async () => {
    apiMock.get.mockResolvedValue(envelope({id: LOG, level: 'error', message: 'boom'}))
    const {stdout} = await runCaptured(LogsShow, [LOG])
    expect(apiMock.get).toHaveBeenCalledWith(`/cli/v1/log_entries/${LOG}`)
    expect(stdout).toContain('boom')
  })

  it('exits non-zero on an API error', async () => {
    apiMock.get.mockRejectedValue(apiError(404, 'R404-LOG-001', 'not found'))
    const {stderr} = await runExpectingExit(LogsShow, [LOG])
    expect(stderr).toContain('R404-LOG-001')
  })
})

describe('logs link', () => {
  it('posts the linkable target', async () => {
    apiMock.post.mockResolvedValue(envelope({id: LINK, linkable_type: 'Errors::Group', linkable_id: 'eg-1'}))
    const {stdout} = await runCaptured(LogsLink, [LOG, '--to', 'Errors::Group:eg-1'])
    expect(apiMock.post).toHaveBeenCalledWith(`/cli/v1/log_entries/${LOG}/links`, {linkable: 'Errors::Group:eg-1'})
    expect(stdout).toContain('Linked log')
  })

  it('links to a ticket target', async () => {
    apiMock.post.mockResolvedValue(envelope({id: LINK}))
    await runCaptured(LogsLink, [LOG, '--to', 'Ticketing::Ticket:tk-1'])
    expect(apiMock.post).toHaveBeenCalledWith(`/cli/v1/log_entries/${LOG}/links`, {linkable: 'Ticketing::Ticket:tk-1'})
  })
})

describe('logs unlink', () => {
  it('refuses without --confirm (exit 2, no api call)', async () => {
    const {message} = await runExpectingExit(LogsUnlink, [LOG, LINK], 2)
    expect(message).toContain('Refusing to delete')
    expect(apiMock.delete).not.toHaveBeenCalled()
  })

  it('deletes the link with --confirm', async () => {
    apiMock.delete.mockResolvedValue(envelope({}))
    const {result, stdout} = await runCaptured(LogsUnlink, [LOG, LINK, '--confirm'])
    expect(apiMock.delete).toHaveBeenCalledWith(`/cli/v1/log_entries/${LOG}/links/${LINK}`)
    expect(stdout).toContain(`Removed link ${LINK}`)
    expect((result as {deleted: string}).deleted).toBe(LINK)
  })
})
