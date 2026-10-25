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

import VulnerabilitiesIgnore from '../src/commands/vulnerabilities/ignore'
import VulnerabilitiesList from '../src/commands/vulnerabilities/list'
import VulnerabilitiesPromote from '../src/commands/vulnerabilities/promote'
import VulnerabilitiesReopen from '../src/commands/vulnerabilities/reopen'
import VulnerabilitiesRescan from '../src/commands/vulnerabilities/rescan'
import VulnerabilitiesRuntimes from '../src/commands/vulnerabilities/runtimes'
import VulnerabilitiesShow from '../src/commands/vulnerabilities/show'

const FINDING = 'vf-1'

const ROW = {
  id: FINDING,
  status: 'open',
  fixed_version: '3.2.6',
  advisory: {display_id: 'CVE-2026-47429', severity: 'critical', osv_id: 'GHSA-5xrq-8626-4rwp'},
  package: {coordinates: 'vitest@2.1.9', name: 'vitest', version: '2.1.9', ecosystem: 'npm'},
  project: {id: PID, key: 'CYCL', name: 'closeyourit-cli'},
}

beforeEach(() => resetApiMock())

describe('vulnerabilities list', () => {
  // The point of the command: one call covers the whole fleet, no --project needed.
  it('lists across every visible project without --project', async () => {
    apiMock.get.mockResolvedValue(envelope([ROW]))
    const {stdout} = await runCaptured(VulnerabilitiesList, [])
    expect(apiMock.get).toHaveBeenCalledWith('/cli/v1/vulnerabilities?page=1')
    expect(stdout).toContain('vitest@2.1.9')
    expect(stdout).toContain('CYCL')
    expect(stdout).toContain('CVE-2026-47429')
  })

  // Every other subcommand takes the id as its argument: without it in the table, triaging what you
  // are looking at means rerunning with --json.
  it('prints the id, so list → ignore/promote works without --json', async () => {
    apiMock.get.mockResolvedValue(envelope([ROW]))
    const {stdout} = await runCaptured(VulnerabilitiesList, [])
    expect(stdout).toContain(FINDING)
  })

  it('adds every filter to the query', async () => {
    apiMock.get.mockResolvedValue(envelope([]))
    await runCaptured(VulnerabilitiesList, [
      '--project', PID, '--severity', 'critical', '--status', 'open', '--package', 'noko', '--page', '2',
    ])
    expect(apiMock.get).toHaveBeenCalledWith(
      `/cli/v1/vulnerabilities?page=2&project_id=${PID}&severity=critical&status=open&package=noko`,
    )
  })

  // No fixing version means OSV declares none — the column must say so, not print "undefined".
  it('marks a row with no fixing version', async () => {
    apiMock.get.mockResolvedValue(envelope([{...ROW, fixed_version: null}]))
    const {stdout} = await runCaptured(VulnerabilitiesList, [])
    expect(stdout).toContain('—')
  })

  it('renders an empty list without blowing up', async () => {
    apiMock.get.mockResolvedValue(envelope([]))
    const {stdout} = await runCaptured(VulnerabilitiesList, [])
    expect(stdout).toContain('PACKAGE')
  })

  it('exits non-zero on an API error', async () => {
    apiMock.get.mockRejectedValue(apiError(403, 'R403-CLIAUTH-002', 'forbidden'))
    const {stderr} = await runExpectingExit(VulnerabilitiesList, [])
    expect(stderr).toContain('R403-CLIAUTH-002')
  })
})

describe('vulnerabilities show', () => {
  it('prints advisory, package and manifest blocks', async () => {
    apiMock.get.mockResolvedValue(envelope({...ROW, manifest: {path: 'pnpm-lock.yaml'}}))
    const {stdout} = await runCaptured(VulnerabilitiesShow, [FINDING])
    expect(apiMock.get).toHaveBeenCalledWith(`/cli/v1/vulnerabilities/${FINDING}`)
    expect(stdout).toContain('Advisory')
    expect(stdout).toContain('GHSA-5xrq-8626-4rwp')
    expect(stdout).toContain('pnpm-lock.yaml')
  })
})

describe('vulnerabilities triage', () => {
  it('ignore → PUT .../ignore with the note', async () => {
    apiMock.put.mockResolvedValue(envelope({}))
    const {stdout} = await runCaptured(VulnerabilitiesIgnore, [FINDING, '--note', 'Not reachable.'])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/vulnerabilities/${FINDING}/ignore`, {
      triage_note: 'Not reachable.',
    })
    expect(stdout).toContain('ignored')
  })

  it('reopen → DELETE .../ignore (reopening is deleting the ignore)', async () => {
    apiMock.delete.mockResolvedValue(envelope({}))
    const {stdout} = await runCaptured(VulnerabilitiesReopen, [FINDING])
    expect(apiMock.delete).toHaveBeenCalledWith(`/cli/v1/vulnerabilities/${FINDING}/ignore`)
    expect(stdout).toContain('reopened')
  })

  it('promote → PUT .../promotion and prints the ticket', async () => {
    apiMock.put.mockResolvedValue(envelope({id: 't-1', code: 'CYCL-30'}))
    const {stdout} = await runCaptured(VulnerabilitiesPromote, [FINDING])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/vulnerabilities/${FINDING}/promotion`)
    expect(stdout).toContain('CYCL-30')
  })

  it('promoting twice surfaces the server-side idempotency error', async () => {
    apiMock.put.mockRejectedValue(apiError(422, 'R422-VULN-001', 'already promoted'))
    const {stderr} = await runExpectingExit(VulnerabilitiesPromote, [FINDING])
    expect(stderr).toContain('R422-VULN-001')
  })

  it('rescan → POST with the resolved project', async () => {
    apiMock.post.mockResolvedValue(envelope({project_id: PID, scan: 'queued'}))
    const {stdout} = await runCaptured(VulnerabilitiesRescan, ['--project', PID])
    expect(apiMock.post).toHaveBeenCalledWith('/cli/v1/vulnerabilities/rescan', {project_id: PID})
    expect(stdout).toContain('queued')
  })

  it('triage without the permission exits non-zero', async () => {
    apiMock.put.mockRejectedValue(apiError(403, 'R403-CLIAUTH-002', 'forbidden'))
    const {stderr} = await runExpectingExit(VulnerabilitiesIgnore, [FINDING])
    expect(stderr).toContain('R403-CLIAUTH-002')
  })
})

describe('vulnerabilities runtimes', () => {
  it('lists the runtime support states', async () => {
    apiMock.get.mockResolvedValue(
      envelope([{id: 'rt-1', name: 'ruby', version: '3.0.6', state: 'eol', eol_on: '2027-04-23', latest: '3.4.10', project: {key: 'CYRA'}}]),
    )
    const {stdout} = await runCaptured(VulnerabilitiesRuntimes, [])
    expect(apiMock.get).toHaveBeenCalledWith('/cli/v1/vulnerabilities/runtimes?page=1')
    expect(stdout).toContain('ruby')
    expect(stdout).toContain('eol')
  })

  it('filters by project', async () => {
    apiMock.get.mockResolvedValue(envelope([]))
    await runCaptured(VulnerabilitiesRuntimes, ['--project', PID])
    expect(apiMock.get).toHaveBeenCalledWith(`/cli/v1/vulnerabilities/runtimes?page=1&project_id=${PID}`)
  })
})
