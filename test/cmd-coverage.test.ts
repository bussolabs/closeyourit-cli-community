import {beforeEach, describe, expect, it, vi} from 'vitest'
import {apiMock, resetApiMock} from './helpers/api-mock'
import {PID, envelope, runCaptured} from './helpers/command'

vi.mock('../src/lib/api', async (io) => {
  const actual = await io<typeof import('../src/lib/api')>()
  const {apiMock} = await import('./helpers/api-mock')
  return {...actual, CliApi: vi.fn(function () { return apiMock })}
})
vi.mock('../src/lib/config', async (io) => {
  const actual = await io<typeof import('../src/lib/config')>()
  return {...actual, loadConfig: vi.fn(() => ({apiUrl: 'https://api.test', token: 'tok_test'}))}
})

import CoverageShow from '../src/commands/coverage/show'

beforeEach(() => resetApiMock())

// CYSK-26 — the coverage extract published by CI is read back from the command line.
describe('coverage show', () => {
  it('shows the extracts of a project (one line per branch)', async () => {
    apiMock.get.mockResolvedValue(
      envelope([{branch: 'main', sha: 'abc1234', line_covered_percent: '98.78', branch_covered_percent: '89.99', files_count: 812, never_loaded_count: 14}]),
    )
    const {stdout} = await runCaptured(CoverageShow, ['--project', PID])
    expect(apiMock.get).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/coverage`)
    expect(stdout).toContain('main')
    expect(stdout).toContain('98.78')
    expect(stdout).toContain('never_loaded 14')
  })

  it('forwards --branch', async () => {
    apiMock.get.mockResolvedValue(envelope([]))
    const {stdout} = await runCaptured(CoverageShow, ['--project', PID, '--branch', 'main'])
    expect(apiMock.get).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/coverage?branch=main`)
    expect(stdout).toContain('No coverage extract published yet')
  })
})
