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

import Upload from '../src/commands/artifacts/source-maps/upload'
import List from '../src/commands/artifacts/source-maps/list'
import Show from '../src/commands/artifacts/source-maps/show'
import Delete from '../src/commands/artifacts/source-maps/delete'

let dir: string
const path = `/cli/v1/projects/${PID}/artifacts/source_maps`
const metadata = {id: 'map-1', release: 'v1', generated_file: 'app.js', byte_size: 50, sha256: 'a'.repeat(64)}
beforeEach(async () => { resetApiMock(); dir = await mkdtemp(join(tmpdir(), 'cyi-map-command-')) })
afterEach(async () => { await rm(dir, {recursive: true, force: true}) })

describe('source map commands', () => {
  it('uploads actual extracted function metadata without source contents and prints metadata only', async () => {
    const file = join(dir, 'app.js.map')
    await writeFile(file, JSON.stringify({version: 3, sources: ['src.ts'], sourcesContent: ['function original() { return "privateSentinel"; }'], names: [], mappings: 'AAAA'}))
    apiMock.post.mockResolvedValue(envelope({...metadata, source_map: {sourcesContent: ['privateSentinel']}}))
    const {stdout, result} = await runCaptured(Upload, ['--project', PID, '--release', 'v1', '--generated-file', 'app.js', '--dist', '2', '--file', file])
    const [url, body] = apiMock.post.mock.calls[0]
    expect(url).toBe(path)
    expect(body).toMatchObject({release: 'v1', dist: '2', generated_file: 'app.js', source_map: {x_closeyourit_functions: {version: 1, ranges: [{name: 'original'}]}}})
    expect(JSON.stringify(body)).not.toContain('privateSentinel')
    expect(JSON.stringify(result)).not.toContain('source_map')
    expect(stdout).toContain('v1')
    expect(stdout).not.toContain('privateSentinel')
  })

  it('rejects local input before any API call without echoing file contents', async () => {
    const file = join(dir, 'bad.map'); await writeFile(file, 'privateSentinel')
    const failure = await runExpectingExit(Upload, ['-p', PID, '--release', 'v1', '--generated-file', 'app.js', '--file', file, '--json'])
    expect(failure.stdout).not.toContain('privateSentinel')
    expect(failure.stdout).toContain('Invalid source map JSON')
    expect(apiMock.post).not.toHaveBeenCalled()
  })

  it.each([403, 409, 413, 422, 503])('propagates status %i without echoing upstream source diagnostics', async (status) => {
    const file = join(dir, 'app.map'); await writeFile(file, JSON.stringify({version: 3, sources: [], names: [], mappings: ''}))
    apiMock.post.mockRejectedValue(apiError(status, `R${status}-ARTIFACT-001`, 'privateSentinel', {source_map: 'privateSentinel'}))
    const failure = await runExpectingExit(Upload, ['-p', PID, '--release', 'v1', '--generated-file', 'app.js', '--file', file, '--json'])
    expect(failure.stdout).toContain(`R${status}-ARTIFACT-001`)
    expect(failure.stdout).not.toContain('privateSentinel')
  })

  it.each([[], [metadata], [metadata, {...metadata, id: 'map-2'}]].map((rows) => ({rows})))('lists zero, one or multiple rows', async ({rows}) => {
    apiMock.get.mockResolvedValue(envelope(rows, {page: 2, total_pages: 2}))
    const {result} = await runCaptured(List, ['-p', PID, '--page', '2', '--json'])
    expect(apiMock.get).toHaveBeenCalledWith(`${path}?page=2`)
    expect(result).toEqual(envelope(rows, {page: 2, total_pages: 2}))
  })

  it('prints a readable list and refuses invalid pagination', async () => {
    apiMock.get.mockResolvedValue(envelope([metadata]))
    expect((await runCaptured(List, ['-p', PID])).stdout).toContain('app.js')
    apiMock.get.mockClear()
    await runExpectingExit(List, ['-p', PID, '--page', '0'], 2)
    expect(apiMock.get).not.toHaveBeenCalled()
  })

  it('reads only metadata and escapes the artifact identifier in the scoped URL', async () => {
    apiMock.get.mockResolvedValue(envelope({...metadata, source_map: {mappings: 'secret'}}))
    const {stdout, result} = await runCaptured(Show, ['a/b', '-p', PID])
    expect(apiMock.get).toHaveBeenCalledWith(`${path}/a%2Fb`)
    expect(stdout).toContain('v1')
    expect(result).toEqual(envelope(metadata))
  })

  it('requires explicit deletion confirmation and sends confirm:true', async () => {
    await runExpectingExit(Delete, ['map-1', '-p', PID], 2)
    expect(apiMock.delete).not.toHaveBeenCalled()
    apiMock.delete.mockResolvedValue(envelope(null))
    const {result, stdout} = await runCaptured(Delete, ['map-1', '-p', PID, '--confirm'])
    expect(apiMock.delete).toHaveBeenCalledWith(`${path}/map-1`, {body: {confirm: true}})
    expect(result).toEqual({deleted: 'map-1'})
    expect(stdout).toContain('Deleted')
  })
})
