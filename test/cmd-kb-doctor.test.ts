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

import KbDoctor from '../src/commands/kb/doctor'
import {DOCTOR_CHECK_CODES, runDoctorChecks} from '../src/lib/knowledge-doctor'

/** A healthy page: no check must flag it. */
function healthy(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'pg-ok',
    title: 'Rails — la cache in prova',
    body: 'Testo della pagina.',
    status: 'published',
    projects: [{key: 'ACME', name: 'Acme'}],
    groups: [],
    consolidated_at: '2026-08-01T10:00:00+02:00',
    source_path: 'stacks/rails/cache.md',
    updated_at: '2026-09-01T10:00:00+02:00',
    created_at: '2026-08-01T10:00:00+02:00',
    ...overrides,
  }
}

/** The responses of the two reads the command makes: full list + archiving queue. */
function servePages(pages: Array<Record<string, unknown>>, awaiting: Array<Record<string, unknown>> = []): void {
  apiMock.get.mockImplementation(async (path: string) =>
    path.includes('awaiting_consolidation=1')
      ? envelope(awaiting, {page: 1, total_pages: 1})
      : envelope(pages, {page: 1, total_pages: 1}),
  )
}

const NOW = new Date('2026-09-03T12:00:00Z')

beforeEach(() => resetApiMock())

describe('kb doctor — scenario 1: general check', () => {
  it('lists every check with outcome, explanation and next step', async () => {
    servePages([healthy(), healthy({id: 'pg-vuota', title: 'Senza corpo', body: ''}), healthy({id: 'pg-orfana', title: 'Senza casa', projects: [], groups: []})])
    const {stdout} = await runExpectingExit(KbDoctor, [], 1)

    for (const code of DOCTOR_CHECK_CODES) expect(stdout).toContain(code)
    expect(stdout).toContain('orphan-scope')
    expect(stdout).toContain('Next step:')
    expect(stdout).toContain('pg-orfana')
    expect(stdout).toContain('pg-vuota')
  })

  it('exits non-zero only when a check fails, never for a warning', async () => {
    servePages([healthy(), healthy({id: 'pg-a', title: 'Doppio'}), healthy({id: 'pg-b', title: 'Doppio'})])
    const {stdout} = await runCaptured(KbDoctor, [])
    expect(stdout).toContain('duplicate-title')
  })
})

describe('kb doctor — scenario 2: all good', () => {
  it('declares all checks passed without inventing alarms', async () => {
    servePages([healthy()])
    const {stdout} = await runCaptured(KbDoctor, [])
    expect(stdout).not.toContain('🔴')
    expect(stdout).not.toContain('🟡')
    expect(stdout).toContain('🟢')
  })

  it('with zero pages flags nothing', async () => {
    servePages([])
    const {result} = await runCaptured(KbDoctor, ['--json'])
    const data = (result as {data: {checks: Array<{status: string}>; scanned: number}}).data
    expect(data.scanned).toBe(0)
    expect(data.checks.every((check) => check.status === 'ok' || check.status === 'skipped')).toBe(true)
  })
})

describe('kb doctor — scenario 3: read-only', () => {
  it('faced with a problem it writes nothing anywhere', async () => {
    servePages([healthy({id: 'pg-vuota', body: '   '})])
    await runExpectingExit(KbDoctor, [], 1)

    expect(apiMock.post).not.toHaveBeenCalled()
    expect(apiMock.put).not.toHaveBeenCalled()
    expect(apiMock.patch).not.toHaveBeenCalled()
    expect(apiMock.delete).not.toHaveBeenCalled()
    expect(apiMock.upload).not.toHaveBeenCalled()
  })
})

describe('kb doctor — machine-readable outcome', () => {
  it('with --json every check carries code, outcome, explanation and next step', async () => {
    servePages([healthy({id: 'pg-vuota', body: ''})])
    const {stdout} = await runExpectingExit(KbDoctor, ['--json'], 1)

    const payload = JSON.parse(stdout) as {data: {checks: Array<Record<string, unknown>>}}
    const checks = payload.data.checks
    expect(checks).toHaveLength(DOCTOR_CHECK_CODES.length)
    for (const check of checks) {
      expect(typeof check.code).toBe('string')
      expect(['ok', 'warning', 'fail', 'skipped']).toContain(check.status)
      expect(String(check.summary).length).toBeGreaterThan(0)
      expect(String(check.next_step).length).toBeGreaterThan(0)
    }

    const empty = checks.find((check) => check.code === 'empty-body')
    expect(empty?.status).toBe('fail')
    expect(empty?.count).toBe(1)
  })

  it('the summary counts failures and warnings', async () => {
    servePages([healthy({id: 'pg-a', title: 'Doppio'}), healthy({id: 'pg-b', title: 'Doppio'})])
    const {result} = await runCaptured(KbDoctor, ['--json'])
    const meta = (result as {meta: {failures: number; warnings: number}}).meta
    expect(meta.failures).toBe(0)
    expect(meta.warnings).toBe(1)
  })
})

describe('kb doctor — scan scope and cap', () => {
  it('passes the project to the service', async () => {
    servePages([healthy()])
    await runCaptured(KbDoctor, ['--project', 'ACME'])
    expect(apiMock.get).toHaveBeenCalledWith(expect.stringContaining('project=ACME'))
  })

  it('stops at the page cap and says so instead of implying it saw everything', async () => {
    apiMock.get.mockImplementation(async (path: string) =>
      path.includes('awaiting_consolidation=1')
        ? envelope([], {page: 1, total_pages: 1})
        : envelope([healthy({id: `pg-${path}`})], {page: 1, total_pages: 9}),
    )
    const {stdout} = await runCaptured(KbDoctor, ['--limit', '2'])
    expect(stdout).toContain('2 pages examined')
    expect(stdout).toContain('raise --limit')
  })

  it('rejects a cap below 1 without calling the service', async () => {
    await runExpectingExit(KbDoctor, ['--limit', '0'], 2)
    expect(apiMock.get).not.toHaveBeenCalled()
  })


  it('rejects a documents root that is not a folder, instead of saying everything is missing', async () => {
    await runExpectingExit(KbDoctor, ['--docs-root', '/percorso/che/non/esiste'], 2)
    expect(apiMock.get).not.toHaveBeenCalled()
  })

  it('with --project the organization-scope checks are reported as skipped, not passed', async () => {
    servePages([healthy({id: 'pg-a', title: 'Doppio'}), healthy({id: 'pg-b', title: 'Doppio'})])
    const {result} = await runCaptured(KbDoctor, ['--project', 'ACME', '--json'])
    const checks = (result as {data: {checks: Array<{code: string; status: string}>}}).data.checks
    expect(checks.find((check) => check.code === 'duplicate-title')?.status).toBe('skipped')
    expect(checks.find((check) => check.code === 'dangling-link')?.status).toBe('skipped')
  })

  it('an unreachable service exits with its code', async () => {
    apiMock.get.mockRejectedValue(apiError(401, 'R401-AUTH-001', 'token scaduto'))
    const {stderr} = await runExpectingExit(KbDoctor, [], 1)
    expect(stderr).toContain('R401-AUTH-001: token scaduto')
  })
})

describe('checks', () => {
  const check = (pages: Array<Record<string, unknown>>, code: string, opts: Record<string, unknown> = {}) =>
    runDoctorChecks({awaitingConsolidation: [], now: NOW, pages, staleDays: 30, ...opts}).find((c) => c.code === code)!

  it('flags the page without a body, which no search can find', () => {
    const result = check([healthy({id: 'pg-vuota', body: '\n  \n'})], 'empty-body')
    expect(result.status).toBe('fail')
    expect(result.pages.map((page) => page.id)).toEqual(['pg-vuota'])
  })

  it('warns about the page without project or group without treating it as a failure: the domain allows it', () => {
    const result = check([healthy({id: 'pg-orfana', projects: [], groups: []})], 'orphan-scope')
    expect(result.status).toBe('warning')
    expect(result.count).toBe(1)
    expect(result.summary).toContain('full access')
  })

  it('does not flag as orphan the page that has at least one group', () => {
    const result = check([healthy({projects: [], groups: ['Piattaforma']})], 'orphan-scope')
    expect(result.status).toBe('ok')
  })

  it('flags duplicate titles, which break every link citing them', () => {
    const result = check([healthy({id: 'pg-a', title: 'Stesso Titolo'}), healthy({id: 'pg-b', title: 'stesso titolo '})], 'duplicate-title')
    expect(result.status).toBe('warning')
    expect(result.pages).toHaveLength(2)
  })

  it('flags the dangling link to a page that does not exist', () => {
    const pages = [healthy({id: 'pg-1', body: 'Vedi [[Pagina Fantasma]] e [[Rails — la cache in prova]].'}), healthy()]
    const result = check(pages, 'dangling-link')
    expect(result.status).toBe('warning')
    expect(result.pages).toHaveLength(1)
    expect(result.pages[0].detail).toContain('Pagina Fantasma')
    expect(result.pages[0].detail).not.toContain('cache in prova')
  })

  it('does not read links written inside code, which are sample text', () => {
    const body = ['Esempio:', '```', '[[Pagina Fantasma]]', '```', 'e `[[Altra Fantasma]]` inline.'].join('\n')
    const result = check([healthy({id: 'pg-1', body})], 'dangling-link')
    expect(result.status).toBe('ok')
  })

  it('counts a dangling link only once even if the page repeats it', () => {
    const result = check([healthy({id: 'pg-1', body: '[[Fantasma]] e ancora [[fantasma]] e [[Fantasma|con etichetta]]'})], 'dangling-link')
    expect(result.pages).toHaveLength(1)
    expect(result.pages[0].detail).toBe('Fantasma')
  })

  it('flags the proposal stuck for more days than allowed', () => {
    const stale = healthy({id: 'pg-stale', status: 'in_review', updated_at: '2026-07-01T10:00:00Z', consolidated_at: null, source_path: null})
    const fresh = healthy({id: 'pg-fresh', status: 'in_review', updated_at: '2026-09-01T10:00:00Z', consolidated_at: null, source_path: null})
    const result = check([stale, fresh], 'stale-review')
    expect(result.status).toBe('warning')
    expect(result.pages.map((page) => page.id)).toEqual(['pg-stale'])
  })

  it('does not declare stuck a proposal whose date it does not know', () => {
    const result = check([healthy({id: 'pg-no-date', status: 'in_review', updated_at: null, created_at: null, consolidated_at: null, source_path: null})], 'stale-review')
    expect(result.status).toBe('ok')
  })

  it('flags the accepted page never archived for weeks, using the service list', () => {
    const waiting = healthy({id: 'pg-waiting', consolidated_at: null, source_path: null, updated_at: '2026-06-01T10:00:00Z'})
    const result = check([waiting], 'stale-consolidation', {awaitingConsolidation: [waiting]})
    expect(result.status).toBe('warning')
    expect(result.pages.map((page) => page.id)).toEqual(['pg-waiting'])
  })

  it('flags an archive path and date that do not agree', () => {
    const result = check([healthy({id: 'pg-incoerente', source_path: 'global/git.md', consolidated_at: null})], 'inconsistent-consolidation')
    expect(result.status).toBe('fail')
  })

  it('without the documents root skips the file check and says how to run it', () => {
    const result = check([healthy()], 'missing-source-file')
    expect(result.status).toBe('skipped')
    expect(result.next_step).toContain('--docs-root')
  })

  it('with the documents root flags the file that is not there', () => {
    const exists = (path: string) => path.endsWith('c-e.md')
    const pages = [healthy({id: 'pg-c-e', source_path: 'global/c-e.md'}), healthy({id: 'pg-manca', source_path: 'global/manca.md'})]
    const result = check(pages, 'missing-source-file', {docsRoot: '/docs', fileExists: exists})
    expect(result.status).toBe('fail')
    expect(result.pages.map((page) => page.id)).toEqual(['pg-manca'])
  })


  it('with the scope narrowed to a project skips the checks the service resolves across the whole organization', () => {
    const pages = [healthy({id: 'pg-a', title: 'Doppio'}), healthy({id: 'pg-b', title: 'Doppio', body: '[[Fantasma]]'})]
    const checks = runDoctorChecks({awaitingConsolidation: [], now: NOW, pages, scopedToProject: true, staleDays: 30})
    for (const code of ['duplicate-title', 'dangling-link']) {
      const entry = checks.find((c) => c.code === code)!
      expect(entry.status).toBe('skipped')
      expect(entry.count).toBe(0)
      expect(entry.next_step).toContain('--project')
    }
  })

  it('says a dangling link may be so only in appearance, if the target was renamed', () => {
    const result = check([healthy({body: '[[Fantasma]]'})], 'dangling-link')
    expect(result.summary).toContain('renamed')
  })

  it('does not accept a folder in place of the archived document', () => {
    const result = check([healthy({id: 'pg-cartella', source_path: 'global'})], 'missing-source-file', {
      docsRoot: '/docs',
      // The path exists on disk, but it is a folder: `isFile` is what the check must ask.
      fileExists: () => false,
    })
    expect(result.status).toBe('fail')
    expect(result.pages.map((page) => page.id)).toEqual(['pg-cartella'])
  })

  it('flags the path that escapes the documents root', () => {
    const result = check([healthy({id: 'pg-fuga', source_path: '../../etc/passwd'})], 'missing-source-file', {
      docsRoot: '/docs',
      fileExists: () => true,
    })
    expect(result.status).toBe('fail')
    expect(result.pages[0].detail).toContain('outside')
  })
})
