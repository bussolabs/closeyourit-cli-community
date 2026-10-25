import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
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
vi.mock('../src/lib/git', () => ({parseRepoSlug: vi.fn(), repoSlug: vi.fn()}))

import KbContext from '../src/commands/kb/context'
import {repoSlug} from '../src/lib/git'

const CONTEXT_PATH = '/cli/v1/knowledge/context?project=ACME&per=10'
const MAP_PATH = '/cli/v1/projects/github-map?page=1&per=100&connected_only=true'

const PAGES = [
  {id: 'pg-1', title: 'Rollback di un deploy', kind: 'guide'},
  {id: 'pg-2', title: 'Perché due database', kind: 'decision'},
]

beforeEach(() => {
  resetApiMock()
  vi.mocked(repoSlug).mockReset()
  vi.mocked(repoSlug).mockResolvedValue(undefined)
  delete process.env.KB_CONTEXT_DISABLE
})

afterEach(() => {
  delete process.env.KB_CONTEXT_DISABLE
})

describe('kb context — scenario 1: inside a project', () => {
  it('prints the short list of pages of the given project', async () => {
    apiMock.get.mockResolvedValue(envelope({project: {key: 'ACME'}, pages: PAGES}))
    const {stdout} = await runCaptured(KbContext, ['--project', 'ACME'])
    expect(apiMock.get).toHaveBeenCalledWith(CONTEXT_PATH, expect.any(Object))
    expect(stdout).toContain('ACME')
    expect(stdout).toContain('Rollback di un deploy')
    expect(stdout).toContain('pg-2')
    expect(stdout).toContain('[decision]')
  })

  it('resolves the project from the git remote when --project is missing', async () => {
    vi.mocked(repoSlug).mockResolvedValue('bussolabs/acme-api')
    apiMock.get
      .mockResolvedValueOnce(
        envelope([{project_key: 'OTHER', repository: {full_name: 'bussolabs/other'}}, {project_key: 'ACME', repository: {full_name: 'BussoLabs/Acme-Api'}}]),
      )
      .mockResolvedValueOnce(envelope({pages: PAGES}))
    const {stdout} = await runCaptured(KbContext, [])
    expect(apiMock.get).toHaveBeenNthCalledWith(1, MAP_PATH, expect.any(Object))
    expect(apiMock.get).toHaveBeenNthCalledWith(2, CONTEXT_PATH, expect.any(Object))
    expect(stdout).toContain('Rollback di un deploy')
  })

  it('looks for the match beyond the first page of the GitHub map too', async () => {
    vi.mocked(repoSlug).mockResolvedValue('bussolabs/acme-api')
    apiMock.get
      .mockResolvedValueOnce(envelope([{project_key: 'OTHER', repository: {full_name: 'bussolabs/other'}}], {total_pages: 2}))
      .mockResolvedValueOnce(envelope([{project_key: 'ACME', repository: {full_name: 'bussolabs/acme-api'}}], {total_pages: 2}))
      .mockResolvedValueOnce(envelope({pages: PAGES}))
    await runCaptured(KbContext, [])
    expect(apiMock.get).toHaveBeenNthCalledWith(2, '/cli/v1/projects/github-map?page=2&per=100&connected_only=true', expect.any(Object))
    expect(apiMock.get).toHaveBeenNthCalledWith(3, CONTEXT_PATH, expect.any(Object))
  })

  it('uses the project id when the map does not carry the key', async () => {
    vi.mocked(repoSlug).mockResolvedValue('bussolabs/acme-api')
    apiMock.get
      .mockResolvedValueOnce(envelope([{project_id: 'prj-9', repository: {full_name: 'bussolabs/acme-api'}}]))
      .mockResolvedValueOnce(envelope({pages: PAGES}))
    await runCaptured(KbContext, [])
    expect(apiMock.get).toHaveBeenNthCalledWith(2, '/cli/v1/knowledge/context?project=prj-9&per=10', expect.any(Object))
  })

  it('with --timeout 0 sets no wait cap', async () => {
    apiMock.get.mockResolvedValue(envelope({pages: PAGES}))
    await runCaptured(KbContext, ['--project', 'ACME', '--timeout', '0'])
    expect(apiMock.get).toHaveBeenCalledWith(CONTEXT_PATH, {})
  })

  it('also accepts a response that is directly the list of pages', async () => {
    apiMock.get.mockResolvedValue(envelope(PAGES))
    const {stdout} = await runCaptured(KbContext, ['--project', 'ACME'])
    expect(stdout).toContain('Perché due database')
  })

  it('forwards --limit as per and uses it as the list cap', async () => {
    apiMock.get.mockResolvedValue(envelope({pages: PAGES}))
    const {stdout} = await runCaptured(KbContext, ['--project', 'ACME', '--limit', '1'])
    expect(apiMock.get).toHaveBeenCalledWith('/cli/v1/knowledge/context?project=ACME&per=1', expect.any(Object))
    expect(stdout).toContain('Rollback di un deploy')
    expect(stdout).not.toContain('Perché due database')
  })

  it('rejects a --limit below 1 without calling the server', async () => {
    const {message} = await runExpectingExit(KbContext, ['--project', 'ACME', '--limit', '0'], 2)
    expect(message).toContain('--limit')
    expect(apiMock.get).not.toHaveBeenCalled()
  })

  it('says the project has no pages yet instead of printing an empty list', async () => {
    apiMock.get.mockResolvedValue(envelope({pages: []}))
    const {stdout} = await runCaptured(KbContext, ['--project', 'ACME'])
    expect(stdout).toContain('No knowledge pages')
  })

  it('falls back to the page list when the server does not expose the context yet', async () => {
    apiMock.get
      .mockRejectedValueOnce(apiError(404, 'C404-API-000', 'Request failed (404)'))
      .mockResolvedValueOnce(envelope(PAGES))
    const {stdout} = await runCaptured(KbContext, ['--project', 'ACME'])
    expect(apiMock.get).toHaveBeenNthCalledWith(2, '/cli/v1/knowledge/pages?page=1&per=10&project=ACME', expect.any(Object))
    expect(stdout).toContain('Rollback di un deploy')
  })

  it('falls back also when the missing route shows up as an internal failure', async () => {
    apiMock.get
      .mockRejectedValueOnce(apiError(500, 'C000-NET-001', 'Request failed (500)'))
      .mockResolvedValueOnce(envelope(PAGES))
    const {stdout} = await runCaptured(KbContext, ['--project', 'ACME'])
    expect(apiMock.get).toHaveBeenNthCalledWith(2, '/cli/v1/knowledge/pages?page=1&per=10&project=ACME', expect.any(Object))
    expect(stdout).toContain('Rollback di un deploy')
  })

  it('does not fall back on an internal failure the backend reported itself', async () => {
    apiMock.get.mockRejectedValue(apiError(500, 'R500-SYS-001', 'Internal error'))
    const {stderr} = await runExpectingExit(KbContext, ['--project', 'ACME'])
    expect(apiMock.get).toHaveBeenCalledTimes(1)
    expect(stderr).toContain('R500-SYS-001')
  })

  it('does not fall back on an error that is not a missing route', async () => {
    apiMock.get.mockRejectedValue(apiError(403, 'R403-AUTH-001', 'Permesso negato'))
    const {stderr} = await runExpectingExit(KbContext, ['--project', 'ACME'])
    expect(apiMock.get).toHaveBeenCalledTimes(1)
    expect(stderr).toContain('R403-AUTH-001')
  })

  it('with --json returns the envelope and does not print the list', async () => {
    apiMock.get.mockResolvedValue(envelope({pages: PAGES}))
    const {result, stdout} = await runCaptured(KbContext, ['--project', 'ACME', '--json'])
    expect((result as {data: {pages: unknown[]}}).data.pages).toHaveLength(2)
    expect(stdout).not.toContain('📚 Knowledge')
  })

  it('with --json honours the cap in the envelope too', async () => {
    apiMock.get.mockResolvedValue(envelope({project: {key: 'ACME'}, pages: PAGES}))
    const {result} = await runCaptured(KbContext, ['--project', 'ACME', '--limit', '1', '--json'])
    expect((result as {data: {pages: unknown[]; project: unknown}}).data.pages).toHaveLength(1)
    expect((result as {data: {project: {key: string}}}).data.project.key).toBe('ACME')
  })

  it('with --json honours the cap also on a response that is already a list', async () => {
    apiMock.get.mockResolvedValue(envelope(PAGES))
    const {result} = await runCaptured(KbContext, ['--project', 'ACME', '--limit', '1', '--json'])
    expect((result as {data: unknown[]}).data).toHaveLength(1)
  })
})

describe('kb context — scenario 2: outside a project', () => {
  it('does not call the knowledge when the folder has no git remote', async () => {
    const {stdout} = await runCaptured(KbContext, [])
    expect(apiMock.get).not.toHaveBeenCalled()
    expect(stdout).toContain('No CloseYourIt project')
  })

  it('does not call the knowledge when no project matches the repository', async () => {
    vi.mocked(repoSlug).mockResolvedValue('bussolabs/sconosciuto')
    apiMock.get.mockResolvedValue(envelope([{project_key: 'ACME', repository: {full_name: 'bussolabs/acme-api'}}]))
    const {stdout} = await runCaptured(KbContext, [])
    expect(apiMock.get).toHaveBeenCalledTimes(1)
    expect(stdout).not.toContain('Knowledge')
  })

  it('handles a map without data without looking up the knowledge', async () => {
    vi.mocked(repoSlug).mockResolvedValue('bussolabs/acme-api')
    apiMock.get.mockResolvedValue(envelope(undefined))
    const {stdout} = await runCaptured(KbContext, [])
    expect(apiMock.get).toHaveBeenCalledTimes(1)
    expect(stdout).toContain('No CloseYourIt project')
  })

  it('with --quiet prints nothing and does not fail', async () => {
    const {result, stdout} = await runCaptured(KbContext, ['--quiet'])
    expect(stdout).toBe('')
    expect((result as {data: {pages: unknown[]}}).data.pages).toHaveLength(0)
  })
})

describe('kb context — scenario 3: service unreachable', () => {
  it('with --quiet prints a single line and exits zero', async () => {
    apiMock.get.mockRejectedValue(apiError(0, 'C000-NET-001', 'Request to https://api.test failed'))
    const {stdout} = await runExpectingExit(KbContext, ['--project', 'ACME', '--quiet'], 0)
    expect(stdout.split('\n').filter(Boolean)).toHaveLength(1)
    expect(stdout).toContain('unavailable')
  })

  it('with --quiet and --json emits the empty envelope instead of the human line', async () => {
    apiMock.get.mockRejectedValue(apiError(0, 'C000-NET-001', 'boom'))
    const {stdout} = await runExpectingExit(KbContext, ['--project', 'ACME', '--quiet', '--json'], 0)
    expect(stdout).not.toContain('Knowledge context unavailable')
    expect(JSON.parse(stdout).data.unavailable).toBe(true)
  })

  it('without --quiet it stays a visible error with its code', async () => {
    apiMock.get.mockRejectedValue(apiError(0, 'C000-NET-001', 'boom'))
    const {stderr} = await runExpectingExit(KbContext, ['--project', 'ACME'])
    expect(stderr).toContain('C000-NET-001')
  })

  it('a failing fallback stays silent with --quiet too', async () => {
    apiMock.get
      .mockRejectedValueOnce(apiError(404, 'C404-API-000', 'Request failed (404)'))
      .mockRejectedValueOnce(apiError(404, 'R404-KNOWLEDGE-001', 'Project not found'))
    const {stdout} = await runExpectingExit(KbContext, ['--project', 'NOPE', '--quiet'], 0)
    expect(stdout).toContain('unavailable')
  })
})

describe('kb context — kill switch', () => {
  it('with KB_CONTEXT_DISABLE=1 does nothing and does not call the server', async () => {
    process.env.KB_CONTEXT_DISABLE = '1'
    const {stdout} = await runCaptured(KbContext, ['--project', 'ACME'])
    expect(apiMock.get).not.toHaveBeenCalled()
    expect(stdout).toBe('')
    expect(vi.mocked(repoSlug)).not.toHaveBeenCalled()
  })

  it('with KB_CONTEXT_DISABLE=1 stays silent even if the command line is wrong', async () => {
    process.env.KB_CONTEXT_DISABLE = '1'
    const {stdout} = await runCaptured(KbContext, ['--flag-che-non-esiste'])
    expect(apiMock.get).not.toHaveBeenCalled()
    expect(stdout).toBe('')
  })

  it('a value other than 1 disables nothing', async () => {
    process.env.KB_CONTEXT_DISABLE = '0'
    apiMock.get.mockResolvedValue(envelope({pages: PAGES}))
    const {stdout} = await runCaptured(KbContext, ['--project', 'ACME'])
    expect(stdout).toContain('Rollback di un deploy')
  })
})
