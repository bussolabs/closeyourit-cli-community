import {beforeEach, describe, expect, it, vi} from 'vitest'
import {apiMock, resetApiMock} from './helpers/api-mock'
import {PID, envelope, runExpectingExit} from './helpers/command'

vi.mock('../src/lib/api', async (io) => {
  const actual = await io<typeof import('../src/lib/api')>()
  const {apiMock} = await import('./helpers/api-mock')
  return {...actual, CliApi: vi.fn(function () { return apiMock })}
})
vi.mock('../src/lib/config', async (io) => {
  const actual = await io<typeof import('../src/lib/config')>()
  return {...actual, loadConfig: vi.fn(() => ({apiUrl: 'https://api.test', token: 'tok_test'}))}
})
vi.mock('../src/lib/subprocess', () => ({runCommand: vi.fn()}))

import {runCommand} from '../src/lib/subprocess'
import Run from '../src/commands/run'

beforeEach(() => resetApiMock())

describe('run', () => {
  it('downloads the bundle and runs the command with the secrets in the env, propagating exit 0', async () => {
    apiMock.get.mockResolvedValue(envelope({DATABASE_URL: 'postgres://x'}))
    vi.mocked(runCommand).mockResolvedValue(0)

    await runExpectingExit(Run, ['-p', PID, '-e', 'production', '--', 'printenv', 'DATABASE_URL'], 0)

    expect(apiMock.get).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/secrets/bundle?environment=production`)
    expect(vi.mocked(runCommand)).toHaveBeenCalledWith(
      'printenv',
      ['DATABASE_URL'],
      expect.objectContaining({DATABASE_URL: 'postgres://x'}),
    )
  })

  it('propagates the child\'s non-zero exit code', async () => {
    apiMock.get.mockResolvedValue(envelope({}))
    vi.mocked(runCommand).mockResolvedValue(2)

    await runExpectingExit(Run, ['-p', PID, '-e', 'production', '--', 'false'], 2)
  })

  it('without a command after -- exits non-zero', async () => {
    const {message} = await runExpectingExit(Run, ['-p', PID, '-e', 'production'])
    expect(message).toContain('command to run')
  })

  it('skips secrets named like protected system variables and warns on stderr (CYCL-74)', async () => {
    apiMock.get.mockResolvedValue(envelope({NODE_OPTIONS: '--require evil', PATH: '/evil', DATABASE_URL: 'postgres://x'}))
    vi.mocked(runCommand).mockReset().mockResolvedValue(0)

    const {stderr} = await runExpectingExit(Run, ['-p', PID, '-e', 'production', '--', 'printenv'], 0)

    const passedEnv = vi.mocked(runCommand).mock.lastCall![2]
    expect(passedEnv.NODE_OPTIONS).toBe(process.env.NODE_OPTIONS)
    expect(passedEnv.PATH).toBe(process.env.PATH)
    expect(passedEnv.DATABASE_URL).toBe('postgres://x')
    expect(stderr).toContain('NODE_OPTIONS')
    expect(stderr).toContain('PATH')
    expect(stderr).not.toContain('/evil')
  })
})

describe('run: arguments after --', () => {
  beforeEach(() => {
    apiMock.get.mockResolvedValue(envelope({}))
    vi.mocked(runCommand).mockReset().mockResolvedValue(0)
  })

  it('passes through untouched a -p that belongs to the child command (CYCL-63)', async () => {
    await runExpectingExit(Run, ['-p', PID, '-e', 'development', '--', 'echo', '-p', '3021'], 0)

    expect(vi.mocked(runCommand)).toHaveBeenCalledWith('echo', ['-p', '3021'], expect.anything())
  })

  it('passes through untouched the child command\'s -p and -e, in the written order', async () => {
    await runExpectingExit(
      Run,
      ['-p', PID, '-e', 'development', '--', 'bin/rails', 'server', '-p', '3021', '-e', 'test'],
      0,
    )

    expect(vi.mocked(runCommand)).toHaveBeenCalledWith(
      'bin/rails',
      ['server', '-p', '3021', '-e', 'test'],
      expect.anything(),
    )
  })

  it('leaves a second -- to the child as well', async () => {
    await runExpectingExit(Run, ['-p', PID, '-e', 'development', '--', 'pnpm', 'test', '--', '--coverage'], 0)

    expect(vi.mocked(runCommand)).toHaveBeenCalledWith('pnpm', ['test', '--', '--coverage'], expect.anything())
  })

  it('with -- but no command after it exits non-zero', async () => {
    const {message} = await runExpectingExit(Run, ['-p', PID, '-e', 'development', '--'])
    expect(message).toContain('command to run')
  })
})
