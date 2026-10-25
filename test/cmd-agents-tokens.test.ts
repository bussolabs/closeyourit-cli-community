import {beforeEach, describe, expect, it, vi} from 'vitest'
import {apiMock, resetApiMock} from './helpers/api-mock'
import {envelope, runCaptured, runExpectingExit} from './helpers/command'

vi.mock('../src/lib/api', async (io) => {
  const actual = await io<typeof import('../src/lib/api')>()
  const {apiMock} = await import('./helpers/api-mock')
  return {...actual, CliApi: vi.fn(function () { return apiMock })}
})
vi.mock('../src/lib/config', async (io) => {
  const actual = await io<typeof import('../src/lib/config')>()
  return {...actual, loadConfig: vi.fn(() => ({apiUrl: 'https://api.test', token: 'tok_test'}))}
})

import AgentsTokensCreate from '../src/commands/agents/tokens/create'
import AgentsTokensList from '../src/commands/agents/tokens/list'
import AgentsTokensRevoke from '../src/commands/agents/tokens/revoke'

const TOKEN = '37f969fa-7347-4b5f-bad4-d50fff6f2a3b'

beforeEach(() => resetApiMock())

describe('agents tokens', () => {
  it('lists the org tokens (masked, never the secret)', async () => {
    apiMock.get.mockResolvedValue(
      envelope([{name: 'automator', token_prefix: 'cyi_a_abc1', last_used_at: null, revoked_at: null, id: TOKEN}]),
    )
    const {stdout} = await runCaptured(AgentsTokensList, [])
    expect(apiMock.get).toHaveBeenCalledWith('/cli/v1/agents/tokens?page=1')
    expect(stdout).toContain('automator')
    expect(stdout).toContain('cyi_a_abc1')
  })

  it('shows "(no results)" without tokens', async () => {
    apiMock.get.mockResolvedValue(envelope([]))
    const {stdout} = await runCaptured(AgentsTokensList, [])
    expect(stdout).toContain('no results')
  })

  it('creates a token and shows the secret only once', async () => {
    apiMock.post.mockResolvedValue(envelope({id: TOKEN, name: 'automator', secret: 'cyi_a_supersecret'}))
    const {stdout} = await runCaptured(AgentsTokensCreate, ['automator'])
    expect(apiMock.post).toHaveBeenCalledWith('/cli/v1/agents/tokens', {name: 'automator'})
    expect(stdout).toContain('cyi_a_supersecret')
    expect(stdout).toContain('only once')
  })

  it('without --confirm → exit 2, no call', async () => {
    await runExpectingExit(AgentsTokensRevoke, [TOKEN], 2)
    expect(apiMock.delete).not.toHaveBeenCalled()
  })

  it('with --confirm → DELETE of the token', async () => {
    apiMock.delete.mockResolvedValue(undefined)
    const {stdout} = await runCaptured(AgentsTokensRevoke, [TOKEN, '--confirm'])
    expect(apiMock.delete).toHaveBeenCalledWith(`/cli/v1/agents/tokens/${TOKEN}`)
    expect(stdout).toContain(`Revoked automator token ${TOKEN}`)
  })

  it('list tolerates missing fields (fallback branches)', async () => {
    apiMock.get.mockResolvedValue(envelope([{}]))
    const {stdout} = await runCaptured(AgentsTokensList, [])
    expect(stdout).toContain('PREFIX')
  })

  it('create without data → secret "-"', async () => {
    apiMock.post.mockResolvedValue({})
    const {stdout} = await runCaptured(AgentsTokensCreate, ['x'])
    expect(stdout).toContain('secret: -')
  })
})
