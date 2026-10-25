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

import AnalyticsGoalsCreate from '../src/commands/analytics/goals/create'
import AnalyticsGoalsDelete from '../src/commands/analytics/goals/delete'
import AnalyticsGoalsList from '../src/commands/analytics/goals/list'
import AnalyticsShare from '../src/commands/analytics/share'
import AnalyticsShow from '../src/commands/analytics/show'
import AnalyticsUnshare from '../src/commands/analytics/unshare'

type Entry = [name: string, command: {run: typeof AnalyticsShow.run}, argv: string[]]

/** Commands whose human block renders `res.data` — exercised for the `--json` and null-envelope branches. */
const renderCommands: Entry[] = [
  ['show', AnalyticsShow, ['--project', PID]],
  ['goals list', AnalyticsGoalsList, ['--project', PID]],
  ['goals create', AnalyticsGoalsCreate, ['--project', PID, '--kind', 'custom_event', '--display-name', 'Signup', '--event-name', 'signup']],
  ['share', AnalyticsShare, ['--project', PID]],
]

function resolveAllWith(value: unknown): void {
  for (const method of ['get', 'post', 'put', 'delete'] as const) apiMock[method].mockResolvedValue(value)
}

beforeEach(() => resetApiMock())

describe('analytics show', () => {
  it('fetches the snapshot for a project (no filters)', async () => {
    apiMock.get.mockResolvedValue(envelope({summary: {pageviews: 100, visitors: 42}}))
    const {stdout} = await runCaptured(AnalyticsShow, ['--project', PID])
    expect(apiMock.get).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/analytics`)
    expect(stdout).toContain('pageviews')
  })

  it('forwards --range and --environment as query params', async () => {
    apiMock.get.mockResolvedValue(envelope({summary: {}}))
    await runCaptured(AnalyticsShow, ['--project', PID, '--range', '30d', '--environment', 'production'])
    expect(apiMock.get).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/analytics?range=30d&environment=production`)
  })

  it('rejects an invalid --range (usage error, no api call)', async () => {
    const {message} = await runExpectingExit(AnalyticsShow, ['--project', PID, '--range', 'nope'], 2)
    expect(message).toContain('range')
    expect(apiMock.get).not.toHaveBeenCalled()
  })

  it('exits non-zero on an API error', async () => {
    apiMock.get.mockRejectedValue(apiError(404, 'R404-ANALYTICS-001', 'not found'))
    const {stderr} = await runExpectingExit(AnalyticsShow, ['--project', PID])
    expect(stderr).toContain('R404-ANALYTICS-001')
  })
})

describe('analytics goals list', () => {
  it('lists the conversion goals', async () => {
    apiMock.get.mockResolvedValue(envelope([{id: 'g1', display_name: 'Signup', kind: 'custom_event', event_name: 'signup'}]))
    const {stdout} = await runCaptured(AnalyticsGoalsList, ['--project', PID])
    expect(apiMock.get).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/analytics/goals`)
    expect(stdout).toContain('Signup')
  })
})

describe('analytics goals create', () => {
  it('posts a custom_event goal (kind + display_name + event_name)', async () => {
    apiMock.post.mockResolvedValue(envelope({id: 'g1', display_name: 'Signup'}))
    const {stdout} = await runCaptured(AnalyticsGoalsCreate, [
      '--project', PID, '--kind', 'custom_event', '--display-name', 'Signup', '--event-name', 'signup',
    ])
    expect(apiMock.post).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/analytics/goals`, {
      kind: 'custom_event', display_name: 'Signup', event_name: 'signup',
    })
    expect(stdout).toContain('Goal created')
  })

  it('posts a pageview_path goal (kind + display_name + path_pattern)', async () => {
    apiMock.post.mockResolvedValue(envelope({id: 'g2', display_name: 'Pricing'}))
    await runCaptured(AnalyticsGoalsCreate, [
      '--project', PID, '--kind', 'pageview_path', '--display-name', 'Pricing', '--path-pattern', '/pricing',
    ])
    expect(apiMock.post).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/analytics/goals`, {
      kind: 'pageview_path', display_name: 'Pricing', path_pattern: '/pricing',
    })
  })

  it('requires --kind and --display-name (usage error)', async () => {
    const {message} = await runExpectingExit(AnalyticsGoalsCreate, ['--project', PID], 2)
    expect(message).toContain('kind')
    expect(apiMock.post).not.toHaveBeenCalled()
  })
})

describe('analytics goals delete', () => {
  it('refuses without --confirm (exit 2, no api call)', async () => {
    const {message} = await runExpectingExit(AnalyticsGoalsDelete, ['goal-1', '--project', PID], 2)
    expect(message).toContain('Refusing to delete')
    expect(apiMock.delete).not.toHaveBeenCalled()
  })

  it('deletes with --confirm', async () => {
    apiMock.delete.mockResolvedValue(envelope({}))
    const {result, stdout} = await runCaptured(AnalyticsGoalsDelete, ['goal-1', '--project', PID, '--confirm'])
    expect(apiMock.delete).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/analytics/goals/goal-1`)
    expect(stdout).toContain('Deleted goal goal-1')
    expect((result as {deleted: string}).deleted).toBe('goal-1')
  })

  it('skips the human line with --json', async () => {
    apiMock.delete.mockResolvedValue(envelope({}))
    const {stdout} = await runCaptured(AnalyticsGoalsDelete, ['goal-1', '--project', PID, '--confirm', '--json'])
    expect(stdout).toContain('"deleted"')
  })
})

describe('analytics share', () => {
  it('posts an empty body when no password is given', async () => {
    apiMock.post.mockResolvedValue(envelope({id: 'l1', slug: 'abc', active: true}))
    const {stdout} = await runCaptured(AnalyticsShare, ['--project', PID])
    expect(apiMock.post).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/analytics/share`, {})
    expect(stdout).toContain('shared')
  })

  it('forwards --password', async () => {
    apiMock.post.mockResolvedValue(envelope({id: 'l1', slug: 'abc', active: true}))
    await runCaptured(AnalyticsShare, ['--project', PID, '--password', 's3cret'])
    expect(apiMock.post).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/analytics/share`, {password: 's3cret'})
  })
})

describe('analytics unshare', () => {
  it('refuses without --confirm (exit 2, no api call)', async () => {
    const {message} = await runExpectingExit(AnalyticsUnshare, ['--project', PID], 2)
    expect(message).toContain('Refusing to unshare')
    expect(apiMock.delete).not.toHaveBeenCalled()
  })

  it('revokes the link with --confirm', async () => {
    apiMock.delete.mockResolvedValue(envelope({}))
    const {result, stdout} = await runCaptured(AnalyticsUnshare, ['--project', PID, '--confirm'])
    expect(apiMock.delete).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/analytics/share`)
    expect(stdout).toContain('Revoked')
    expect((result as {unshared: string}).unshared).toBe(PID)
  })

  it('skips the human line with --json', async () => {
    apiMock.delete.mockResolvedValue(envelope({}))
    const {stdout} = await runCaptured(AnalyticsUnshare, ['--project', PID, '--confirm', '--json'])
    expect(stdout).toContain('"unshared"')
  })
})

describe('analytics — json + null-envelope branches', () => {
  it.each(renderCommands)('%s --json returns the envelope', async (_name, command, argv) => {
    resolveAllWith(envelope({id: 'x', display_name: 'X'}))
    const {stdout} = await runCaptured(command, [...argv, '--json'])
    expect(stdout).toContain('"data"')
  })

  it.each(renderCommands)('%s tolerates a null envelope', async (_name, command, argv) => {
    resolveAllWith({data: undefined})
    await expect(runCaptured(command, argv)).resolves.toBeTruthy()
  })
})
