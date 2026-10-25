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

import MilestonesCreate from '../src/commands/milestones/create'
import MilestonesDelete from '../src/commands/milestones/delete'
import MilestonesList from '../src/commands/milestones/list'
import MilestonesShow from '../src/commands/milestones/show'
import MilestonesUpdate from '../src/commands/milestones/update'

const MS = 'ms-1'

beforeEach(() => resetApiMock())

describe('milestones — full flag coverage', () => {
  it('create maps color + active too', async () => {
    apiMock.post.mockResolvedValue(envelope({id: MS}))
    await runCaptured(MilestonesCreate, ['--project', PID, '--code', 'v2', '--label', 'V2', '--color', 'sky', '--due-on', '2027-01-01', '--no-active'])
    expect(apiMock.post).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/milestones`, {
      code: 'v2', label: 'V2', color: 'sky', due_on: '2027-01-01', active: false,
    })
  })

  it('update maps every optional flag (all set)', async () => {
    apiMock.put.mockResolvedValue(envelope({id: MS}))
    await runCaptured(MilestonesUpdate, [MS, '--project', PID, '--code', 'v2', '--label', 'V2', '--color', 'amber', '--due-on', '2027-02-01', '--active'])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/milestones/${MS}`, {
      code: 'v2', label: 'V2', color: 'amber', due_on: '2027-02-01', active: true,
    })
  })
})

describe('milestones list / show', () => {
  it('lists milestones', async () => {
    apiMock.get.mockResolvedValue(envelope([{code: 'v1', label: 'Version 1.0', due_on: '2026-12-31', active: true, id: MS}]))
    const {stdout} = await runCaptured(MilestonesList, ['--project', PID])
    expect(apiMock.get).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/milestones?page=1`)
    expect(stdout).toContain('Version 1.0')
  })

  it('show → fetches one milestone', async () => {
    apiMock.get.mockResolvedValue(envelope({id: MS, code: 'v1'}))
    const {stdout} = await runCaptured(MilestonesShow, [MS, '--project', PID])
    expect(apiMock.get).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/milestones/${MS}`)
    expect(stdout).toContain('v1')
  })

  it('exits non-zero on an API error', async () => {
    apiMock.get.mockRejectedValue(apiError(500, 'R500-SYS-001', 'boom'))
    const {stderr} = await runExpectingExit(MilestonesList, ['--project', PID])
    expect(stderr).toContain('R500-SYS-001')
  })
})

describe('milestones create / update / delete', () => {
  it('create → POST code + label (+ optional due_on)', async () => {
    apiMock.post.mockResolvedValue(envelope({id: MS}))
    await runCaptured(MilestonesCreate, ['--project', PID, '--code', 'v1', '--label', 'Version 1.0', '--due-on', '2026-12-31'])
    expect(apiMock.post).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/milestones`, {
      code: 'v1',
      label: 'Version 1.0',
      due_on: '2026-12-31',
    })
  })

  it('update → PUT only the changed fields', async () => {
    apiMock.put.mockResolvedValue(envelope({id: MS}))
    await runCaptured(MilestonesUpdate, [MS, '--project', PID, '--label', 'Version 1.1', '--no-active'])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/milestones/${MS}`, {label: 'Version 1.1', active: false})
  })

  it('delete → refuses without --confirm', async () => {
    const {message} = await runExpectingExit(MilestonesDelete, [MS, '--project', PID], 2)
    expect(message).toContain('Refusing to delete')
  })

  it('delete → deletes with --confirm', async () => {
    apiMock.delete.mockResolvedValue(envelope({}))
    const {result} = await runCaptured(MilestonesDelete, [MS, '--project', PID, '--confirm'])
    expect(apiMock.delete).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/milestones/${MS}`)
    expect((result as {deleted: string}).deleted).toBe(MS)
  })
})
