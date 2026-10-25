import {beforeEach, describe, expect, it, vi} from 'vitest'
import {apiMock, resetApiMock} from './helpers/api-mock'
import {MID, PID, apiError, envelope, run, runCaptured, runExpectingExit} from './helpers/command'

vi.mock('../src/lib/api', async (io) => {
  const actual = await io<typeof import('../src/lib/api')>()
  const {apiMock} = await import('./helpers/api-mock')
  return {...actual, CliApi: vi.fn(function () { return apiMock })}
})
vi.mock('../src/lib/config', async (io) => {
  const actual = await io<typeof import('../src/lib/config')>()
  return {...actual, loadConfig: vi.fn(() => ({apiUrl: 'https://api.test', token: 'tok_test'}))}
})

import SharedDelete from '../src/commands/shared/delete'
import SharedList from '../src/commands/shared/list'
import SharedSet from '../src/commands/shared/set'

// ORG-LEVEL endpoint: no /projects/:id in the path — the shared vault belongs
// to the organization and is delegated to projects, it is not born inside one of them.
const base = '/cli/v1/shared_secrets'

beforeEach(() => resetApiMock())

describe('shared set', () => {
  it('sends name, environment and value from NAME=VALUE to the org-level endpoint', async () => {
    apiMock.post.mockResolvedValue(envelope({name: 'API_KEY'}))
    const {stdout} = await runCaptured(SharedSet, ['API_KEY=s3cr3t', '-e', 'production'])
    // Exact payload: proves a project_id is NEVER sent.
    expect(apiMock.post).toHaveBeenCalledWith(base, {
      environment: 'production',
      name: 'API_KEY',
      value: 's3cr3t',
      description: undefined,
    })
    expect(stdout).toContain('saved')
    expect(stdout).toContain('production')
    // Scenario 1: the value is never printed.
    expect(stdout).not.toContain('s3cr3t')
  })

  it('accepts the value from --value when the arg is only the name', async () => {
    apiMock.post.mockResolvedValue(envelope({name: 'API_KEY'}))
    await runCaptured(SharedSet, ['API_KEY', '-e', 'staging', '--value', 's3cr3t', '--description', 'Stripe'])
    expect(apiMock.post).toHaveBeenCalledWith(base, {
      environment: 'staging',
      name: 'API_KEY',
      value: 's3cr3t',
      description: 'Stripe',
    })
  })

  it('accepts an explicit empty string (NAME=) without mistaking it for a missing value', async () => {
    apiMock.post.mockResolvedValue(envelope({name: 'OPTIONAL'}))
    await runCaptured(SharedSet, ['OPTIONAL=', '-e', 'production'])
    expect(apiMock.post).toHaveBeenCalledWith(base, expect.objectContaining({name: 'OPTIONAL', value: ''}))
  })

  it('without a value exits non-zero, before the call', async () => {
    const {message} = await runExpectingExit(SharedSet, ['API_KEY', '-e', 'production'])
    expect(message).toContain('value')
    expect(apiMock.post).not.toHaveBeenCalled()
  })

  it('requires --environment (a shared variable has one value per environment)', async () => {
    await expect(run(SharedSet, ['API_KEY=1'])).rejects.toThrow(/environment/i)
  })

  it('rejects the project flag -p (the shared vault is not project-scoped)', async () => {
    await expect(run(SharedSet, ['API_KEY=1', '-e', 'production', '-p', PID])).rejects.toThrow(/flag/i)
  })

  it('nonexistent environment → the server message arrives whole on stderr', async () => {
    apiMock.post.mockRejectedValue(
      apiError(422, 'R422-SHARED-001', 'environment richiesto o inesistente nell\'organizzazione'),
    )
    const {stderr} = await runExpectingExit(SharedSet, ['API_KEY=1', '-e', 'nope'])
    expect(stderr).toContain('R422-SHARED-001')
    expect(stderr).toContain('inesistente nell\'organizzazione')
  })

  it('missing permission → the server code arrives on stderr', async () => {
    apiMock.post.mockRejectedValue(apiError(403, 'R403-CLIAUTH-002', 'forbidden'))
    const {stderr} = await runExpectingExit(SharedSet, ['API_KEY=1', '-e', 'production'])
    expect(stderr).toContain('R403-CLIAUTH-002')
  })
})

describe('shared list', () => {
  it('lists name and metadata, never the values', async () => {
    apiMock.get.mockResolvedValue(
      envelope([{id: MID, name: 'API_KEY', description: 'Stripe', updated_at: '2026-08-21T10:00:00Z'}]),
    )
    const {stdout} = await runCaptured(SharedList, [])
    expect(apiMock.get).toHaveBeenCalledWith(`${base}?page=1&per=100`)
    expect(stdout).toContain('API_KEY')
    expect(stdout).toContain('Stripe')
    expect(stdout).toContain('2026-08-21')
    expect(stdout).not.toContain('s3cr3t')
  })

  it('aggregates all the pages, not just the first', async () => {
    apiMock.get
      .mockResolvedValueOnce(envelope([{name: 'ALPHA'}], {total_pages: 2}))
      .mockResolvedValueOnce(envelope([{name: 'BETA'}], {total_pages: 2}))
    const {stdout} = await runCaptured(SharedList, [])
    expect(apiMock.get).toHaveBeenNthCalledWith(1, `${base}?page=1&per=100`)
    expect(apiMock.get).toHaveBeenNthCalledWith(2, `${base}?page=2&per=100`)
    expect(stdout).toContain('ALPHA')
    expect(stdout).toContain('BETA')
  })

  it('shows the ENVIRONMENTS column when the server says which environments the variable lives on', async () => {
    apiMock.get.mockResolvedValue(
      envelope([
        // Sparse entries (null, object without code) dropped instead of printing empty commas.
        {name: 'API_KEY', environments: [{code: 'production'}, 'staging', null, {}]},
        {name: 'ONLY_META'},
      ]),
    )
    const {stdout} = await runCaptured(SharedList, [])
    expect(stdout).toContain('ENVIRONMENTS')
    expect(stdout).toContain('production, staging')
    expect(stdout).not.toContain('production, staging,')
  })

  it('without environments in the payload does not print an always-empty column', async () => {
    apiMock.get.mockResolvedValue(envelope([{name: 'API_KEY', description: 'Stripe'}]))
    const {stdout} = await runCaptured(SharedList, [])
    expect(stdout).not.toContain('ENVIRONMENTS')
    expect(stdout).toContain('API_KEY')
  })

  it('declares no project flag', () => {
    expect(SharedList.flags).toBeUndefined()
  })

  it('missing permission → the server code arrives on stderr', async () => {
    apiMock.get.mockRejectedValue(apiError(403, 'R403-CLIAUTH-002', 'forbidden'))
    const {stderr} = await runExpectingExit(SharedList, [])
    expect(stderr).toContain('R403-CLIAUTH-002')
  })
})

describe('shared delete', () => {
  it('without --confirm rejects and states that the effect is on every environment', async () => {
    const {message} = await runExpectingExit(SharedDelete, ['API_KEY'], 2)
    expect(message).toContain('--confirm')
    expect(message).toMatch(/every environment/i)
    expect(apiMock.delete).not.toHaveBeenCalled()
  })

  it('with --confirm deletes by name (upcased) and says so for every environment', async () => {
    apiMock.delete.mockResolvedValue(envelope({}))
    const {stdout} = await runCaptured(SharedDelete, ['api_key', '--confirm'])
    expect(apiMock.delete).toHaveBeenCalledWith(`${base}/API_KEY`)
    expect(stdout).toContain('API_KEY')
    expect(stdout).toMatch(/every environment/i)
  })

  it('an id passes as is, without upcase (the server accepts UUID or name)', async () => {
    apiMock.delete.mockResolvedValue(envelope({}))
    await runCaptured(SharedDelete, [MID, '--confirm'])
    expect(apiMock.delete).toHaveBeenCalledWith(`${base}/${MID}`)
  })

  it('nonexistent variable → the server code arrives on stderr', async () => {
    apiMock.delete.mockRejectedValue(apiError(404, 'R404-GEN-001', 'not found'))
    const {stderr} = await runExpectingExit(SharedDelete, ['MISSING', '--confirm'])
    expect(stderr).toContain('R404-GEN-001')
  })
})

// Coverage of the machine branches: `--json` exercises the else side of `if (!this.jsonEnabled())`,
// while the null envelope (`{data: undefined}`) exercises the `?? ''` / `?? []` fallbacks.
describe('shared in --json mode and with a null envelope', () => {
  it('list --json returns data + aggregated meta and prints no tables', async () => {
    apiMock.get.mockResolvedValue(envelope([{name: 'API_KEY'}]))
    const {result, stdout} = await runCaptured(SharedList, ['--json'])
    expect(result).toEqual({data: [{name: 'API_KEY'}], meta: {page: 1, per: 1, total: 1, total_pages: 1}})
    expect(stdout).not.toContain('NAME')

    apiMock.get.mockResolvedValue({data: undefined})
    const {result: empty} = await runCaptured(SharedList, ['--json'])
    expect(empty).toEqual({data: [], meta: {page: 1, per: 0, total: 0, total_pages: 1}})

    // Sparse row: missing name/description/date exercise the `?? ''` fallbacks.
    apiMock.get.mockResolvedValue(envelope([{}]))
    await expect(runCaptured(SharedList, [])).resolves.toBeTruthy()
  })

  it('set --json returns the envelope without printing the confirmation', async () => {
    apiMock.post.mockResolvedValue(envelope({name: 'API_KEY'}))
    const {result, stdout} = await runCaptured(SharedSet, ['API_KEY=s3cr3t', '-e', 'production', '--json'])
    expect((result as {data: unknown}).data).toEqual({name: 'API_KEY'})
    // Only the JSON envelope: no human confirmation line in the middle of the machine output.
    expect(stdout).not.toContain('saved')
  })

  it('delete --json returns the deleted reference', async () => {
    apiMock.delete.mockResolvedValue(envelope({}))
    const {result, stdout} = await runCaptured(SharedDelete, ['api_key', '--confirm', '--json'])
    expect(result).toEqual({deleted: 'API_KEY', environments: 'all'})
    expect(stdout).not.toContain('deleted from every environment')
  })
})
