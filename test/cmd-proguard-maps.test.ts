import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {mkdtemp, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
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
import Upload from '../src/commands/artifacts/proguard-maps/upload'
import List from '../src/commands/artifacts/proguard-maps/list'
import Show from '../src/commands/artifacts/proguard-maps/show'
import Delete from '../src/commands/artifacts/proguard-maps/delete'

let dir: string, file: string
const debugId = '12345678-1234-5678-9012-123456789abc'
const path = `/cli/v1/projects/${PID}/artifacts/proguard_maps`
const metadata = {id: 'map-1', release: 'v1', debug_id: debugId, byte_size: 100, sha256: 'a'.repeat(64)}
const mapping = '# semantic comment\nprivateSentinel.Original -> a:\n'
const args = () => ['-p', PID, '--file', file, '--release', 'v1', '--debug-id', debugId]
beforeEach(async () => { resetApiMock(); dir = await mkdtemp(join(tmpdir(), 'cyi-proguard-command-')); file = join(dir, 'mapping.txt'); await writeFile(file, mapping) })
afterEach(async () => { await rm(dir, {recursive: true, force: true}) })

describe('ProGuard artifact commands', () => {
  it.each([false, true])('uploads complete mapping but emits metadata only (json=%s)', async (json) => {
    apiMock.post.mockResolvedValue(envelope({...metadata, mapping}))
    const {stdout, result} = await runCaptured(Upload, [...args(), '--dist', 'arm64', ...(json ? ['--json'] : [])])
    expect(apiMock.post).toHaveBeenCalledWith(path, {release: 'v1', dist: 'arm64', debug_id: debugId, mapping})
    expect(result).toEqual(envelope(metadata))
    expect(stdout).not.toContain('privateSentinel')
  })

  it('requires debug UUID before touching upload and refuses invalid local contents', async () => {
    await runExpectingExit(Upload, ['-p', PID, '--file', file, '--release', 'v1'], 2)
    await writeFile(file, 'privateSentinel\0')
    const result = await runExpectingExit(Upload, [...args(), '--json'])
    expect(result.stdout).not.toContain('privateSentinel')
    expect(result.stdout).toContain('NUL')
    expect(apiMock.post).not.toHaveBeenCalled()
  })

  it.each([403, 409, 413, 422, 503])('preserves status %i code without exposing remote mapping diagnostics', async (status) => {
    apiMock.post.mockRejectedValue(apiError(status, `R${status}-ARTIFACT-001`, mapping, {mapping}))
    const failure = await runExpectingExit(Upload, [...args(), '--json'])
    expect(failure.stdout).toContain(`R${status}-ARTIFACT-001`)
    expect(failure.stdout).not.toContain('privateSentinel')
  })

  it.each([[], [metadata], [metadata, {...metadata, id: 'map-2'}]].map((rows) => ({rows})))('lists 0/1/N metadata rows', async ({rows}) => {
    apiMock.get.mockResolvedValue(envelope(rows, {page: 2, total_pages: 2}))
    expect((await runCaptured(List, ['-p', PID, '--page', '2', '--json'])).result).toEqual(envelope(rows, {page: 2, total_pages: 2}))
    expect(apiMock.get).toHaveBeenCalledWith(`${path}?page=2`)
  })

  it('formats list/show metadata and escapes IDs without exposing a returned map', async () => {
    apiMock.get.mockResolvedValue(envelope([metadata]))
    expect((await runCaptured(List, ['-p', PID])).stdout).toContain(debugId)
    apiMock.get.mockResolvedValue(envelope({...metadata, mapping}))
    expect((await runCaptured(Show, ['a/b', '-p', PID])).stdout).not.toContain('privateSentinel')
    expect(apiMock.get).toHaveBeenLastCalledWith(`${path}/a%2Fb`)
    expect((await runCaptured(Show, ['map-1', '-p', PID, '--json'])).result).toEqual(envelope(metadata))
    apiMock.get.mockClear()
    await runExpectingExit(List, ['-p', PID, '--page', '0'], 2)
    expect(apiMock.get).not.toHaveBeenCalled()
  })

  it('requires explicit confirmation and sends a JSON confirmation body', async () => {
    await runExpectingExit(Delete, ['map-1', '-p', PID], 2)
    expect(apiMock.delete).not.toHaveBeenCalled()
    apiMock.delete.mockResolvedValue(envelope(null))
    const result = await runCaptured(Delete, ['map-1', '-p', PID, '--confirm'])
    expect(result.stdout).toContain('Deleted ProGuard map')
    expect(apiMock.delete).toHaveBeenCalledWith(`${path}/map-1`, {body: {confirm: true}})
  })
})
