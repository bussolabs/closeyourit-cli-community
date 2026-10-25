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

import GuidanceShow from '../src/commands/guidance/show'

beforeEach(() => resetApiMock())

describe('guidance show', () => {
  it('queries the effective guidance of the project', async () => {
    apiMock.get.mockResolvedValue(envelope({references: [], procedures: []}))
    await runCaptured(GuidanceShow, ['--project', PID])
    expect(apiMock.get).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/guidance`)
  })

  it('renders references and procedures keeping the five attributes', async () => {
    apiMock.get.mockResolvedValue(
      envelope({
        references: [
          {key: 'global/git.md', origin: 'org', level: 'project', required: true, application_mode: 'always'},
        ],
        procedures: [
          {key: 'procedures/reset.md', origin: 'stack', level: 'global', required: false, application_mode: 'on_demand'},
        ],
      }),
    )
    const {stdout} = await runCaptured(GuidanceShow, ['--project', PID])
    expect(stdout).toContain('References')
    expect(stdout).toContain('Procedures')
    for (const header of ['KEY', 'ORIGIN', 'LEVEL', 'REQUIRED', 'APPLICATION_MODE']) {
      expect(stdout).toContain(header)
    }
    expect(stdout).toMatch(/global\/git\.md.*org.*project.*yes.*always/)
    expect(stdout).toMatch(/procedures\/reset\.md.*stack.*global.*no.*on_demand/)
  })

  it("renders a missing required as '-' without collapsing the column", async () => {
    apiMock.get.mockResolvedValue(envelope({references: [{key: 'k', origin: 'org', level: 'project'}], procedures: []}))
    const {stdout} = await runCaptured(GuidanceShow, ['--project', PID])
    expect(stdout).toMatch(/k.*org.*project.*-/)
  })

  it('tolerates entries with missing key/origin/level without breaking the table', async () => {
    apiMock.get.mockResolvedValue(envelope({references: [{application_mode: 'always'}], procedures: []}))
    const {stdout} = await runCaptured(GuidanceShow, ['--project', PID])
    expect(stdout).toContain('KEY')
    expect(stdout).toContain('always')
  })

  it('shows only the present section (procedures only, no References header)', async () => {
    apiMock.get.mockResolvedValue(
      envelope({procedures: [{key: 'p', origin: 'org', level: 'global', required: true, application_mode: 'always'}]}),
    )
    const {stdout} = await runCaptured(GuidanceShow, ['--project', PID])
    expect(stdout).toContain('Procedures')
    expect(stdout).not.toContain('References')
  })

  it('empty guidance: non-misleading message, no section', async () => {
    apiMock.get.mockResolvedValue(envelope({references: [], procedures: []}))
    const {stdout} = await runCaptured(GuidanceShow, ['--project', PID])
    expect(stdout).not.toContain('References')
    expect(stdout).not.toContain('Procedures')
    expect(stdout).toContain('No guidance')
  })

  it('--json returns the backend payload unchanged', async () => {
    apiMock.get.mockResolvedValue(
      envelope({references: [{key: 'r', required: true}], procedures: [{key: 'p', required: false}]}),
    )
    const {result} = await runCaptured(GuidanceShow, ['--project', PID, '--json'])
    const data = (result as {data: Record<string, unknown>}).data
    expect(data.references).toEqual([{key: 'r', required: true}])
    expect(data.procedures).toEqual([{key: 'p', required: false}])
  })

  it('exits non-zero on an API error', async () => {
    apiMock.get.mockRejectedValue(apiError(404, 'R404-PRJ-001', 'not found'))
    const {stderr} = await runExpectingExit(GuidanceShow, ['--project', PID])
    expect(stderr).toContain('R404-PRJ-001')
  })
})
