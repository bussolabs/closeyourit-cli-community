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

import ReleasesList from '../src/commands/releases/list'

beforeEach(() => resetApiMock())

describe('releases list', () => {
  it('lists the releases of a project (default page)', async () => {
    apiMock.get.mockResolvedValue(
      envelope([{id: 'r1', version: 'v1.2.3', environment: 'production', sha: 'abc123', events_count: 5}], {total: 1}),
    )
    const {result, stdout} = await runCaptured(ReleasesList, ['--project', PID])
    expect(apiMock.get).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/releases?page=1`)
    expect(stdout).toContain('v1.2.3')
    expect((result as {data: unknown[]}).data).toHaveLength(1)
  })

  it('honours --page', async () => {
    apiMock.get.mockResolvedValue(envelope([]))
    await runCaptured(ReleasesList, ['--project', PID, '--page', '2'])
    expect(apiMock.get).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/releases?page=2`)
  })

  it('requires --project (usage error)', async () => {
    const {message} = await runExpectingExit(ReleasesList, [], 2)
    expect(message).toContain('project')
    expect(apiMock.get).not.toHaveBeenCalled()
  })

  it('prints JSON and skips the human table with --json', async () => {
    apiMock.get.mockResolvedValue(envelope([{id: 'r1', version: 'v1.0.0'}]))
    const {stdout} = await runCaptured(ReleasesList, ['--project', PID, '--json'])
    expect(stdout).toContain('"data"')
  })

  it('tolerates a null envelope', async () => {
    apiMock.get.mockResolvedValue({data: undefined})
    await expect(runCaptured(ReleasesList, ['--project', PID])).resolves.toBeTruthy()
  })

  it('exits non-zero on an API error', async () => {
    apiMock.get.mockRejectedValue(apiError(404, 'R404-PROJECT-001', 'not found'))
    const {stderr} = await runExpectingExit(ReleasesList, ['--project', PID])
    expect(stderr).toContain('R404-PROJECT-001')
  })
})
