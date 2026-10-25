import {beforeEach, describe, expect, it, vi} from 'vitest'
import {apiMock, resetApiMock} from './helpers/api-mock'
import {PID, envelope, run, runCaptured, runExpectingExit} from './helpers/command'

vi.mock('../src/lib/api', async (io) => {
  const actual = await io<typeof import('../src/lib/api')>()
  const {apiMock} = await import('./helpers/api-mock')
  return {...actual, CliApi: vi.fn(function () { return apiMock })}
})
vi.mock('../src/lib/config', async (io) => {
  const actual = await io<typeof import('../src/lib/config')>()
  return {...actual, loadConfig: vi.fn(() => ({apiUrl: 'https://api.test', token: 'tok_test'}))}
})
vi.mock('node:fs/promises', () => ({readFile: vi.fn(), stat: vi.fn()}))
vi.mock('../src/lib/private-file', () => ({writePrivateFile: vi.fn()}))

import {readFile, stat} from 'node:fs/promises'
import {writePrivateFile} from '../src/lib/private-file'
import AssetsDownload from '../src/commands/secrets/assets/download'
import AssetsArchive from '../src/commands/secrets/assets/archive'
import AssetsDelegate from '../src/commands/secrets/assets/delegate'
import AssetsList from '../src/commands/secrets/assets/list'
import AssetsPurge from '../src/commands/secrets/assets/purge'
import AssetsRollback from '../src/commands/secrets/assets/rollback'
import AssetsSharedList from '../src/commands/secrets/assets/shared-list'
import AssetsUndelegate from '../src/commands/secrets/assets/undelegate'
import AssetsUpload from '../src/commands/secrets/assets/upload'
import AssetsVersions from '../src/commands/secrets/assets/versions'

const base = `/cli/v1/projects/${PID}/secret_assets`

beforeEach(() => {
  resetApiMock()
  vi.mocked(writePrivateFile).mockResolvedValue(undefined)
})

describe('secrets assets', () => {
  it('lists metadata only', async () => {
    apiMock.get.mockResolvedValue(envelope([{id: 'a1', name: 'ASC', asset_type: 'p8', current_version: {number: 1, byte_size: 42}}]))
    const {stdout} = await runCaptured(AssetsList, ['-p', PID])
    expect(apiMock.get).toHaveBeenCalledWith(`${base}?page=1&per=100`)
    expect(stdout).toContain('ASC')
  })

  it('accepts the deprecated --page/--per flags without error and aggregates anyway', async () => {
    apiMock.get.mockResolvedValue(envelope([{id: 'a1', name: 'ASC'}]))
    await runCaptured(AssetsList, ['-p', PID, '--page', '2', '--per', '5'])
    expect(apiMock.get).toHaveBeenCalledWith(`${base}?page=1&per=100`)
  })

  it('assets list --json keeps a meta consistent with the aggregate', async () => {
    apiMock.get.mockResolvedValue(envelope([{id: 'a1', name: 'ASC'}], {page: 1, per: 100, total: 1, total_pages: 1}))
    const result = (await run(AssetsList, ['-p', PID, '--json'])) as {data: unknown[]; meta: Record<string, number>}
    expect(result.data).toHaveLength(1)
    expect(result.meta).toEqual({page: 1, per: 1, total: 1, total_pages: 1})
  })

  it('shared list --json keeps a meta consistent with the aggregate', async () => {
    apiMock.get.mockResolvedValue(envelope([{id: 'a1', name: 'Distribution'}], {page: 1, per: 100, total: 1, total_pages: 1}))
    const result = (await run(AssetsSharedList, ['--json'])) as {data: unknown[]; meta: Record<string, number>}
    expect(result.data).toHaveLength(1)
    expect(result.meta).toEqual({page: 1, per: 1, total: 1, total_pages: 1})
  })

  it('uploads multipart without printing the content', async () => {
    vi.mocked(stat).mockResolvedValue({isFile: () => true, size: 42} as any)
    vi.mocked(readFile).mockResolvedValue(Buffer.from('private-test'))
    apiMock.upload.mockResolvedValue(envelope({id: 'a1'}))
    const {stdout} = await runCaptured(AssetsUpload, ['-p', PID, '--name', 'ASC', '--file', '/tmp/test.p8'])
    expect(apiMock.upload).toHaveBeenCalledWith('POST', base, expect.arrayContaining([expect.objectContaining({field: 'file', filename: 'test.p8'})]), expect.objectContaining({body: expect.objectContaining({name: 'ASC'})}))
    expect(stdout).not.toContain('private-test')
  })

  it('downloads only to an explicit path with mode 0600 and no-overwrite', async () => {
    apiMock.download.mockResolvedValue({data: new Uint8Array([1, 2]), filename: 'key.p8'})
    await runCaptured(AssetsDownload, ['a1', '-p', PID, '--output', '/tmp/key.p8'])
    expect(writePrivateFile).toHaveBeenCalledWith('/tmp/key.p8', expect.any(Uint8Array), false)

    vi.mocked(writePrivateFile).mockRejectedValueOnce(Object.assign(new Error('exists'), {code: 'EEXIST'}))
    const {message} = await runExpectingExit(AssetsDownload, ['a1', '-p', PID, '--output', '/tmp/key.p8'], 2)
    expect(message).toContain('--force')

    vi.mocked(writePrivateFile).mockResolvedValueOnce(undefined)
    await runCaptured(AssetsDownload, ['a1', '-p', PID, '--output', '/tmp/key.p8', '--force'])
    expect(writePrivateFile).toHaveBeenLastCalledWith('/tmp/key.p8', expect.any(Uint8Array), true)
  })

  it('handles versions, rollback and archive', async () => {
    apiMock.get.mockResolvedValue(envelope([{number: 2, filename: 'key.p8', byte_size: 42, created_at: 'now'}]))
    apiMock.post.mockResolvedValue(envelope({id: 'a1'}))
    apiMock.delete.mockResolvedValue(envelope({}))
    expect((await runCaptured(AssetsVersions, ['a1', '-p', PID])).stdout).toContain('key.p8')
    await runCaptured(AssetsRollback, ['a1', '-p', PID, '--version', '2'])
    await runCaptured(AssetsArchive, ['a1', '-p', PID, '--confirm'])
    expect(apiMock.post).toHaveBeenCalledWith(`${base}/a1/rollback`, {version: 2})
    expect(apiMock.delete).toHaveBeenCalledWith(`${base}/a1`)
  })

  it('handles the list and delegations of shared assets', async () => {
    apiMock.get.mockResolvedValue(envelope([{id: 'a1', name: 'Distribution', asset_type: 'p8'}]))
    apiMock.post.mockResolvedValue(envelope({id: 'd1'}))
    apiMock.delete.mockResolvedValue(envelope({}))
    expect((await runCaptured(AssetsSharedList, [])).stdout).toContain('Distribution')
    await runCaptured(AssetsDelegate, ['a1', '-p', PID])
    await runCaptured(AssetsUndelegate, ['a1', '-p', PID])
    expect(apiMock.post).toHaveBeenCalledWith('/cli/v1/shared_secret_assets/a1/delegate', {project_id: PID})
    expect(apiMock.delete).toHaveBeenCalledWith(`/cli/v1/shared_secret_assets/a1/undelegate?project_id=${PID}`)
  })

  it('purge requires the exact name before the destructive call', async () => {
    apiMock.get.mockResolvedValue(envelope([{id: 'a1', name: 'ASC'}]))
    apiMock.delete.mockResolvedValue(envelope({}))
    await runCaptured(AssetsPurge, ['a1', '-p', PID, '--confirm-name', 'ASC'])
    expect(apiMock.delete).toHaveBeenCalledWith(`${base}/a1/purge`)
    const {message} = await runExpectingExit(AssetsPurge, ['a1', '-p', PID, '--confirm-name', 'wrong'], 2)
    expect(message).toContain('does not match')
  })
})
