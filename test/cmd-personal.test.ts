import {beforeEach, describe, expect, it, vi} from 'vitest'
import {apiMock, resetApiMock} from './helpers/api-mock'
import {apiError, envelope, run, runCaptured, runExpectingExit} from './helpers/command'

vi.mock('../src/lib/api', async (io) => {
  const actual = await io<typeof import('../src/lib/api')>()
  const {apiMock} = await import('./helpers/api-mock')
  return {...actual, CliApi: vi.fn(function () { return apiMock })}
})
vi.mock('../src/lib/config', async (io) => {
  const actual = await io<typeof import('../src/lib/config')>()
  return {...actual, loadConfig: vi.fn(() => ({apiUrl: 'https://api.test', token: 'tok_test'}))}
})
vi.mock('node:fs/promises', () => ({readFile: vi.fn()}))
vi.mock('../src/lib/private-file', () => ({writePrivateFile: vi.fn()}))
vi.mock('../src/lib/stdin', () => ({readStream: vi.fn()}))
vi.mock('../src/lib/subprocess', () => ({runCommand: vi.fn()}))

import {readFile} from 'node:fs/promises'
import {writePrivateFile} from '../src/lib/private-file'
import {readStream} from '../src/lib/stdin'
import {runCommand} from '../src/lib/subprocess'
import PersonalDelete from '../src/commands/personal/delete'
import PersonalDownload from '../src/commands/personal/download'
import PersonalGet from '../src/commands/personal/get'
import PersonalImport from '../src/commands/personal/import'
import PersonalList from '../src/commands/personal/list'
import PersonalRun from '../src/commands/personal/run'
import PersonalSet from '../src/commands/personal/set'

// TOP-LEVEL endpoint: no /projects/:id, no ?environment= — the personal vault is flat and scoped to [account, organization].
const base = '/cli/v1/personal_secrets'

beforeEach(() => resetApiMock())

describe('personal set', () => {
  it('sends name and value from NAME=VALUE, without environment', async () => {
    apiMock.post.mockResolvedValue(envelope({name: 'DATABASE_URL'}))
    const {stdout} = await runCaptured(PersonalSet, ['DATABASE_URL=postgres://x'])
    // Exact payload: proves an environment field is NEVER sent.
    expect(apiMock.post).toHaveBeenCalledWith(base, {name: 'DATABASE_URL', value: 'postgres://x', description: undefined})
    expect(stdout).toContain('saved')
  })

  it('accepts the value from --value when the arg is only the name', async () => {
    apiMock.post.mockResolvedValue(envelope({name: 'API_KEY'}))
    await runCaptured(PersonalSet, ['API_KEY', '--value', 's3cr3t', '--description', 'Stripe'])
    expect(apiMock.post).toHaveBeenCalledWith(base, {name: 'API_KEY', value: 's3cr3t', description: 'Stripe'})
  })

  it('without a value exits non-zero', async () => {
    const {message} = await runExpectingExit(PersonalSet, ['API_KEY'])
    expect(message).toContain('value')
  })

  it('propagates the API error with a non-zero exit', async () => {
    apiMock.post.mockRejectedValue(apiError(403, 'R403-CLIAUTH-002', 'forbidden'))
    const {stderr} = await runExpectingExit(PersonalSet, ['X=1'])
    expect(stderr).toContain('R403-CLIAUTH-002')
  })

  it('rejects the project flags -p/-e (the personal vault is not project-scoped)', async () => {
    await expect(run(PersonalSet, ['X=1', '-p', 'acme'])).rejects.toThrow(/flag/i)
    await expect(run(PersonalSet, ['X=1', '-e', 'production'])).rejects.toThrow(/flag/i)
  })
})

describe('personal list', () => {
  it('lists the names without the value and without environment filter', async () => {
    apiMock.get.mockResolvedValue(envelope([{name: 'DATABASE_URL', description: 'db'}]))
    const {stdout} = await runCaptured(PersonalList, [])
    // No query string: always the bare endpoint (unlike `secrets list`, which filters by -e).
    expect(apiMock.get).toHaveBeenCalledWith(base)
    expect(stdout).toContain('DATABASE_URL')
    expect(stdout).toContain('db')
    expect(stdout).not.toContain('postgres')
  })

  it('declares no project flag', () => {
    // PersonalList has no `static flags`: no -p/-e to inherit.
    expect(PersonalList.flags).toBeUndefined()
  })
})

describe('personal get', () => {
  it('prints the value of the requested secret from the top-level bundle', async () => {
    apiMock.get.mockResolvedValue(envelope({DATABASE_URL: 'postgres://x'}))
    const {stdout} = await runCaptured(PersonalGet, ['DATABASE_URL'])
    // Bundle without ?environment=.
    expect(apiMock.get).toHaveBeenCalledWith(`${base}/bundle`)
    expect(stdout).toContain('postgres://x')
  })

  it('upcases the argument name', async () => {
    apiMock.get.mockResolvedValue(envelope({OPENAI_API_KEY: 'sk'}))
    const {result} = await runCaptured(PersonalGet, ['openai_api_key'])
    expect(result).toEqual({name: 'OPENAI_API_KEY', value: 'sk'})
  })

  it('nonexistent secret → non-zero exit', async () => {
    apiMock.get.mockResolvedValue(envelope({}))
    const {message} = await runExpectingExit(PersonalGet, ['MISSING'])
    expect(message).toContain('not found')
  })
})

describe('personal download', () => {
  it('env format on stdout', async () => {
    apiMock.get.mockResolvedValue(envelope({A: '1', B: '2'}))
    const {stdout} = await runCaptured(PersonalDownload, [])
    expect(apiMock.get).toHaveBeenCalledWith(`${base}/bundle`)
    expect(stdout).toContain('A=1')
    expect(stdout).toContain('B=2')
  })

  it('writes to a file and warns about the plaintext', async () => {
    apiMock.get.mockResolvedValue(envelope({A: '1'}))
    const {stdout} = await runCaptured(PersonalDownload, ['--out', '.env'])
    expect(vi.mocked(writePrivateFile)).toHaveBeenCalledWith('.env', 'A=1\n')
    expect(stdout).toContain('.env')
  })

  it('json format', async () => {
    apiMock.get.mockResolvedValue(envelope({A: '1'}))
    const {stdout} = await runCaptured(PersonalDownload, ['--format', 'json'])
    expect(stdout).toContain('"A": "1"')
  })
})

describe('personal delete', () => {
  it('DELETE with upcased name and without environment', async () => {
    apiMock.delete.mockResolvedValue(envelope({}))
    const {stdout} = await runCaptured(PersonalDelete, ['api_key'])
    // No ?environment= in the path (unlike `secrets delete`).
    expect(apiMock.delete).toHaveBeenCalledWith(`${base}/API_KEY`)
    expect(stdout).toContain('deleted')
  })
})

describe('personal import', () => {
  it('imports from a .env file to the top-level endpoint, without environment', async () => {
    vi.mocked(readFile).mockResolvedValue('# commento\nA=1\nB=2\n')
    apiMock.post.mockResolvedValue(envelope({imported: 2}))
    const {stdout} = await runCaptured(PersonalImport, ['--from-file', '.env'])
    expect(apiMock.post).toHaveBeenCalledWith(`${base}/import`, {
      variables: [{name: 'A', value: '1'}, {name: 'B', value: '2'}],
    })
    expect(stdout).toContain('Imported 2')
  })

  it('imports from JSON (roundtrip parser shared with secrets)', async () => {
    vi.mocked(readFile).mockResolvedValue('{"A":"1"}')
    apiMock.post.mockResolvedValue(envelope({imported: 1}))
    await runCaptured(PersonalImport, ['--from-file', 'secrets.json', '--format', 'json'])
    expect(apiMock.post).toHaveBeenCalledWith(`${base}/import`, {variables: [{name: 'A', value: '1'}]})
  })

  it('file without variables → non-zero exit', async () => {
    vi.mocked(readFile).mockResolvedValue('# solo commenti\n')
    const {message} = await runExpectingExit(PersonalImport, ['--from-file', '.env'])
    expect(message).toContain('No variables')
  })

  it('imports from stdin when --from-file is absent', async () => {
    vi.mocked(readStream).mockResolvedValue('A=1\nB=2\n')
    apiMock.post.mockResolvedValue(envelope({imported: 2}))
    const {stdout} = await runCaptured(PersonalImport, ['--format', 'env'])
    expect(apiMock.post).toHaveBeenCalledWith(`${base}/import`, {
      variables: [{name: 'A', value: '1'}, {name: 'B', value: '2'}],
    })
    expect(stdout).toContain('Imported 2')
  })

  it('without --from-file and with a TTY stdin → explicit error', async () => {
    const original = process.stdin.isTTY
    Object.defineProperty(process.stdin, 'isTTY', {configurable: true, value: true})
    try {
      const {message} = await runExpectingExit(PersonalImport, [])
      expect(message).toContain('stdin')
    } finally {
      Object.defineProperty(process.stdin, 'isTTY', {configurable: true, value: original})
    }
  })
})

describe('personal run', () => {
  it('downloads the top-level bundle and runs the command with the secrets in the env, propagating exit 0', async () => {
    apiMock.get.mockResolvedValue(envelope({OPENAI_API_KEY: 'sk-x'}))
    vi.mocked(runCommand).mockResolvedValue(0)

    await runExpectingExit(PersonalRun, ['--', 'printenv', 'OPENAI_API_KEY'], 0)

    expect(apiMock.get).toHaveBeenCalledWith(`${base}/bundle`)
    expect(vi.mocked(runCommand)).toHaveBeenCalledWith(
      'printenv',
      ['OPENAI_API_KEY'],
      expect.objectContaining({OPENAI_API_KEY: 'sk-x'}),
    )
  })

  it('keeps the process environment variables (merge, not replacement)', async () => {
    apiMock.get.mockResolvedValue(envelope({FOO: 'bar'}))
    vi.mocked(runCommand).mockResolvedValue(0)

    await runExpectingExit(PersonalRun, ['--', 'printenv'], 0)

    // The child receives both the personal vars and the current process PATH.
    // (runCommand is not reset between tests: read the last call, not the first.)
    const passedEnv = vi.mocked(runCommand).mock.lastCall![2]
    expect(passedEnv.FOO).toBe('bar')
    expect(passedEnv.PATH).toBe(process.env.PATH)
  })

  it('skips secrets named like protected system variables and warns on stderr (CYCL-74)', async () => {
    apiMock.get.mockResolvedValue(envelope({LD_PRELOAD: '/evil.so', OPENAI_API_KEY: 'sk-x'}))
    vi.mocked(runCommand).mockResolvedValue(0)

    const {stderr} = await runExpectingExit(PersonalRun, ['--', 'printenv'], 0)

    const passedEnv = vi.mocked(runCommand).mock.lastCall![2]
    expect(passedEnv).not.toHaveProperty('LD_PRELOAD')
    expect(passedEnv.OPENAI_API_KEY).toBe('sk-x')
    expect(stderr).toContain('LD_PRELOAD')
    expect(stderr).not.toContain('/evil.so')
  })

  it('propagates the child\'s non-zero exit code', async () => {
    apiMock.get.mockResolvedValue(envelope({}))
    vi.mocked(runCommand).mockResolvedValue(2)

    await runExpectingExit(PersonalRun, ['--', 'false'], 2)
  })

  it('without a command after -- exits non-zero', async () => {
    const {message} = await runExpectingExit(PersonalRun, [])
    expect(message).toContain('command to run')
  })
})

// Coverage of the machine branches: `--json` exercises the else side of `if (!this.jsonEnabled())`,
// while the null envelope (`{data: undefined}`) exercises the `?? {}` / `?? []` fallbacks.
describe('personal in --json mode and with a null envelope', () => {
  it('list --json returns the envelope and tolerates undefined data', async () => {
    apiMock.get.mockResolvedValue(envelope([{name: 'A', description: 'd'}]))
    const {result} = await runCaptured(PersonalList, ['--json'])
    expect((result as {data: unknown[]}).data).toHaveLength(1)

    apiMock.get.mockResolvedValue({data: undefined})
    await expect(runCaptured(PersonalList, [])).resolves.toBeTruthy()

    // Sparse row: missing name/description exercise the `?? ''` fallbacks.
    apiMock.get.mockResolvedValue(envelope([{}]))
    await expect(runCaptured(PersonalList, [])).resolves.toBeTruthy()
  })

  it('get --json returns name/value, and undefined data → not found', async () => {
    apiMock.get.mockResolvedValue(envelope({A: '1'}))
    const {result} = await runCaptured(PersonalGet, ['A', '--json'])
    expect(result).toEqual({name: 'A', value: '1'})

    apiMock.get.mockResolvedValue({data: undefined})
    const {message} = await runExpectingExit(PersonalGet, ['A'])
    expect(message).toContain('not found')
  })

  it('set --json returns the envelope', async () => {
    apiMock.post.mockResolvedValue(envelope({name: 'A'}))
    const {result} = await runCaptured(PersonalSet, ['A=1', '--json'])
    expect((result as {data: unknown}).data).toBeTruthy()
  })

  it('delete --json returns the deleted name', async () => {
    apiMock.delete.mockResolvedValue(envelope({}))
    const {result} = await runCaptured(PersonalDelete, ['a', '--json'])
    expect(result).toEqual({deleted: 'A'})
  })

  it('download --json to a file prints no warnings; on stdout it tolerates an empty bundle', async () => {
    apiMock.get.mockResolvedValue(envelope({A: '1'}))
    await runCaptured(PersonalDownload, ['--out', '.env', '--json'])
    expect(vi.mocked(writePrivateFile)).toHaveBeenCalledWith('.env', 'A=1\n')

    apiMock.get.mockResolvedValue({data: undefined})
    const {result} = await runCaptured(PersonalDownload, ['--json'])
    expect(result).toEqual({count: 0, format: 'env', out: null})
  })

  it('import --json returns the envelope and uses the count fallback on undefined data', async () => {
    vi.mocked(readFile).mockResolvedValue('A=1\n')
    apiMock.post.mockResolvedValue({data: undefined})
    const {stdout} = await runCaptured(PersonalImport, ['--from-file', '.env'])
    expect(stdout).toContain('Imported 1')
  })

  it('run tolerates a null bundle injecting only the process env', async () => {
    apiMock.get.mockResolvedValue({data: undefined})
    vi.mocked(runCommand).mockResolvedValue(0)
    await runExpectingExit(PersonalRun, ['--', 'printenv'], 0)
    const passedEnv = vi.mocked(runCommand).mock.lastCall![2]
    expect(passedEnv.PATH).toBe(process.env.PATH)
  })
})
