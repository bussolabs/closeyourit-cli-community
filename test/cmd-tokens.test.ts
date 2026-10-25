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

import TokensCreate from '../src/commands/tokens/create'
import TokensList from '../src/commands/tokens/list'
import TokensProvision from '../src/commands/tokens/provision'
import TokensProvisionsRetry from '../src/commands/tokens/provisions/retry'
import TokensProvisionsShow from '../src/commands/tokens/provisions/show'
import TokensRevoke from '../src/commands/tokens/revoke'
import TokensRotate from '../src/commands/tokens/rotate'

const TID = 'ing-1'

beforeEach(() => resetApiMock())

describe('tokens list', () => {
  it('lists ingest tokens', async () => {
    apiMock.get.mockResolvedValue(envelope([{id: TID, name: 'CI', token_prefix: 'cyi_p_ab', status: 'active'}]))
    const {stdout} = await runCaptured(TokensList, ['--project', PID])
    expect(apiMock.get).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/tokens`)
    expect(stdout).toContain('cyi_p_ab')
  })

  it('exits non-zero on an API error', async () => {
    apiMock.get.mockRejectedValue(apiError(403, 'R403-TOK-001', 'forbidden'))
    const {stderr} = await runExpectingExit(TokensList, ['--project', PID])
    expect(stderr).toContain('R403-TOK-001')
  })
})

describe('tokens create', () => {
  it('posts name + environment id and shows the one-time secret', async () => {
    apiMock.post.mockResolvedValue(envelope({secret: 'cyi_p_SECRET', dsn: 'https://dsn'}))
    const {stdout} = await runCaptured(TokensCreate, ['--project', PID, '--name', 'CI prod', '--environment-id', 'env-1'])
    expect(apiMock.post).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/tokens`, {name: 'CI prod', environment_id: 'env-1'})
    expect(stdout).toContain('cyi_p_SECRET')
    expect(stdout).toContain('https://dsn')
  })
})

describe('tokens provision (secret-free)', () => {
  const response = {
    token: {
      id: TID,
      name: 'CloseYourIt ingest',
      environment_id: 'env-1',
      token_prefix: 'cyi_safe',
      scopes: ['ingest'],
      secret: 'MUST_NOT_ESCAPE',
      token_digest: 'MUST_NOT_ESCAPE',
    },
    provision: {
      id: 'prov-1',
      status: 'pending_sync',
      secret_name: 'CLOSEYOURIT_TOKEN',
      destination_project_id: PID,
      destination_environment_id: 'env-2',
      value: 'MUST_NOT_ESCAPE',
    },
    secret: 'MUST_NOT_ESCAPE',
  }

  it('generates an idempotency key, sends the destination and does not print the secret', async () => {
    apiMock.post.mockResolvedValue(envelope(response))

    const {result, stdout} = await runCaptured(TokensProvision, [
      '--project', PID,
      '--name', 'CloseYourIt ingest',
      '--environment-id', 'env-1',
      '--to-project', PID,
      '--to-environment-id', 'env-2',
      '--secret-name', 'CLOSEYOURIT_TOKEN',
      '--scope', 'ingest',
    ])

    expect(apiMock.post).toHaveBeenCalledWith(
      `/cli/v1/projects/${PID}/tokens/provisions`,
      expect.objectContaining({
        name: 'CloseYourIt ingest',
        environment_id: 'env-1',
        scopes: ['ingest'],
        sync_github: true,
        destination: {project_id: PID, environment_id: 'env-2', secret_name: 'CLOSEYOURIT_TOKEN'},
        idempotency_key: expect.stringMatching(/^[0-9a-f-]{36}$/),
      }),
    )
    expect(stdout).toContain('prov-1')
    expect(stdout).toContain('pending_sync')
    expect(stdout).not.toContain('MUST_NOT_ESCAPE')
    expect(JSON.stringify(result)).not.toContain('MUST_NOT_ESCAPE')
  })

  it('propagates idempotency key, production confirmation and --no-sync-github', async () => {
    apiMock.post.mockResolvedValue(envelope(response))

    await runCaptured(TokensProvision, [
      '--project', PID,
      '--name', 'CI',
      '--environment-id', 'production',
      '--to-project', PID,
      '--to-environment-id', 'production',
      '--secret-name', 'CLOSEYOURIT_TOKEN',
      '--idempotency-key', 'stable-request',
      '--confirm-production',
      '--no-sync-github',
    ])

    expect(apiMock.post).toHaveBeenCalledWith(
      `/cli/v1/projects/${PID}/tokens/provisions`,
      expect.objectContaining({
        idempotency_key: 'stable-request',
        confirm_production: true,
        sync_github: false,
      }),
    )
  })

  it('show and retry return only allow-listed fields', async () => {
    apiMock.get.mockResolvedValue(envelope(response))
    apiMock.post.mockResolvedValue(envelope(response.provision))

    const shown = await runCaptured(TokensProvisionsShow, ['prov-1', '--project', PID, '--json'])
    const retried = await runCaptured(TokensProvisionsRetry, ['prov-1', '--project', PID, '--json'])

    expect(apiMock.get).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/tokens/provisions/prov-1`)
    expect(apiMock.post).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/tokens/provisions/prov-1/retry`)
    expect(JSON.stringify(shown.result)).not.toContain('MUST_NOT_ESCAPE')
    expect(JSON.stringify(retried.result)).not.toContain('MUST_NOT_ESCAPE')
  })
})

describe('tokens revoke / rotate', () => {
  it('revoke → DELETE', async () => {
    apiMock.delete.mockResolvedValue(envelope({}))
    const {stdout} = await runCaptured(TokensRevoke, [TID, '--project', PID])
    expect(apiMock.delete).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/tokens/${TID}`)
    expect(stdout).toContain('revoked')
  })

  it('rotate → PUT .../rotation and shows the new secret', async () => {
    apiMock.put.mockResolvedValue(envelope({secret: 'cyi_p_NEW', dsn: 'https://dsn2'}))
    const {stdout} = await runCaptured(TokensRotate, [TID, '--project', PID])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/tokens/${TID}/rotation`)
    expect(stdout).toContain('cyi_p_NEW')
  })
})
