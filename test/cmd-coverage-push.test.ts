import {mkdtempSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import {apiMock, resetApiMock} from './helpers/api-mock'
import {PID, envelope, runCaptured, runExpectingExit} from './helpers/command'

vi.mock('../src/lib/api', async (io) => {
  const actual = await io<typeof import('../src/lib/api')>()
  const {apiMock} = await import('./helpers/api-mock')
  return {...actual, CliApi: vi.fn(function () { return apiMock })}
})
vi.mock('../src/lib/config', async (io) => {
  const actual = await io<typeof import('../src/lib/config')>()
  return {...actual, loadConfig: vi.fn(() => ({apiUrl: 'https://api.test', token: 'tok_ingest'}))}
})

import CoveragePush from '../src/commands/coverage/push'

beforeEach(() => resetApiMock())

function writeResultset(dir: string, name: string, lines: Array<number | null>): string {
  const path = join(dir, name)
  writeFileSync(path, JSON.stringify({[name]: {coverage: {[join(dir, 'a.rb')]: {lines}}, timestamp: 1}}))
  return path
}

// CYCL-78 — a customer CI sends its SimpleCov coverage with the project ingest token.
describe('coverage push', () => {
  it('merges the parallel parts and posts one extract to the ingest endpoint', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cov-'))
    const part1 = writeResultset(dir, 'part1.json', [1, 0])
    const part2 = writeResultset(dir, 'part2.json', [0, 1])
    apiMock.post.mockResolvedValue(envelope({branch: 'main', line_covered_percent: '100.0'}))

    const {stdout} = await runCaptured(CoveragePush, [
      '--project', PID, '--file', part1, '--file', part2, '--branch', 'main', '--sha', 'abc123', '--root', dir,
    ])

    expect(apiMock.post).toHaveBeenCalledTimes(1)
    const [path, body] = apiMock.post.mock.calls[0]
    expect(path).toBe(`/api/v1/projects/${PID}/coverage`)
    expect(body).toMatchObject({branch: 'main', sha: 'abc123', line_covered_percent: 100, files_count: 1})
    expect(stdout).toContain('main')
  })

  it('fails with a clear message when the resultset file is missing', async () => {
    const failure = await runExpectingExit(CoveragePush, ['--project', PID, '--file', '/nope/.resultset.json', '--branch', 'main'], 2)

    expect(failure.message).toContain('/nope/.resultset.json')
    expect(apiMock.post).not.toHaveBeenCalled()
  })
})
