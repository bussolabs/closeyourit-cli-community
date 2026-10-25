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

import ServersDelete from '../src/commands/servers/delete'
import ServersIgnoredContainers from '../src/commands/servers/ignored-containers'
import ServersList from '../src/commands/servers/list'
import ServersPause from '../src/commands/servers/pause'
import ServersRename from '../src/commands/servers/rename'
import ServersResume from '../src/commands/servers/resume'
import ServersRevoke from '../src/commands/servers/revoke'
import ServersShow from '../src/commands/servers/show'
import ServersTokensCreate from '../src/commands/servers/tokens/create'
import ServersTokensList from '../src/commands/servers/tokens/list'
import ServersTokensRevoke from '../src/commands/servers/tokens/revoke'
import ServersUnrevoke from '../src/commands/servers/unrevoke'

const HOST = 'sv-1'
const TOKEN = 'st-1'

beforeEach(() => resetApiMock())

describe('servers list / show', () => {
  it('lists the fleet', async () => {
    apiMock.get.mockResolvedValue(
      envelope([
        {name: 'apps', status: 'up', cpu_pct: '12.5', mem_pct: '40.0', disk_pct: '55.0', last_seen_at: '2026-07-02', id: HOST},
      ]),
    )
    const {stdout} = await runCaptured(ServersList, [])
    expect(apiMock.get).toHaveBeenCalledWith('/cli/v1/servers?page=1')
    expect(stdout).toContain('apps')
    expect(stdout).toContain('up')
  })

  it('list forwards page and repeatable status filter', async () => {
    apiMock.get.mockResolvedValue(envelope([]))
    await runCaptured(ServersList, ['--page', '2', '--status', 'down', '--status', 'paused'])
    expect(apiMock.get).toHaveBeenCalledWith('/cli/v1/servers?page=2&status%5B%5D=down&status%5B%5D=paused')
  })

  it('shows a server snapshot', async () => {
    apiMock.get.mockResolvedValue(envelope({id: HOST, name: 'apps', os_name: 'Ubuntu 24.04'}))
    const {stdout} = await runCaptured(ServersShow, [HOST])
    expect(apiMock.get).toHaveBeenCalledWith(`/cli/v1/servers/${HOST}`)
    expect(stdout).toContain('Ubuntu 24.04')
  })
})

describe('servers mutations', () => {
  it('renames a server', async () => {
    apiMock.put.mockResolvedValue(envelope({id: HOST, name: 'apps-prod'}))
    const {stdout} = await runCaptured(ServersRename, [HOST, '--name', 'apps-prod'])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/servers/${HOST}`, {name: 'apps-prod'})
    expect(stdout).toContain('apps-prod')
  })

  it('pauses and resumes', async () => {
    apiMock.put.mockResolvedValue(envelope({id: HOST, status: 'paused'}))
    await runCaptured(ServersPause, [HOST])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/servers/${HOST}/pause`)

    apiMock.put.mockResolvedValue(envelope({id: HOST, status: 'pending'}))
    await runCaptured(ServersResume, [HOST])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/servers/${HOST}/resume`)
  })

  it('revoke requires --confirm (exit 2, no call)', async () => {
    await runExpectingExit(ServersRevoke, [HOST], 2)
    expect(apiMock.put).not.toHaveBeenCalled()
  })

  it('revokes with --confirm and restores', async () => {
    apiMock.put.mockResolvedValue(envelope({id: HOST, revoked_at: '2026-07-02'}))
    const {stdout} = await runCaptured(ServersRevoke, [HOST, '--confirm'])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/servers/${HOST}/revoke`)
    expect(stdout).toContain('403')

    apiMock.put.mockResolvedValue(envelope({id: HOST, revoked_at: null}))
    await runCaptured(ServersUnrevoke, [HOST])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/servers/${HOST}/unrevoke`)
  })

  it('delete requires --confirm (exit 2, no call)', async () => {
    await runExpectingExit(ServersDelete, [HOST], 2)
    expect(apiMock.delete).not.toHaveBeenCalled()
  })

  it('deletes with --confirm', async () => {
    apiMock.delete.mockResolvedValue(undefined)
    const {stdout} = await runCaptured(ServersDelete, [HOST, '--confirm'])
    expect(apiMock.delete).toHaveBeenCalledWith(`/cli/v1/servers/${HOST}`)
    expect(stdout).toContain(`Deleted server ${HOST}`)
  })
})

describe('servers tokens', () => {
  it('lists enrollment tokens', async () => {
    apiMock.get.mockResolvedValue(
      envelope([{name: 'fleet', token_prefix: 'cyi_s_abc1', last_used_at: null, revoked_at: null, id: TOKEN}]),
    )
    const {stdout} = await runCaptured(ServersTokensList, [])
    expect(apiMock.get).toHaveBeenCalledWith('/cli/v1/server_tokens?page=1')
    expect(stdout).toContain('fleet')
    expect(stdout).toContain('cyi_s_abc1')
  })

  it('creates a token and prints the one-time secret', async () => {
    apiMock.post.mockResolvedValue(envelope({id: TOKEN, name: 'fleet', secret: 'cyi_s_supersecret'}))
    const {stdout} = await runCaptured(ServersTokensCreate, ['fleet'])
    expect(apiMock.post).toHaveBeenCalledWith('/cli/v1/server_tokens', {name: 'fleet'})
    expect(stdout).toContain('cyi_s_supersecret')
    expect(stdout).toContain('shown only once')
  })

  it('token revoke requires --confirm (exit 2, no call)', async () => {
    await runExpectingExit(ServersTokensRevoke, [TOKEN], 2)
    expect(apiMock.delete).not.toHaveBeenCalled()
  })

  it('revokes a token with --confirm', async () => {
    apiMock.delete.mockResolvedValue(undefined)
    const {stdout} = await runCaptured(ServersTokensRevoke, [TOKEN, '--confirm'])
    expect(apiMock.delete).toHaveBeenCalledWith(`/cli/v1/server_tokens/${TOKEN}`)
    expect(stdout).toContain(`Revoked enrollment token ${TOKEN}`)
  })
})

// CYRA-519 — the names that are not services on a machine could only be written from the web page:
// whoever works from the terminal had to open the browser for a two-line list.
describe('servers ignored-containers', () => {
  it('reads the current list', async () => {
    apiMock.get.mockResolvedValue(envelope({id: HOST, ignored_container_patterns: ['buildkit', 'runner']}))
    const {stdout} = await runCaptured(ServersIgnoredContainers, [HOST])
    expect(apiMock.get).toHaveBeenCalledWith(`/cli/v1/servers/${HOST}`)
    expect(stdout).toContain('buildkit')
    expect(stdout).toContain('runner')
  })

  it('says so when the list is empty, instead of printing nothing', async () => {
    apiMock.get.mockResolvedValue(envelope({id: HOST, ignored_container_patterns: []}))
    const {stdout} = await runCaptured(ServersIgnoredContainers, [HOST])
    expect(stdout).toContain('No ignored container names')
  })

  it('replaces the list with --set', async () => {
    apiMock.put.mockResolvedValue(envelope({id: HOST, ignored_container_patterns: ['buildkit', 'runner']}))
    await runCaptured(ServersIgnoredContainers, [HOST, '--set', 'buildkit, runner'])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/servers/${HOST}`, {
      ignored_container_patterns: ['buildkit', 'runner'],
    })
  })

  it('empties the list with --clear', async () => {
    apiMock.put.mockResolvedValue(envelope({id: HOST, ignored_container_patterns: []}))
    await runCaptured(ServersIgnoredContainers, [HOST, '--clear'])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/servers/${HOST}`, {ignored_container_patterns: []})
  })
})
