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

import UptimeGroupsCreate from '../src/commands/uptime-groups/create'
import UptimeGroupsDelete from '../src/commands/uptime-groups/delete'
import UptimeGroupsList from '../src/commands/uptime-groups/list'
import UptimeGroupsPublish from '../src/commands/uptime-groups/publish'
import UptimeGroupsShow from '../src/commands/uptime-groups/show'
import UptimeGroupsUnpublish from '../src/commands/uptime-groups/unpublish'
import UptimeGroupsUpdate from '../src/commands/uptime-groups/update'

const UG = 'ug-1'

type Entry = [name: string, command: {run: typeof UptimeGroupsShow.run}, argv: string[]]

/** Commands whose human block renders `res.data` — exercised for the `--json` and null-envelope branches. */
const renderCommands: Entry[] = [
  ['list', UptimeGroupsList, []],
  ['show', UptimeGroupsShow, [UG]],
  ['create', UptimeGroupsCreate, ['--name', 'Core']],
  ['update', UptimeGroupsUpdate, [UG, '--name', 'Core']],
  ['publish', UptimeGroupsPublish, [UG]],
  ['unpublish', UptimeGroupsUnpublish, [UG]],
]

function resolveAllWith(value: unknown): void {
  for (const method of ['get', 'post', 'put', 'delete'] as const) apiMock[method].mockResolvedValue(value)
}

beforeEach(() => resetApiMock())

describe('uptime-groups list', () => {
  it('lists the org uptime groups (default page)', async () => {
    apiMock.get.mockResolvedValue(envelope([{id: UG, name: 'Core', slug: 'core', public_status_enabled: true}], {total: 1}))
    const {stdout} = await runCaptured(UptimeGroupsList, [])
    expect(apiMock.get).toHaveBeenCalledWith('/cli/v1/uptime_groups?page=1')
    expect(stdout).toContain('Core')
  })

  it('honours --page', async () => {
    apiMock.get.mockResolvedValue(envelope([]))
    await runCaptured(UptimeGroupsList, ['--page', '2'])
    expect(apiMock.get).toHaveBeenCalledWith('/cli/v1/uptime_groups?page=2')
  })

  it('exits non-zero on an API error', async () => {
    apiMock.get.mockRejectedValue(apiError(403, 'R403-CLIAUTH-002', 'denied'))
    const {stderr} = await runExpectingExit(UptimeGroupsList, [])
    expect(stderr).toContain('R403-CLIAUTH-002')
  })
})

describe('uptime-groups show', () => {
  it('fetches a single group', async () => {
    apiMock.get.mockResolvedValue(envelope({id: UG, name: 'Core'}))
    await runCaptured(UptimeGroupsShow, [UG])
    expect(apiMock.get).toHaveBeenCalledWith(`/cli/v1/uptime_groups/${UG}`)
  })
})

describe('uptime-groups create', () => {
  it('posts name only', async () => {
    apiMock.post.mockResolvedValue(envelope({id: UG, name: 'Core'}))
    const {stdout} = await runCaptured(UptimeGroupsCreate, ['--name', 'Core'])
    expect(apiMock.post).toHaveBeenCalledWith('/cli/v1/uptime_groups', {name: 'Core'})
    expect(stdout).toContain('Uptime group created')
  })

  it('maps every optional field into the body', async () => {
    apiMock.post.mockResolvedValue(envelope({id: UG}))
    await runCaptured(UptimeGroupsCreate, ['--name', 'API', '--color', 'sky', '--icon', 'server', '--description', 'x'])
    expect(apiMock.post).toHaveBeenCalledWith('/cli/v1/uptime_groups', {
      name: 'API', color: 'sky', icon: 'server', description: 'x',
    })
  })

  it('requires --name (usage error)', async () => {
    const {message} = await runExpectingExit(UptimeGroupsCreate, [], 2)
    expect(message).toContain('name')
    expect(apiMock.post).not.toHaveBeenCalled()
  })
})

describe('uptime-groups update', () => {
  it('sends only the provided fields', async () => {
    apiMock.put.mockResolvedValue(envelope({id: UG, name: 'New'}))
    const {stdout} = await runCaptured(UptimeGroupsUpdate, [UG, '--name', 'New'])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/uptime_groups/${UG}`, {name: 'New'})
    expect(stdout).toContain(`Updated uptime group ${UG}`)
  })

  it('maps every field', async () => {
    apiMock.put.mockResolvedValue(envelope({id: UG}))
    await runCaptured(UptimeGroupsUpdate, [UG, '--name', 'N', '--color', 'emerald', '--icon', 'gauge', '--description', 'd'])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/uptime_groups/${UG}`, {
      name: 'N', color: 'emerald', icon: 'gauge', description: 'd',
    })
  })
})

describe('uptime-groups delete', () => {
  it('refuses without --confirm (exit 2, no api call)', async () => {
    const {message} = await runExpectingExit(UptimeGroupsDelete, [UG], 2)
    expect(message).toContain('Refusing to delete')
    expect(apiMock.delete).not.toHaveBeenCalled()
  })

  it('deletes with --confirm', async () => {
    apiMock.delete.mockResolvedValue(envelope({}))
    const {result, stdout} = await runCaptured(UptimeGroupsDelete, [UG, '--confirm'])
    expect(apiMock.delete).toHaveBeenCalledWith(`/cli/v1/uptime_groups/${UG}`)
    expect(stdout).toContain(`Deleted uptime group ${UG}`)
    expect((result as {deleted: string}).deleted).toBe(UG)
  })

  it('skips the human line with --json', async () => {
    apiMock.delete.mockResolvedValue(envelope({}))
    const {stdout} = await runCaptured(UptimeGroupsDelete, [UG, '--confirm', '--json'])
    expect(stdout).toContain('"deleted"')
  })
})

describe('uptime-groups publish / unpublish', () => {
  it('publish PUTs the publication sub-resource', async () => {
    apiMock.put.mockResolvedValue(envelope({id: UG, public_status_enabled: true}))
    const {stdout} = await runCaptured(UptimeGroupsPublish, [UG])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/uptime_groups/${UG}/publication`)
    expect(stdout).toContain('Published')
  })

  it('unpublish DELETEs the publication sub-resource', async () => {
    apiMock.delete.mockResolvedValue(envelope({id: UG, public_status_enabled: false}))
    const {stdout} = await runCaptured(UptimeGroupsUnpublish, [UG])
    expect(apiMock.delete).toHaveBeenCalledWith(`/cli/v1/uptime_groups/${UG}/publication`)
    expect(stdout).toContain('Unpublished')
  })
})

describe('uptime-groups — json + null-envelope branches', () => {
  it.each(renderCommands)('%s --json returns the envelope', async (_name, command, argv) => {
    resolveAllWith(envelope({id: UG, name: 'Core'}))
    const {stdout} = await runCaptured(command, [...argv, '--json'])
    expect(stdout).toContain('"data"')
  })

  it.each(renderCommands)('%s tolerates a null envelope', async (_name, command, argv) => {
    resolveAllWith({data: undefined})
    await expect(runCaptured(command, argv)).resolves.toBeTruthy()
  })
})
