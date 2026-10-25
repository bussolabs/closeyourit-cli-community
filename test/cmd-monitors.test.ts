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

import MonitorsAnnouncementsClear from '../src/commands/monitors/announcements/clear'
import MonitorsAnnouncementsSet from '../src/commands/monitors/announcements/set'
import MonitorsAnnouncementsShow from '../src/commands/monitors/announcements/show'
import MonitorsCreate from '../src/commands/monitors/create'
import MonitorsDelete from '../src/commands/monitors/delete'
import MonitorsIncidentsDelete from '../src/commands/monitors/incidents/delete'
import MonitorsIncidentsGroup from '../src/commands/monitors/incidents/group'
import MonitorsIncidentsUngroup from '../src/commands/monitors/incidents/ungroup'
import MonitorsIncidentsUpdateAdd from '../src/commands/monitors/incidents/update-add'
import MonitorsIncidentsUpdateDelete from '../src/commands/monitors/incidents/update-delete'
import MonitorsList from '../src/commands/monitors/list'
import MonitorsPause from '../src/commands/monitors/pause'
import MonitorsPublish from '../src/commands/monitors/publish'
import MonitorsResume from '../src/commands/monitors/resume'
import MonitorsShow from '../src/commands/monitors/show'
import MonitorsUnpublish from '../src/commands/monitors/unpublish'
import MonitorsUpdate from '../src/commands/monitors/update'

const M = 'mon-1'
const INC = 'inc-1'
const UPD = 'upd-1'

beforeEach(() => resetApiMock())

describe('monitors — full flag coverage', () => {
  it('create maps every optional flag (all set)', async () => {
    apiMock.post.mockResolvedValue(envelope({id: M}))
    await runCaptured(MonitorsCreate, [
      '--project', PID, '--url', 'https://a/up', '--environment', 'env-1',
      '--http-method', 'HEAD', '--interval-seconds', '60', '--expected-status', '204', '--timeout-seconds', '10',
      '--expected-body-keyword', 'healthy', '--ssl-expiry-warn-days', '14',
    ])
    expect(apiMock.post).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/monitors`, {
      url: 'https://a/up', environment_id: 'env-1', http_method: 'HEAD',
      interval_seconds: 60, expected_status: 204, timeout_seconds: 10,
      expected_body_keyword: 'healthy', ssl_expiry_warn_days: 14,
    })
  })

  it('update maps every optional flag (all set)', async () => {
    apiMock.put.mockResolvedValue(envelope({id: M}))
    await runCaptured(MonitorsUpdate, [
      M, '--project', PID, '--url', 'https://a/health', '--http-method', 'GET',
      '--interval-seconds', '120', '--expected-status', '200', '--timeout-seconds', '5',
      '--expected-body-keyword', 'ok', '--ssl-expiry-warn-days', '7',
    ])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/monitors/${M}`, {
      url: 'https://a/health', http_method: 'GET', interval_seconds: 120, expected_status: 200, timeout_seconds: 5,
      expected_body_keyword: 'ok', ssl_expiry_warn_days: 7,
    })
  })
})

describe('monitors list / show', () => {
  it('lists monitors', async () => {
    apiMock.get.mockResolvedValue(envelope([{name: 'API', url: 'https://a/up', current_status: 'up', active: true, id: M}]))
    const {stdout} = await runCaptured(MonitorsList, ['--project', PID])
    expect(apiMock.get).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/monitors?page=1`)
    expect(stdout).toContain('https://a/up')
  })

  it('shows one monitor', async () => {
    apiMock.get.mockResolvedValue(envelope({id: M, name: 'API'}))
    const {stdout} = await runCaptured(MonitorsShow, [M, '--project', PID])
    expect(apiMock.get).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/monitors/${M}`)
    expect(stdout).toContain('API')
  })

  it('exits non-zero on an API error', async () => {
    apiMock.get.mockRejectedValue(apiError(404, 'R404-MON-001', 'no such project'))
    const {stderr} = await runExpectingExit(MonitorsList, ['--project', PID])
    expect(stderr).toContain('R404-MON-001')
  })
})

describe('monitors create', () => {
  it('posts the url and only the provided optional fields', async () => {
    apiMock.post.mockResolvedValue(envelope({id: M}))
    await runCaptured(MonitorsCreate, [
      '--project', PID, '--url', 'https://a/up', '--environment', 'env-1',
      '--interval-seconds', '60', '--expected-status', '200',
    ])
    expect(apiMock.post).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/monitors`, {
      url: 'https://a/up',
      environment_id: 'env-1',
      interval_seconds: 60,
      expected_status: 200,
    })
  })

  it('posts just the url when no optional flags are given', async () => {
    apiMock.post.mockResolvedValue(envelope({id: M}))
    const {stdout} = await runCaptured(MonitorsCreate, ['--project', PID, '--url', 'https://a/up'])
    expect(apiMock.post).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/monitors`, {url: 'https://a/up'})
    expect(stdout).toContain('Monitor created')
  })
})

describe('monitors update', () => {
  it('sends only the changed fields', async () => {
    apiMock.put.mockResolvedValue(envelope({id: M}))
    await runCaptured(MonitorsUpdate, [M, '--project', PID, '--interval-seconds', '120'])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/monitors/${M}`, {interval_seconds: 120})
  })
})

describe('monitors pause / resume', () => {
  it('pause → PUT .../pause', async () => {
    apiMock.put.mockResolvedValue(envelope({id: M}))
    const {stdout} = await runCaptured(MonitorsPause, [M, '--project', PID])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/monitors/${M}/pause`)
    expect(stdout).toContain('Paused monitor')
  })

  it('resume → DELETE .../pause', async () => {
    apiMock.delete.mockResolvedValue(envelope({id: M}))
    const {stdout} = await runCaptured(MonitorsResume, [M, '--project', PID])
    expect(apiMock.delete).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/monitors/${M}/pause`)
    expect(stdout).toContain('Resumed monitor')
  })
})

describe('monitors delete', () => {
  it('refuses without --confirm', async () => {
    const {message} = await runExpectingExit(MonitorsDelete, [M, '--project', PID], 2)
    expect(message).toContain('Refusing to delete')
    expect(apiMock.delete).not.toHaveBeenCalled()
  })

  it('deletes with --confirm', async () => {
    apiMock.delete.mockResolvedValue(envelope({}))
    const {result} = await runCaptured(MonitorsDelete, [M, '--project', PID, '--confirm'])
    expect(apiMock.delete).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/monitors/${M}`)
    expect((result as {deleted: string}).deleted).toBe(M)
  })
})

describe('monitors create / update — group-id', () => {
  it('create includes group_id only when passed', async () => {
    apiMock.post.mockResolvedValue(envelope({id: M}))
    await runCaptured(MonitorsCreate, ['--project', PID, '--url', 'https://a/up', '--group-id', 'grp-1'])
    expect(apiMock.post).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/monitors`, {
      url: 'https://a/up',
      group_id: 'grp-1',
    })
  })

  it('update includes group_id only when passed', async () => {
    apiMock.put.mockResolvedValue(envelope({id: M}))
    await runCaptured(MonitorsUpdate, [M, '--project', PID, '--group-id', 'grp-9'])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/monitors/${M}`, {group_id: 'grp-9'})
  })
})

describe('monitors publish / unpublish', () => {
  it('publish → PUT .../publication', async () => {
    apiMock.put.mockResolvedValue(envelope({id: M}))
    const {stdout} = await runCaptured(MonitorsPublish, [M, '--project', PID])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/monitors/${M}/publication`)
    expect(stdout).toContain('Published status page')
  })

  it('unpublish → DELETE .../publication', async () => {
    apiMock.delete.mockResolvedValue(envelope({id: M}))
    const {stdout} = await runCaptured(MonitorsUnpublish, [M, '--project', PID])
    expect(apiMock.delete).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/monitors/${M}/publication`)
    expect(stdout).toContain('Unpublished status page')
  })
})

describe('monitors announcements', () => {
  it('show renders an existing announcement', async () => {
    apiMock.get.mockResolvedValue(envelope({level: 'maintenance', message: 'Upgrade'}))
    const {stdout} = await runCaptured(MonitorsAnnouncementsShow, [M, '--project', PID])
    expect(apiMock.get).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/monitors/${M}/announcement`)
    expect(stdout).toContain('maintenance')
  })

  it('show reports when there is no announcement (null)', async () => {
    apiMock.get.mockResolvedValue(envelope(null))
    const {stdout} = await runCaptured(MonitorsAnnouncementsShow, [M, '--project', PID])
    expect(stdout).toContain('No announcement set')
  })

  it('set maps every field (all set, --active)', async () => {
    apiMock.put.mockResolvedValue(envelope({id: 'ann-1'}))
    const {stdout} = await runCaptured(MonitorsAnnouncementsSet, [
      M, '--project', PID, '--level', 'warning', '--message', 'Degraded',
      '--starts-at', '2026-07-10T09:00:00Z', '--ends-at', '2026-07-10T11:00:00Z', '--active',
    ])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/monitors/${M}/announcement`, {
      level: 'warning',
      message: 'Degraded',
      starts_at: '2026-07-10T09:00:00Z',
      ends_at: '2026-07-10T11:00:00Z',
      active: true,
    })
    expect(stdout).toContain('Announcement saved')
  })

  it('set sends only the provided fields (--no-active)', async () => {
    apiMock.put.mockResolvedValue(envelope({id: 'ann-1'}))
    await runCaptured(MonitorsAnnouncementsSet, [M, '--project', PID, '--message', 'x', '--no-active'])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/monitors/${M}/announcement`, {
      message: 'x',
      active: false,
    })
  })

  it('clear refuses without --confirm', async () => {
    const {message} = await runExpectingExit(MonitorsAnnouncementsClear, [M, '--project', PID], 2)
    expect(message).toContain('Refusing to clear')
    expect(apiMock.delete).not.toHaveBeenCalled()
  })

  it('clear removes with --confirm', async () => {
    apiMock.delete.mockResolvedValue(envelope({}))
    const {result, stdout} = await runCaptured(MonitorsAnnouncementsClear, [M, '--project', PID, '--confirm'])
    expect(apiMock.delete).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/monitors/${M}/announcement`)
    expect(stdout).toContain('Cleared announcement')
    expect((result as {cleared: string}).cleared).toBe(M)
  })
})

describe('monitors incidents', () => {
  it('delete refuses without --confirm', async () => {
    const {message} = await runExpectingExit(MonitorsIncidentsDelete, [M, INC, '--project', PID], 2)
    expect(message).toContain('Refusing to delete')
    expect(apiMock.delete).not.toHaveBeenCalled()
  })

  it('delete removes an incident with --confirm', async () => {
    apiMock.delete.mockResolvedValue(envelope({}))
    const {result} = await runCaptured(MonitorsIncidentsDelete, [M, INC, '--project', PID, '--confirm'])
    expect(apiMock.delete).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/monitors/${M}/incidents/${INC}`)
    expect((result as {deleted: string}).deleted).toBe(INC)
  })

  it('group unifies incidents with phase + body', async () => {
    apiMock.post.mockResolvedValue(envelope({id: INC}))
    const {stdout} = await runCaptured(MonitorsIncidentsGroup, [
      M, '--project', PID, '--incident', 'inc-a', '--incident', 'inc-b', '--phase', 'investigating', '--body', 'Looking',
    ])
    expect(apiMock.post).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/monitors/${M}/incidents/group`, {
      incident_ids: ['inc-a', 'inc-b'],
      phase: 'investigating',
      body: 'Looking',
    })
    expect(stdout).toContain('Incidents grouped')
  })

  it('group omits body when not passed', async () => {
    apiMock.post.mockResolvedValue(envelope({id: INC}))
    await runCaptured(MonitorsIncidentsGroup, [M, '--project', PID, '--incident', 'inc-a', '--phase', 'detected'])
    expect(apiMock.post).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/monitors/${M}/incidents/group`, {
      incident_ids: ['inc-a'],
      phase: 'detected',
    })
  })

  it('ungroup sends keep_incident_id when --keep is passed', async () => {
    apiMock.delete.mockResolvedValue(envelope({}))
    const {result} = await runCaptured(MonitorsIncidentsUngroup, [M, INC, '--project', PID, '--keep', 'win-1'])
    expect(apiMock.delete).toHaveBeenCalledWith(
      `/cli/v1/projects/${PID}/monitors/${M}/incidents/${INC}/group`,
      {body: {keep_incident_id: 'win-1'}},
    )
    expect((result as {ungrouped: string}).ungrouped).toBe(INC)
  })

  it('ungroup sends an empty body without --keep', async () => {
    apiMock.delete.mockResolvedValue(envelope({}))
    await runCaptured(MonitorsIncidentsUngroup, [M, INC, '--project', PID])
    expect(apiMock.delete).toHaveBeenCalledWith(
      `/cli/v1/projects/${PID}/monitors/${M}/incidents/${INC}/group`,
      {body: {}},
    )
  })

  it('update-add posts a step with phase + body', async () => {
    apiMock.post.mockResolvedValue(envelope({id: UPD}))
    const {stdout} = await runCaptured(MonitorsIncidentsUpdateAdd, [
      M, INC, '--project', PID, '--phase', 'monitoring', '--body', 'Recovering',
    ])
    expect(apiMock.post).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/monitors/${M}/incidents/${INC}/updates`, {
      phase: 'monitoring',
      body: 'Recovering',
    })
    expect(stdout).toContain('Incident update added')
  })

  it('update-add omits body when not passed', async () => {
    apiMock.post.mockResolvedValue(envelope({id: UPD}))
    await runCaptured(MonitorsIncidentsUpdateAdd, [M, INC, '--project', PID, '--phase', 'resolved'])
    expect(apiMock.post).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/monitors/${M}/incidents/${INC}/updates`, {
      phase: 'resolved',
    })
  })

  it('update-delete refuses without --confirm', async () => {
    const {message} = await runExpectingExit(MonitorsIncidentsUpdateDelete, [M, INC, UPD, '--project', PID], 2)
    expect(message).toContain('Refusing to delete')
    expect(apiMock.delete).not.toHaveBeenCalled()
  })

  it('update-delete removes a step with --confirm', async () => {
    apiMock.delete.mockResolvedValue(envelope({}))
    const {result} = await runCaptured(MonitorsIncidentsUpdateDelete, [M, INC, UPD, '--project', PID, '--confirm'])
    expect(apiMock.delete).toHaveBeenCalledWith(
      `/cli/v1/projects/${PID}/monitors/${M}/incidents/${INC}/updates/${UPD}`,
    )
    expect((result as {deleted: string}).deleted).toBe(UPD)
  })
})
