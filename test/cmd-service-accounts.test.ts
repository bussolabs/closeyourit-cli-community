import {beforeEach, describe, expect, it, vi} from 'vitest'
import {apiMock, resetApiMock} from './helpers/api-mock'
import {apiError, envelope, runCaptured, runExpectingExit} from './helpers/command'

vi.mock('../src/lib/api', async (io) => {
  const actual = await io<typeof import('../src/lib/api')>()
  const {apiMock} = await import('./helpers/api-mock')
  return {...actual, CliApi: vi.fn(function () { return apiMock })}
})
vi.mock('../src/lib/config', async (io) => {
  const actual = await io<typeof import('../src/lib/config')>()
  return {...actual, loadConfig: vi.fn(() => ({apiUrl: 'https://api.test', token: 'tok_test'}))}
})

import ServiceAccountsList from '../src/commands/service-accounts/list'
import ServiceAccountsCreate from '../src/commands/service-accounts/create'
import ServiceAccountsDelete from '../src/commands/service-accounts/delete'
import ServiceAccountsShow from '../src/commands/service-accounts/show'
import ServiceAccountsUpdate from '../src/commands/service-accounts/update'
import ServiceAccountsTokensCreate from '../src/commands/service-accounts/tokens/create'
import ServiceAccountsTokensList from '../src/commands/service-accounts/tokens/list'
import ServiceAccountsTokensRevoke from '../src/commands/service-accounts/tokens/revoke'

const ACC = 'svc-1'
const TOK = 'tok-1'
// The environments the organization really declares: `update` reads them BEFORE writing, because a
// wrong code narrows nothing — it erases the boundary (CYCL-46).
const ORG_ENVS = [{id: 'e1', code: 'staging'}, {id: 'e2', code: 'production'}]

beforeEach(() => resetApiMock())

describe('service-accounts list', () => {
  it('lists the service accounts with env and tokens', async () => {
    apiMock.get.mockResolvedValue(
      envelope([{name: 'Deploy Bot', handle: 'deploy_bot', secret_environment_codes: ['staging'], active_tokens_count: 2, id: ACC}]),
    )
    const {stdout} = await runCaptured(ServiceAccountsList, [])
    expect(apiMock.get).toHaveBeenCalledWith('/cli/v1/service/accounts?page=1')
    expect(stdout).toContain('deploy_bot')
    expect(stdout).toContain('staging')
  })

  it('shows "all" when there is no env restriction', async () => {
    apiMock.get.mockResolvedValue(
      envelope([{name: 'Bot', handle: 'bot', secret_environment_codes: [], active_tokens_count: 0, id: ACC}]),
    )
    const {stdout} = await runCaptured(ServiceAccountsList, [])
    expect(stdout).toContain('all')
  })
})

describe('service-accounts create', () => {
  it('resolves the project key and posts the body with grant-secrets + env', async () => {
    apiMock.get.mockResolvedValue(envelope([{id: 'p1', key: 'CYI'}])) // resolveProjectId → /cli/v1/projects
    apiMock.post.mockResolvedValue(envelope({id: ACC, handle: 'deploy_bot'}))
    await runCaptured(ServiceAccountsCreate, [
      '--name', 'Deploy Bot', '--project', 'CYI', '--grant-secrets', '--secret-environment', 'staging',
    ])
    expect(apiMock.post).toHaveBeenCalledWith(
      '/cli/v1/service/accounts',
      expect.objectContaining({name: 'Deploy Bot', project_ids: ['p1'], grant_secrets: true, secret_environment_codes: ['staging']}),
    )
  })
})

describe('service-accounts delete', () => {
  it('without --confirm → exit 2', async () => {
    await runExpectingExit(ServiceAccountsDelete, [ACC], 2)
    expect(apiMock.delete).not.toHaveBeenCalled()
  })

  it('with --confirm calls DELETE', async () => {
    apiMock.delete.mockResolvedValue(undefined)
    await runCaptured(ServiceAccountsDelete, [ACC, '--confirm'])
    expect(apiMock.delete).toHaveBeenCalledWith(`/cli/v1/service/accounts/${ACC}`)
  })
})

describe('service-accounts tokens', () => {
  it('create shows the reveal-once secret', async () => {
    apiMock.post.mockResolvedValue(envelope({id: TOK, name: 'ci', secret: 'cyi_u_abc'}))
    const {stdout} = await runCaptured(ServiceAccountsTokensCreate, [ACC, 'ci'])
    expect(apiMock.post).toHaveBeenCalledWith(`/cli/v1/service/accounts/${ACC}/tokens`, {name: 'ci'})
    expect(stdout).toContain('cyi_u_abc')
  })

  it('revoke without --confirm → exit 2', async () => {
    await runExpectingExit(ServiceAccountsTokensRevoke, [ACC, TOK], 2)
    expect(apiMock.delete).not.toHaveBeenCalled()
  })

  it('revoke with --confirm calls DELETE', async () => {
    apiMock.delete.mockResolvedValue(undefined)
    await runCaptured(ServiceAccountsTokensRevoke, [ACC, TOK, '--confirm'])
    expect(apiMock.delete).toHaveBeenCalledWith(`/cli/v1/service/accounts/${ACC}/tokens/${TOK}`)
  })
})

describe('service-accounts --json', () => {
  it('--json returns the envelope and suppresses the human rendering', async () => {
    apiMock.get.mockResolvedValue(envelope([{id: ACC}]))
    const {result} = await runCaptured(ServiceAccountsList, ['--json'])
    expect(result).toEqual(envelope([{id: ACC}]))

    apiMock.post.mockResolvedValue(envelope({id: ACC, handle: 'b'}))
    await runCaptured(ServiceAccountsCreate, ['--name', 'B', '--json'])
    apiMock.post.mockResolvedValue(envelope({id: TOK, secret: 's'}))
    await runCaptured(ServiceAccountsTokensCreate, [ACC, 'n', '--json'])
    apiMock.delete.mockResolvedValue(undefined)
    await runCaptured(ServiceAccountsDelete, [ACC, '--confirm', '--json'])
    await runCaptured(ServiceAccountsTokensRevoke, [ACC, TOK, '--confirm', '--json'])
  })
})

// CYCL-46 — inspecting and fixing a service account without recreating it from scratch.
describe('service-accounts show', () => {
  it('shows the detail and the environments where it can read secrets', async () => {
    apiMock.get.mockResolvedValue(
      envelope({
        id: ACC,
        name: 'Deploy Bot',
        handle: 'deploy_bot',
        created_at: '2026-08-01T10:00:00Z',
        secret_environment_codes: ['staging', 'production'],
        active_tokens_count: 2,
      }),
    )
    const {stdout} = await runCaptured(ServiceAccountsShow, [ACC])
    expect(apiMock.get).toHaveBeenCalledWith(`/cli/v1/service/accounts/${ACC}`)
    expect(stdout).toContain('deploy_bot')
    expect(stdout).toContain('active_tokens_count: 2')
    expect(stdout).toContain('secret environments: staging, production')
  })

  it("the empty environment list reads as «all», not as «none»", async () => {
    apiMock.get.mockResolvedValue(envelope({id: ACC, name: 'Bot', handle: 'bot', secret_environment_codes: []}))
    const {stdout} = await runCaptured(ServiceAccountsShow, [ACC])
    expect(stdout).toContain('secret environments: all (no restriction)')
  })

  it('does not print a field the server should not send (no secret on screen)', async () => {
    apiMock.get.mockResolvedValue(
      envelope({id: ACC, name: 'Bot', handle: 'bot', secret_environment_codes: [], secret: 'cyi_u_leaked'}),
    )
    const {stdout} = await runCaptured(ServiceAccountsShow, [ACC])
    expect(stdout).not.toContain('cyi_u_leaked')
  })

  it('not even in --json: the machine path filters like the human one', async () => {
    apiMock.get.mockResolvedValue(
      envelope({id: ACC, name: 'Bot', handle: 'bot', secret_environment_codes: [], secret: 'cyi_u_leaked'}),
    )
    const {result, stdout} = await runCaptured(ServiceAccountsShow, [ACC, '--json'])
    expect(JSON.stringify(result)).not.toContain('cyi_u_leaked')
    expect(stdout).not.toContain('cyi_u_leaked')
    // The rest of the payload stays whole: the secret is removed, the response is not trimmed.
    expect(JSON.stringify(result)).toContain('bot')
  })
})

describe('service-accounts update', () => {
  it('without either choice it refuses: the empty list would open every environment → exit 2', async () => {
    const {message} = await runExpectingExit(ServiceAccountsUpdate, [ACC], 2)
    expect(apiMock.put).not.toHaveBeenCalled()
    expect(message).toContain('--all-environments')
  })

  it('the two choices together contradict each other → exit 2', async () => {
    await runExpectingExit(
      ServiceAccountsUpdate,
      [ACC, '--secret-environment', 'staging', '--all-environments'],
      2,
    )
    expect(apiMock.put).not.toHaveBeenCalled()
  })

  it('a code made only of spaces does not count as a restriction → exit 2', async () => {
    await runExpectingExit(ServiceAccountsUpdate, [ACC, '--secret-environment', '  '], 2)
    expect(apiMock.put).not.toHaveBeenCalled()
  })

  it('a code the organization does not have stops the command BEFORE writing', async () => {
    apiMock.get.mockResolvedValue(envelope(ORG_ENVS))
    const {message} = await runExpectingExit(ServiceAccountsUpdate, [ACC, '--secret-environment', 'stagin'], 2)
    // No write: the server would have dropped the typo leaving the account without a boundary.
    expect(apiMock.put).not.toHaveBeenCalled()
    expect(message).toContain('stagin')
    expect(message).toContain('staging, production')
  })

  it('sends the cleaned codes (lowercase, no spaces, no duplicates) and shows the boundary in force', async () => {
    apiMock.get.mockResolvedValue(envelope(ORG_ENVS))
    apiMock.put.mockResolvedValue(envelope({id: ACC, name: 'Bot', handle: 'bot', secret_environment_codes: ['staging']}))
    const {stdout} = await runCaptured(ServiceAccountsUpdate, [
      ACC, '--secret-environment', ' Staging ', '--secret-environment', 'staging',
    ])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/service/accounts/${ACC}`, {
      secret_environment_codes: ['staging'],
    })
    expect(stdout).toContain('secret environments: staging')
  })

  it('--all-environments removes the restriction by sending the empty list, without reading the environments', async () => {
    apiMock.put.mockResolvedValue(envelope({id: ACC, name: 'Bot', handle: 'bot', secret_environment_codes: []}))
    const {stdout} = await runCaptured(ServiceAccountsUpdate, [ACC, '--all-environments'])
    expect(apiMock.get).not.toHaveBeenCalled()
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/service/accounts/${ACC}`, {secret_environment_codes: []})
    expect(stdout).toContain('secret environments: all (no restriction)')
  })

  it('if the environments cannot be read it writes anyway: the check after the write remains', async () => {
    // Listing environments needs environments.view, which whoever manages members may not have: a
    // missing permission there must not prevent an operation one is entitled to.
    apiMock.get.mockRejectedValue(apiError(403, 'R403-PERM-001', 'Permesso negato'))
    apiMock.put.mockResolvedValue(envelope({id: ACC, name: 'Bot', handle: 'bot', secret_environment_codes: ['staging']}))
    const {stdout} = await runCaptured(ServiceAccountsUpdate, [ACC, '--secret-environment', 'staging'])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/service/accounts/${ACC}`, {
      secret_environment_codes: ['staging'],
    })
    expect(stdout).toContain('secret environments: staging')
  })

  it('a code gone between the read and the write is dropped by the server: it says so and exits non-zero', async () => {
    apiMock.get.mockResolvedValue(envelope([...ORG_ENVS, {id: 'e3', code: 'canary'}]))
    apiMock.put.mockResolvedValue(envelope({id: ACC, name: 'Bot', handle: 'bot', secret_environment_codes: ['staging']}))
    const {message, stdout} = await runExpectingExit(
      ServiceAccountsUpdate,
      [ACC, '--secret-environment', 'staging', '--secret-environment', 'canary'],
      1,
    )
    expect(message).toContain('canary')
    expect(message).toContain('C404-SVA-001')
    // What the server really applied is shown anyway: the error adds, it does not hide.
    expect(stdout).toContain('secret environments: staging')
  })

  it('if every code is dropped the boundary disappears: it says so as an opening to all environments', async () => {
    apiMock.get.mockResolvedValue(envelope([...ORG_ENVS, {id: 'e3', code: 'canary'}]))
    apiMock.put.mockResolvedValue(envelope({id: ACC, name: 'Bot', handle: 'bot', secret_environment_codes: []}))
    const {message} = await runExpectingExit(ServiceAccountsUpdate, [ACC, '--secret-environment', 'canary'], 1)
    expect(message).toContain('all environments')
  })

  it('an environment beyond the requested ones widens the boundary: it says so and exits non-zero', async () => {
    apiMock.get.mockResolvedValue(envelope(ORG_ENVS))
    apiMock.put.mockResolvedValue(
      envelope({id: ACC, name: 'Bot', handle: 'bot', secret_environment_codes: ['staging', 'production']}),
    )
    const {message} = await runExpectingExit(ServiceAccountsUpdate, [ACC, '--secret-environment', 'staging'], 1)
    expect(message).toContain('production')
    expect(message).toContain('C404-SVA-001')
  })

  it('if the restriction stays in place despite --all-environments it says so and exits non-zero', async () => {
    apiMock.put.mockResolvedValue(
      envelope({id: ACC, name: 'Bot', handle: 'bot', secret_environment_codes: ['production']}),
    )
    const {message} = await runExpectingExit(ServiceAccountsUpdate, [ACC, '--all-environments'], 1)
    expect(message).toContain('C500-SVA-002')
    expect(message).toContain('production')
  })

  it('not even in --json does a secret field the server should not send come out', async () => {
    apiMock.get.mockResolvedValue(envelope(ORG_ENVS))
    apiMock.put.mockResolvedValue(
      envelope({id: ACC, name: 'Bot', handle: 'bot', secret_environment_codes: ['staging'], secret: 'cyi_u_leaked'}),
    )
    const {result} = await runCaptured(ServiceAccountsUpdate, [ACC, '--secret-environment', 'staging', '--json'])
    expect(JSON.stringify(result)).not.toContain('cyi_u_leaked')
  })
})

describe('service-accounts tokens list', () => {
  it('lists the active and revoked tokens with their status', async () => {
    apiMock.get.mockResolvedValue(
      envelope([
        {id: TOK, name: 'ci', token_prefix: 'cyi_u_abc', last_used_at: '2026-08-02T09:00:00Z', revoked_at: null},
        {id: 'tok-2', name: 'vecchio', token_prefix: 'cyi_u_xyz', last_used_at: null, revoked_at: '2026-07-01T09:00:00Z'},
      ]),
    )
    const {stdout} = await runCaptured(ServiceAccountsTokensList, [ACC])
    expect(apiMock.get).toHaveBeenCalledWith(`/cli/v1/service/accounts/${ACC}/tokens?page=1`)
    expect(stdout).toContain('active')
    expect(stdout).toContain('revoked')
    expect(stdout).toContain('cyi_u_abc')
  })

  it('--page 0 is rejected before calling the server → exit 2', async () => {
    // The backend would silently bring it back to 1: a script that computed the number wrong
    // would receive plausible data instead of an error.
    await runExpectingExit(ServiceAccountsTokensList, [ACC, '--page', '0'], 2)
    expect(apiMock.get).not.toHaveBeenCalled()
  })

  it('--page requests the given page', async () => {
    apiMock.get.mockResolvedValue(envelope([]))
    await runCaptured(ServiceAccountsTokensList, [ACC, '--page', '3'])
    expect(apiMock.get).toHaveBeenCalledWith(`/cli/v1/service/accounts/${ACC}/tokens?page=3`)
  })

  it('never reprints a secret already issued, not even if the server sent it again', async () => {
    apiMock.get.mockResolvedValue(envelope([{id: TOK, name: 'ci', token_prefix: 'cyi_u_abc', secret: 'cyi_u_abcdef'}]))
    const {stdout} = await runCaptured(ServiceAccountsTokensList, [ACC])
    expect(stdout).not.toContain('cyi_u_abcdef')
  })

  it('not even in --json: the secret does not end up in the machine result', async () => {
    apiMock.get.mockResolvedValue(envelope([{id: TOK, name: 'ci', token_prefix: 'cyi_u_abc', secret: 'cyi_u_abcdef'}]))
    const {result, stdout} = await runCaptured(ServiceAccountsTokensList, [ACC, '--json'])
    expect(JSON.stringify(result)).not.toContain('cyi_u_abcdef')
    expect(stdout).not.toContain('cyi_u_abcdef')
  })
})
