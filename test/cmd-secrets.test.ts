import {beforeEach, describe, expect, it, vi} from 'vitest'
import {apiMock, resetApiMock} from './helpers/api-mock'
import {PID, apiError, envelope, run, runCaptured, runExpectingExit} from './helpers/command'

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

import {readFile} from 'node:fs/promises'
import {writePrivateFile} from '../src/lib/private-file'
import {readStream} from '../src/lib/stdin'
import SecretsDelete from '../src/commands/secrets/delete'
import SecretsDownload from '../src/commands/secrets/download'
import SecretsGet from '../src/commands/secrets/get'
import SecretsImport, {parseEnv, parseJson} from '../src/commands/secrets/import'
import SecretsList from '../src/commands/secrets/list'
import SecretsSet from '../src/commands/secrets/set'
import SecretsSync from '../src/commands/secrets/sync'

const base = `/cli/v1/projects/${PID}/secrets`

beforeEach(() => resetApiMock())

describe('secrets set', () => {
  it('sends environment, name and value from NAME=VALUE', async () => {
    apiMock.post.mockResolvedValue(envelope({name: 'DATABASE_URL'}))
    const {stdout} = await runCaptured(SecretsSet, ['DATABASE_URL=postgres://x', '-p', PID, '-e', 'production'])
    expect(apiMock.post).toHaveBeenCalledWith(base, expect.objectContaining({environment: 'production', name: 'DATABASE_URL', value: 'postgres://x'}))
    expect(stdout).toContain('saved')
  })

  it('accepts the value from --value when the arg is only the name', async () => {
    apiMock.post.mockResolvedValue(envelope({name: 'API_KEY'}))
    await runCaptured(SecretsSet, ['API_KEY', '-p', PID, '-e', 'production', '--value', 's3cr3t'])
    expect(apiMock.post).toHaveBeenCalledWith(base, expect.objectContaining({name: 'API_KEY', value: 's3cr3t'}))
  })

  it('warns when the same value exists in other projects, without naming them', async () => {
    apiMock.post.mockResolvedValue(envelope({name: 'STRIPE_KEY'}, {consolidation: {count: 2, url: '/member/vault/attention'}}))
    const {stdout} = await runCaptured(SecretsSet, ['STRIPE_KEY=sk_live_x', '-p', PID, '-e', 'production'])
    expect(stdout).toContain('saved')
    expect(stdout).toContain('used by 2 projects')
    expect(stdout).toContain('https://api.test/member/vault/attention')
  })

  it('prints no warning when meta carries no consolidation', async () => {
    apiMock.post.mockResolvedValue(envelope({name: 'STRIPE_KEY'}))
    const {stdout} = await runCaptured(SecretsSet, ['STRIPE_KEY=sk_live_x', '-p', PID, '-e', 'production'])
    expect(stdout).not.toContain('used by')
  })

  it('without a value exits non-zero', async () => {
    const {message} = await runExpectingExit(SecretsSet, ['API_KEY', '-p', PID, '-e', 'production'])
    expect(message).toContain('value')
  })

  it('propagates the API error with a non-zero exit', async () => {
    apiMock.post.mockRejectedValue(apiError(403, 'R403-CLIAUTH-002', 'forbidden'))
    const {stderr} = await runExpectingExit(SecretsSet, ['X=1', '-p', PID, '-e', 'production'])
    expect(stderr).toContain('R403-CLIAUTH-002')
  })
})

describe('secrets list', () => {
  it('lists the names without the value', async () => {
    apiMock.get.mockResolvedValue(envelope([{name: 'DATABASE_URL', environment: {code: 'production'}, description: 'db'}]))
    const {stdout} = await runCaptured(SecretsList, ['-p', PID])
    expect(apiMock.get).toHaveBeenCalledWith(`${base}?page=1&per=100`)
    expect(stdout).toContain('DATABASE_URL')
    expect(stdout).not.toContain('postgres')
  })

  it('filters by environment', async () => {
    apiMock.get.mockResolvedValue(envelope([]))
    await runCaptured(SecretsList, ['-p', PID, '-e', 'production'])
    expect(apiMock.get).toHaveBeenCalledWith(`${base}?environment=production&page=1&per=100`)
  })

  it('aggregates all the pages, not just the first', async () => {
    apiMock.get
      .mockResolvedValueOnce(envelope([{name: 'ALPHA'}], {total_pages: 2}))
      .mockResolvedValueOnce(envelope([{name: 'BETA'}], {total_pages: 2}))
    const {stdout} = await runCaptured(SecretsList, ['-p', PID])
    expect(apiMock.get).toHaveBeenNthCalledWith(1, `${base}?page=1&per=100`)
    expect(apiMock.get).toHaveBeenNthCalledWith(2, `${base}?page=2&per=100`)
    expect(stdout).toContain('ALPHA')
    expect(stdout).toContain('BETA')
  })

  it('with --all lists all the secrets of every page, none omitted (CYCL-5)', async () => {
    apiMock.get
      .mockResolvedValueOnce(envelope([{name: 'ALPHA'}], {total_pages: 2}))
      .mockResolvedValueOnce(envelope([{name: 'BETA'}], {total_pages: 2}))
    const {stdout} = await runCaptured(SecretsList, ['-p', PID, '--all'])
    expect(apiMock.get).toHaveBeenNthCalledWith(1, `${base}?page=1&per=100`)
    expect(apiMock.get).toHaveBeenNthCalledWith(2, `${base}?page=2&per=100`)
    expect(stdout).toContain('ALPHA')
    expect(stdout).toContain('BETA')
  })

  it('accepts the short alias -a', async () => {
    apiMock.get.mockResolvedValue(envelope([{name: 'ALPHA'}]))
    const {stdout} = await runCaptured(SecretsList, ['-p', PID, '-a'])
    expect(stdout).toContain('ALPHA')
  })

  it('--json keeps the envelope with a meta consistent with the aggregate of all pages', async () => {
    apiMock.get
      .mockResolvedValueOnce(envelope([{name: 'ALPHA'}], {page: 1, per: 100, total: 2, total_pages: 2}))
      .mockResolvedValueOnce(envelope([{name: 'BETA'}], {page: 2, per: 100, total: 2, total_pages: 2}))
    const result = (await run(SecretsList, ['-p', PID, '--json'])) as {data: unknown[]; meta: Record<string, number>}
    expect(result.data).toHaveLength(2)
    // the page 1 meta (total_pages: 2) would describe the aggregate wrongly: it must be a single page
    expect(result.meta).toEqual({page: 1, per: 2, total: 2, total_pages: 1})
  })
})

describe('secrets get', () => {
  it('prints the value of the requested secret', async () => {
    apiMock.get.mockResolvedValue(envelope({DATABASE_URL: 'postgres://x'}))
    const {stdout} = await runCaptured(SecretsGet, ['DATABASE_URL', '-p', PID, '-e', 'production'])
    expect(apiMock.get).toHaveBeenCalledWith(`${base}/bundle?environment=production`)
    expect(stdout).toContain('postgres://x')
  })

  it('nonexistent secret → non-zero exit', async () => {
    apiMock.get.mockResolvedValue(envelope({}))
    const {message} = await runExpectingExit(SecretsGet, ['MISSING', '-p', PID, '-e', 'production'])
    expect(message).toContain('not found')
  })
})

describe('secrets download', () => {
  it('env format on stdout', async () => {
    apiMock.get.mockResolvedValue(envelope({A: '1', B: '2'}))
    const {stdout} = await runCaptured(SecretsDownload, ['-p', PID, '-e', 'production'])
    expect(stdout).toContain('A=1')
    expect(stdout).toContain('B=2')
  })

  it('writes to a file and warns about the plaintext', async () => {
    apiMock.get.mockResolvedValue(envelope({A: '1'}))
    const {stdout} = await runCaptured(SecretsDownload, ['-p', PID, '-e', 'production', '--out', '.env'])
    expect(vi.mocked(writePrivateFile)).toHaveBeenCalledWith('.env', 'A=1\n')
    expect(stdout).toContain('.env')
  })

  it('json format', async () => {
    apiMock.get.mockResolvedValue(envelope({A: '1'}))
    const {stdout} = await runCaptured(SecretsDownload, ['-p', PID, '-e', 'production', '--format', 'json'])
    expect(stdout).toContain('"A": "1"')
  })
})

describe('secrets delete', () => {
  it('DELETE with upcased name and environment', async () => {
    apiMock.delete.mockResolvedValue(envelope({}))
    const {stdout} = await runCaptured(SecretsDelete, ['api_key', '-p', PID, '-e', 'production'])
    expect(apiMock.delete).toHaveBeenCalledWith(`${base}/API_KEY?environment=production`)
    expect(stdout).toContain('deleted')
  })
})

describe('secrets import', () => {
  it('imports from a .env file', async () => {
    vi.mocked(readFile).mockResolvedValue('# commento\nA=1\nB=2\n')
    apiMock.post.mockResolvedValue(envelope({imported: 2}))
    const {stdout} = await runCaptured(SecretsImport, ['-p', PID, '-e', 'production', '--from-file', '.env'])
    expect(apiMock.post).toHaveBeenCalledWith(`${base}/import`, {
      environment: 'production',
      variables: [{name: 'A', value: '1'}, {name: 'B', value: '2'}],
    })
    expect(stdout).toContain('Imported 2')
  })

  it('file without variables → non-zero exit', async () => {
    vi.mocked(readFile).mockResolvedValue('# solo commenti\n')
    const {message} = await runExpectingExit(SecretsImport, ['-p', PID, '-e', 'production', '--from-file', '.env'])
    expect(message).toContain('No variables')
  })

  it('imports from stdin when --from-file is absent', async () => {
    vi.mocked(readStream).mockResolvedValue('A=1\nB=2\n')
    apiMock.post.mockResolvedValue(envelope({imported: 2}))
    const {stdout} = await runCaptured(SecretsImport, ['-p', PID, '-e', 'production', '--format', 'env'])
    expect(apiMock.post).toHaveBeenCalledWith(`${base}/import`, {
      environment: 'production',
      variables: [{name: 'A', value: '1'}, {name: 'B', value: '2'}],
    })
    expect(stdout).toContain('Imported 2')
  })

  it('without --from-file and with a TTY stdin → explicit error', async () => {
    const original = process.stdin.isTTY
    Object.defineProperty(process.stdin, 'isTTY', {configurable: true, value: true})
    try {
      const {message} = await runExpectingExit(SecretsImport, ['-p', PID, '-e', 'production'])
      expect(message).toContain('stdin')
    } finally {
      Object.defineProperty(process.stdin, 'isTTY', {configurable: true, value: original})
    }
  })
})

describe('import parser', () => {
  it('parseEnv skips blanks/comments and splits on the first =', () => {
    expect(parseEnv('A=1\n\n# c\nB=x=y')).toEqual([{name: 'A', value: '1'}, {name: 'B', value: 'x=y'}])
  })

  it('parseJson accepts object and array', () => {
    expect(parseJson('{"A":"1"}')).toEqual([{name: 'A', value: '1'}])
    expect(parseJson('[{"name":"B","value":"2","description":"d"}]')).toEqual([{name: 'B', value: '2', description: 'd'}])
  })
})

describe('secrets sync', () => {
  it('POSTs sync and enqueues the push to GitHub', async () => {
    apiMock.post.mockResolvedValue(envelope({enqueued: true}))
    const {stdout} = await runCaptured(SecretsSync, ['-p', PID])
    expect(apiMock.post).toHaveBeenCalledWith(`${base}/sync`)
    expect(stdout).toContain('enqueued')
  })

  it('propagates the API error with a non-zero exit', async () => {
    apiMock.post.mockRejectedValue(apiError(403, 'R403-CLIAUTH-002', 'forbidden'))
    const {stderr} = await runExpectingExit(SecretsSync, ['-p', PID])
    expect(stderr).toContain('R403-CLIAUTH-002')
  })
})

describe('--yes (CYCL-53)', () => {
  it('sets the confirmation on the client before calling the server', async () => {
    apiMock.delete.mockResolvedValue(envelope({deleted: 'API_KEY'}))
    await run(SecretsDelete, ['API_KEY', '-p', PID, '-e', 'production', '--yes'])
    expect((apiMock as {confirm?: boolean}).confirm).toBe(true)
  })

  it('without --yes the confirmation stays off', async () => {
    apiMock.delete.mockResolvedValue(envelope({deleted: 'API_KEY'}))
    await run(SecretsDelete, ['API_KEY', '-p', PID, '-e', 'production'])
    expect((apiMock as {confirm?: boolean}).confirm).toBe(false)
  })
})
