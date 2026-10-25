import {beforeEach, describe, expect, it, vi} from 'vitest'
import {apiMock, resetApiMock} from './helpers/api-mock'
import {apiError, envelope, runCaptured, runExpectingExit} from './helpers/command'
import {readFile, writeFile} from 'node:fs/promises'

vi.mock('../src/lib/api', async (io) => {
  const actual = await io<typeof import('../src/lib/api')>()
  const {apiMock} = await import('./helpers/api-mock')
  return {...actual, CliApi: vi.fn(function () { return apiMock })}
})
vi.mock('../src/lib/config', async (io) => {
  const actual = await io<typeof import('../src/lib/config')>()
  return {...actual, loadConfig: vi.fn(() => ({apiUrl: 'https://api.test', token: 'tok_test'}))}
})
vi.mock('node:fs/promises', () => ({readFile: vi.fn(), writeFile: vi.fn()}))

import KbAttach from '../src/commands/kb/attach'
import KbAttachmentDownload from '../src/commands/kb/attachment-download'
import KbAttachments from '../src/commands/kb/attachments'
import KbDetach from '../src/commands/kb/detach'

const ID = 'pg-1'

beforeEach(() => {
  resetApiMock()
  vi.mocked(readFile).mockReset()
  vi.mocked(writeFile).mockReset()
})

describe('kb attachments', () => {
  it('lists the page attachments', async () => {
    apiMock.get.mockResolvedValue(
      envelope([{id: 'a1', filename: 'rollback.sh', content_type: 'text/x-sh', byte_size: 120, script: true}]),
    )
    const {stdout} = await runCaptured(KbAttachments, [ID])
    expect(apiMock.get).toHaveBeenCalledWith(`/cli/v1/knowledge/pages/${ID}/attachments?page=1&per=100`)
    expect(stdout).toContain('rollback.sh')
  })

  it('collects all the pages instead of stopping at the first', async () => {
    apiMock.get.mockImplementation((path: string) =>
      Promise.resolve(
        path.includes('page=1')
          ? envelope([{id: 'a1', filename: 'primo.sh'}], {total_pages: 2})
          : envelope([{id: 'a2', filename: 'centouno.sh'}], {total_pages: 2}),
      ),
    )
    const {result, stdout} = await runCaptured(KbAttachments, [ID])
    expect(apiMock.get).toHaveBeenCalledWith(`/cli/v1/knowledge/pages/${ID}/attachments?page=2&per=100`)
    expect((result as {data: unknown[]}).data).toHaveLength(2)
    expect(stdout).toContain('centouno.sh')
    // The list is complete: the "there is more" footer would point to a --page that does not exist.
    expect(stdout).not.toContain('Use --page')
  })

  it('marks executable attachments as scripts', async () => {
    apiMock.get.mockResolvedValue(envelope([{id: 'a1', filename: 'run.sh', script: true}]))
    const {stdout} = await runCaptured(KbAttachments, [ID])
    expect(stdout).toContain('yes')
  })

  it('renders empty cells for a row without fields', async () => {
    apiMock.get.mockResolvedValue(envelope([{}]))
    const {result} = await runCaptured(KbAttachments, [ID])
    expect((result as {data: unknown[]}).data).toHaveLength(1)
  })

  it("with --json returns the envelope and does not print the table", async () => {
    apiMock.get.mockResolvedValue(envelope([{id: 'a1', filename: 'x.png'}]))
    const {result, stdout} = await runCaptured(KbAttachments, [ID, '--json'])
    expect((result as {data: unknown[]}).data).toHaveLength(1)
    expect(stdout).not.toContain('FILENAME')
  })

  it('exits non-zero on an API error', async () => {
    apiMock.get.mockRejectedValue(apiError(404, 'R404-KNOWLEDGE-002', 'not found'))
    const {stderr} = await runExpectingExit(KbAttachments, [ID])
    expect(stderr).toContain('R404-KNOWLEDGE-002')
  })
})

describe('kb attach', () => {
  it('reads the files and uploads them as multipart to the page', async () => {
    vi.mocked(readFile).mockResolvedValue(Buffer.from('#!/bin/sh'))
    apiMock.upload.mockResolvedValue(envelope([{id: 'a1', filename: 'rollback.sh'}]))
    const {stdout} = await runCaptured(KbAttach, [ID, '--file', './rollback.sh'])
    expect(vi.mocked(readFile)).toHaveBeenCalledWith('./rollback.sh')
    const [method, path, files] = apiMock.upload.mock.calls[0] as [string, string, Array<{field: string; filename: string}>]
    expect(method).toBe('POST')
    expect(path).toBe(`/cli/v1/knowledge/pages/${ID}/attachments`)
    expect(files[0].field).toBe('files[]')
    expect(files[0].filename).toBe('rollback.sh')
    expect(stdout).toContain('Attached 1 file')
  })

  it('uploads several files in a single call', async () => {
    vi.mocked(readFile).mockResolvedValue(Buffer.from('x'))
    apiMock.upload.mockResolvedValue(envelope([{id: 'a1'}, {id: 'a2'}]))
    const {stdout} = await runCaptured(KbAttach, [ID, '--file', './a.txt', '--file', './b.txt'])
    const [, , files] = apiMock.upload.mock.calls[0] as [string, string, Array<{filename: string}>]
    expect(files.map((file) => file.filename)).toEqual(['a.txt', 'b.txt'])
    expect(apiMock.upload).toHaveBeenCalledTimes(1)
    expect(stdout).toContain('Attached 2 files')
  })

  it('exits 2 when a file is not readable, without uploading anything', async () => {
    vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'))
    const {message} = await runExpectingExit(KbAttach, [ID, '--file', './missing.sh'], 2)
    expect(message).toContain('File not found or unreadable')
    expect(apiMock.upload).not.toHaveBeenCalled()
  })

  it("with --json returns the envelope", async () => {
    vi.mocked(readFile).mockResolvedValue(Buffer.from('x'))
    apiMock.upload.mockResolvedValue(envelope([{id: 'a1'}]))
    const {result, stdout} = await runCaptured(KbAttach, [ID, '--file', './a.txt', '--json'])
    expect((result as {data: unknown[]}).data).toHaveLength(1)
    expect(stdout).not.toContain('Attached')
  })

  it('exits non-zero when the server rejects the file', async () => {
    vi.mocked(readFile).mockResolvedValue(Buffer.from('x'))
    apiMock.upload.mockRejectedValue(apiError(422, 'R422-KNOWLEDGE-008', 'file non ammesso'))
    const {stderr} = await runExpectingExit(KbAttach, [ID, '--file', './a.exe'])
    expect(stderr).toContain('R422-KNOWLEDGE-008')
  })
})

describe('kb attachment-download', () => {
  it('writes the bytes to the chosen name', async () => {
    apiMock.download.mockResolvedValue({data: new Uint8Array([1, 2, 3, 4]), filename: 'server.sh'})
    const {result, stdout} = await runCaptured(KbAttachmentDownload, [
      ID, 'a1', '--out', '/tmp/cyi', '--filename', 'custom.sh',
    ])
    expect(apiMock.download).toHaveBeenCalledWith(`/cli/v1/knowledge/pages/${ID}/attachments/a1/download`)
    expect(vi.mocked(writeFile)).toHaveBeenCalledWith('/tmp/cyi/custom.sh', expect.any(Uint8Array))
    expect((result as {bytes: number}).bytes).toBe(4)
    expect(stdout).toContain('Saved 4 bytes')
  })

  it('falls back to the name the server sends', async () => {
    apiMock.download.mockResolvedValue({data: new Uint8Array([1]), filename: 'server.sh'})
    await runCaptured(KbAttachmentDownload, [ID, 'a1'])
    expect(vi.mocked(writeFile)).toHaveBeenCalledWith('server.sh', expect.any(Uint8Array))
  })

  it('does not let a server-sent name escape the chosen folder', async () => {
    apiMock.download.mockResolvedValue({data: new Uint8Array([1]), filename: '../../etc/cron.d/payload'})
    await runCaptured(KbAttachmentDownload, [ID, 'a1', '--out', '/tmp/cyi'])
    expect(vi.mocked(writeFile)).toHaveBeenCalledWith('/tmp/cyi/payload', expect.any(Uint8Array))
  })

  it("falls back to the attachment id when no name is known", async () => {
    apiMock.download.mockResolvedValue({data: new Uint8Array([1]), filename: undefined})
    await runCaptured(KbAttachmentDownload, [ID, 'a1'])
    expect(vi.mocked(writeFile)).toHaveBeenCalledWith('a1', expect.any(Uint8Array))
  })

  it('exits non-zero on an API error', async () => {
    apiMock.download.mockRejectedValue(apiError(404, 'R404-KNOWLEDGE-002', 'not found'))
    const {stderr} = await runExpectingExit(KbAttachmentDownload, [ID, 'a1'])
    expect(stderr).toContain('R404-KNOWLEDGE-002')
    expect(vi.mocked(writeFile)).not.toHaveBeenCalled()
  })
})

describe('kb detach', () => {
  it('rejects without --confirm', async () => {
    const {message} = await runExpectingExit(KbDetach, [ID, '--attachment', 'a1'], 2)
    expect(message).toContain('Refusing to delete')
    expect(apiMock.delete).not.toHaveBeenCalled()
  })

  it("deletes the attachment with --confirm", async () => {
    apiMock.delete.mockResolvedValue(envelope({}))
    const {result, stdout} = await runCaptured(KbDetach, [ID, '--attachment', 'a1', '--confirm'])
    expect(apiMock.delete).toHaveBeenCalledWith(`/cli/v1/knowledge/pages/${ID}/attachments/a1`)
    expect((result as {detached: string}).detached).toBe('a1')
    expect(stdout).toContain('Removed attachment a1')
  })

  it('exits non-zero on an API error', async () => {
    apiMock.delete.mockRejectedValue(apiError(403, 'R403-CLIAUTH-002', 'forbidden'))
    const {stderr} = await runExpectingExit(KbDetach, [ID, '--attachment', 'a1', '--confirm'])
    expect(stderr).toContain('R403-CLIAUTH-002')
  })
})
