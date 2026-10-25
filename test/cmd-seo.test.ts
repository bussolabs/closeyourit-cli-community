import {beforeEach, describe, expect, it, vi} from 'vitest'
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

import SeoIgnore from '../src/commands/seo/ignore'
import SeoList from '../src/commands/seo/list'
import SeoPages from '../src/commands/seo/pages'
import SeoPromote from '../src/commands/seo/promote'
import SeoReopen from '../src/commands/seo/reopen'
import SeoRescan from '../src/commands/seo/rescan'
import SeoShow from '../src/commands/seo/show'
import SeoSitesCreate from '../src/commands/seo-sites/create'
import SeoSitesDelete from '../src/commands/seo-sites/delete'
import SeoSitesList from '../src/commands/seo-sites/list'
import SeoSitesShow from '../src/commands/seo-sites/show'
import SeoSitesUpdate from '../src/commands/seo-sites/update'

const ISSUE = 'si-1'
const SITE = 'ss-1'

const ROW = {
  id: ISSUE,
  check_key: 'missing_h1',
  label: 'The main heading is missing',
  severity: 'high',
  status: 'open',
  area: 'structure',
  url: 'https://www.acme.example/about',
  evidence: {url: 'https://www.acme.example/about', found: 0},
  project: {id: PID, key: 'ACME', name: 'acme-site'},
  site: {id: SITE, base_url: 'https://www.acme.example', environment: 'production'},
}

const SITE_ROW = {
  id: SITE,
  base_url: 'https://www.acme.example',
  frequency: 'daily',
  enabled: true,
  max_pages: 100,
  open_issues_count: 3,
  last_audited_at: '2026-08-15T02:00:00Z',
  last_error: null,
  project: {id: PID, key: 'ACME', name: 'acme-site'},
  environment: {id: 'env-1', code: 'production', label: 'Production'},
}

// A site card: the list row plus the blocks only the detail carries.
const SITE_DETAIL = {
  ...SITE_ROW,
  follow_sitemap: true,
  next_audit_at: '2026-08-22T02:00:00Z',
  open_issues: {critical: 1, high: 2, medium: 5, low: 0},
  last_audit: {
    started_at: '2026-08-15T02:00:00Z',
    finished_at: '2026-08-15T02:04:11Z',
    pages_visited: 42,
    new_issues: 3,
    error: null,
  },
  vitals: {lcp_ms: 2100, cls: 0.04, inp_ms: 180, sampled_at: '2026-08-15T02:04:11Z'},
}

beforeEach(() => resetApiMock())

describe('seo list', () => {
  // The point of the command: one call covers every site, no --project needed.
  it('lists across every visible project without --project', async () => {
    apiMock.get.mockResolvedValue(envelope([ROW]))
    const {stdout} = await runCaptured(SeoList, [])
    expect(apiMock.get).toHaveBeenCalledWith('/cli/v1/seo?page=1')
    expect(stdout).toContain('missing_h1')
    expect(stdout).toContain('ACME')
  })

  // Every other subcommand takes the id as its argument: without it in the table, triaging what you
  // are looking at means rerunning with --json.
  it('prints the id, so list → ignore/promote works without --json', async () => {
    apiMock.get.mockResolvedValue(envelope([ROW]))
    const {stdout} = await runCaptured(SeoList, [])
    expect(stdout).toContain(ISSUE)
  })

  it('adds every filter to the query', async () => {
    apiMock.get.mockResolvedValue(envelope([]))
    await runCaptured(SeoList, [
      '--project', PID, '--severity', 'critical', '--status', 'open', '--area', 'indexability', '--page', '2',
    ])
    expect(apiMock.get).toHaveBeenCalledWith(
      `/cli/v1/seo?page=2&project_id=${PID}&severity=critical&status=open&area=indexability`,
    )
  })

  // A site-wide finding (duplicate titles, unreachable sitemap) has no single URL: the column must
  // say what it is, not print "undefined".
  it('marks a finding that belongs to the whole site', async () => {
    apiMock.get.mockResolvedValue(envelope([{...ROW, url: null, check_key: 'duplicate_title'}]))
    const {stdout} = await runCaptured(SeoList, [])
    expect(stdout).toContain('whole site')
  })

  it('renders an empty list without blowing up', async () => {
    apiMock.get.mockResolvedValue(envelope([]))
    const {stdout} = await runCaptured(SeoList, [])
    expect(stdout).toContain('CHECK')
  })

  it('exits non-zero on an API error', async () => {
    apiMock.get.mockRejectedValue(apiError(403, 'R403-CLIAUTH-002', 'forbidden'))
    const {stderr} = await runExpectingExit(SeoList, [])
    expect(stderr).toContain('R403-CLIAUTH-002')
  })
})

describe('seo show', () => {
  it('prints the evidence in a block of its own', async () => {
    apiMock.get.mockResolvedValue(envelope(ROW))
    const {stdout} = await runCaptured(SeoShow, [ISSUE])
    expect(apiMock.get).toHaveBeenCalledWith(`/cli/v1/seo/${ISSUE}`)
    expect(stdout).toContain('Evidence')
    expect(stdout).toContain('https://www.acme.example/about')
    expect(stdout).toContain('Site')
  })
})

describe('seo pages', () => {
  it('lists the visited pages and says when an h1 is missing', async () => {
    apiMock.get.mockResolvedValue(envelope([
      {path: '/about', status_code: 200, title: 'About', h1s: [], word_count: 88, project: {key: 'ACME'}},
    ]))
    const {stdout} = await runCaptured(SeoPages, [])
    expect(apiMock.get).toHaveBeenCalledWith('/cli/v1/seo/pages?page=1')
    expect(stdout).toContain('/about')
    expect(stdout).toContain('missing')
  })

  it('filters by project and url', async () => {
    apiMock.get.mockResolvedValue(envelope([]))
    await runCaptured(SeoPages, ['--project', PID, '--url', '/prezzi'])
    expect(apiMock.get).toHaveBeenCalledWith(`/cli/v1/seo/pages?page=1&project_id=${PID}&url=%2Fprezzi`)
  })
})

describe('seo triage', () => {
  it('ignore → PUT .../ignore with the note', async () => {
    apiMock.put.mockResolvedValue(envelope({}))
    const {stdout} = await runCaptured(SeoIgnore, [ISSUE, '--note', 'Service page.'])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/seo/${ISSUE}/ignore`, {triage_note: 'Service page.'})
    expect(stdout).toContain('ignored')
  })

  it('reopen → DELETE .../ignore (reopening is deleting the ignore)', async () => {
    apiMock.delete.mockResolvedValue(envelope({}))
    const {stdout} = await runCaptured(SeoReopen, [ISSUE])
    expect(apiMock.delete).toHaveBeenCalledWith(`/cli/v1/seo/${ISSUE}/ignore`)
    expect(stdout).toContain('reopened')
  })

  it('promote → PUT .../promotion and prints the ticket', async () => {
    apiMock.put.mockResolvedValue(envelope({id: 't-1', code: 'CYRA-600'}))
    const {stdout} = await runCaptured(SeoPromote, [ISSUE])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/seo/${ISSUE}/promotion`)
    expect(stdout).toContain('CYRA-600')
  })

  it('promoting twice surfaces the server-side idempotency error', async () => {
    apiMock.put.mockRejectedValue(apiError(422, 'R422-SEO-001', 'already promoted'))
    const {stderr} = await runExpectingExit(SeoPromote, [ISSUE])
    expect(stderr).toContain('R422-SEO-001')
  })

  it('rescan → POST with the site id', async () => {
    apiMock.post.mockResolvedValue(envelope({site_id: SITE, audit: 'queued'}))
    const {stdout} = await runCaptured(SeoRescan, ['--site', SITE])
    expect(apiMock.post).toHaveBeenCalledWith('/cli/v1/seo/rescan', {site_id: SITE})
    expect(stdout).toContain('queued')
  })
})

describe('seo-sites', () => {
  it('list prints the sites with their cadence and open findings', async () => {
    apiMock.get.mockResolvedValue(envelope([SITE_ROW]))
    const {stdout} = await runCaptured(SeoSitesList, [])
    expect(apiMock.get).toHaveBeenCalledWith('/cli/v1/seo_sites?page=1')
    expect(stdout).toContain('https://www.acme.example')
    expect(stdout).toContain('daily')
  })

  // A failed run must never look like a successful one.
  it('list says when the last run failed, instead of showing its date', async () => {
    apiMock.get.mockResolvedValue(envelope([{...SITE_ROW, last_error: 'timeout'}]))
    const {stdout} = await runCaptured(SeoSitesList, [])
    expect(stdout).toContain('failed')
    expect(stdout).toContain('timeout')
  })

  it('list says when a site has never been checked', async () => {
    apiMock.get.mockResolvedValue(envelope([{...SITE_ROW, last_audited_at: null}]))
    const {stdout} = await runCaptured(SeoSitesList, [])
    expect(stdout).toContain('never')
  })

  it('create declares the site and says the first check started', async () => {
    apiMock.post.mockResolvedValue(envelope(SITE_ROW))
    const {stdout} = await runCaptured(SeoSitesCreate, [
      '--project', PID, '--url', 'https://www.acme.example', '--environment', 'env-1',
      '--frequency', 'weekly', '--max-pages', '50', '--no-sitemap',
    ])
    expect(apiMock.post).toHaveBeenCalledWith('/cli/v1/seo_sites', {
      project_id: PID,
      environment_id: 'env-1',
      base_url: 'https://www.acme.example',
      frequency: 'weekly',
      max_pages: 50,
      follow_sitemap: false,
    })
    expect(stdout).toContain('First check queued')
  })

  it('create surfaces a rejected address instead of pretending it worked', async () => {
    apiMock.post.mockRejectedValue(apiError(422, 'R422-SEO-002', 'base_url must be public'))
    const {stderr} = await runExpectingExit(SeoSitesCreate, [
      '--project', PID, '--url', 'http://192.168.1.10', '--environment', 'env-1',
    ])
    expect(stderr).toContain('R422-SEO-002')
  })

  it('update sends only the fields you passed', async () => {
    apiMock.put.mockResolvedValue(envelope(SITE_ROW))
    await runCaptured(SeoSitesUpdate, [SITE, '--frequency', 'weekly', '--disable'])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/seo_sites/${SITE}`, {frequency: 'weekly', enabled: false})
  })

  it('update can turn the sitemap reading off and the checks back on', async () => {
    apiMock.put.mockResolvedValue(envelope(SITE_ROW))
    await runCaptured(SeoSitesUpdate, [SITE, '--no-sitemap', '--enable'])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/seo_sites/${SITE}`, {follow_sitemap: false, enabled: true})
  })

  it('delete removes the site and says what goes with it', async () => {
    apiMock.delete.mockResolvedValue(envelope({id: SITE, deleted: true}))
    const {stdout} = await runCaptured(SeoSitesDelete, [SITE])
    expect(apiMock.delete).toHaveBeenCalledWith(`/cli/v1/seo_sites/${SITE}`)
    expect(stdout).toContain('findings')
  })
})

describe('seo-sites show', () => {
  it('requests the site card and prints its configuration', async () => {
    apiMock.get.mockResolvedValue(envelope(SITE_DETAIL))
    const {stdout} = await runCaptured(SeoSitesShow, [SITE])
    expect(apiMock.get).toHaveBeenCalledWith(`/cli/v1/seo_sites/${SITE}`)
    expect(stdout).toContain('https://www.acme.example')
    expect(stdout).toContain('frequency: daily')
    expect(stdout).toContain('max_pages: 100')
    expect(stdout).toContain('next_audit_at: 2026-08-22T02:00:00Z')
  })

  // The reason the command exists: four questions to answer without re-reading with --json.
  it('prints open findings, last run and vitals, each in its own block', async () => {
    apiMock.get.mockResolvedValue(envelope(SITE_DETAIL))
    const {stdout} = await runCaptured(SeoSitesShow, [SITE])
    expect(stdout).toContain('Open findings')
    expect(stdout).toContain('critical: 1')
    expect(stdout).toContain('Last run')
    // The block rows are the ones the server sends: the client prints them, it does not reinterpret them.
    expect(stdout).toContain('pages_visited: 42')
    expect(stdout).toContain('new_issues: 3')
    expect(stdout).toContain('Vitals')
    expect(stdout).toContain('lcp_ms: 2100')
    expect(stdout).toContain('Project')
    expect(stdout).toContain('Environment')
  })

  // A «Vitals» heading without rows reads as «this site has no vitals», which is something else.
  it('stays silent on the blocks the server does not send, instead of printing an empty heading', async () => {
    apiMock.get.mockResolvedValue(envelope({...SITE_ROW, last_audited_at: null, last_audit: null, open_issues_count: 0}))
    const {stdout} = await runCaptured(SeoSitesShow, [SITE])
    expect(stdout).toContain('open_issues_count: 0')
    expect(stdout).not.toContain('Open findings')
    expect(stdout).not.toContain('Last run')
    expect(stdout).not.toContain('Vitals')
    // Not even in passing in the configuration: a `last_audit: -` among the settings
    // looks like something you can change, while it is a run that never happened.
    expect(stdout).not.toContain('last_audit:')
  })

  // The server contract grows: a block the client does not know is printed anyway.
  it('also shows a block the client does not know, instead of losing it', async () => {
    apiMock.get.mockResolvedValue(
      envelope({...SITE_DETAIL, robots: {indexable: true, sitemap_url: 'https://www.acme.example/sitemap.xml'}}),
    )
    const {stdout} = await runCaptured(SeoSitesShow, [SITE])
    expect(stdout).toContain('Robots')
    expect(stdout).toContain('sitemap_url: https://www.acme.example/sitemap.xml')
  })

  // The title of that block is a key coming from the server: printed raw, it would bring onto
  // the page the terminal control sequences (the same ones sanitize neutralises everywhere).
  it('neutralises the control chars in the name of a block coming from the server', async () => {
    apiMock.get.mockResolvedValue(envelope({...SITE_DETAIL, 'robots\u001B[31m': {indexable: true}}))
    const {stdout} = await runCaptured(SeoSitesShow, [SITE])
    expect(stdout).toContain('Robots [31m')
    expect(stdout).not.toContain('\u001B')
  })

  it('renders a nested list as a table, with the columns of all rows', async () => {
    apiMock.get.mockResolvedValue(
      envelope({
        ...SITE_DETAIL,
        recent_audits: [
          {status: 'success', pages_visited: 42, finished_at: '2026-08-15T02:04:11Z'},
          {status: 'failed', pages_visited: 0, finished_at: '2026-08-08T02:01:03Z', error: 'timeout'},
        ],
      }),
    )
    const {stdout} = await runCaptured(SeoSitesShow, [SITE])
    expect(stdout).toContain('Recent audits')
    expect(stdout).toContain('PAGES_VISITED')
    // The column exists only in the second row: taking the shape from the first would lose it.
    expect(stdout).toContain('ERROR')
    expect(stdout).toContain('timeout')
  })

  it('keeps a list of simple values on a single line', async () => {
    apiMock.get.mockResolvedValue(envelope({...SITE_DETAIL, checks_enabled: ['missing_h1', 'duplicate_title']}))
    const {stdout} = await runCaptured(SeoSitesShow, [SITE])
    expect(stdout).toContain('Checks enabled')
    expect(stdout).toContain('missing_h1, duplicate_title')
  })

  it('does not open a section for a block with nothing to print', async () => {
    apiMock.get.mockResolvedValue(envelope({...SITE_DETAIL, extra: {}, history: [], sightings: [{nested: {a: 1}}]}))
    const {stdout} = await runCaptured(SeoSitesShow, [SITE])
    expect(stdout).not.toContain('Extra')
    expect(stdout).not.toContain('History')
    expect(stdout).not.toContain('Sightings')
  })

  it('with --json returns the server envelope without reworking it', async () => {
    apiMock.get.mockResolvedValue(envelope(SITE_DETAIL, {generated_at: '2026-08-16T09:00:00Z'}))
    const {result, stdout} = await runCaptured(SeoSitesShow, [SITE, '--json'])
    expect(result).toEqual({data: SITE_DETAIL, meta: {generated_at: '2026-08-16T09:00:00Z'}})
    expect(stdout).not.toContain('Open findings')
  })

  it('tolerates an envelope without data', async () => {
    apiMock.get.mockResolvedValue({data: undefined})
    await expect(runCaptured(SeoSitesShow, [SITE])).resolves.toBeTruthy()
  })

  it('a site that does not exist exits with the server code', async () => {
    apiMock.get.mockRejectedValue(apiError(404, 'R404-SEO-003', 'site not found'))
    const {stderr} = await runExpectingExit(SeoSitesShow, ['ss-nope'])
    expect(stderr).toContain('R404-SEO-003')
  })
})
