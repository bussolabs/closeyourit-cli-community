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

import MetricsBulkTriage from '../src/commands/metrics/bulk-triage'
import MetricsList from '../src/commands/metrics/list'
import MetricsPromote from '../src/commands/metrics/promote'
import MetricsShow from '../src/commands/metrics/show'

const MG = 'mg-1'

beforeEach(() => resetApiMock())

describe('metrics list', () => {
  it('lists metric groups', async () => {
    apiMock.get.mockResolvedValue(envelope([{id: MG, kind: 'sql', name: 'SELECT users', samples_count: 12}]))
    const {stdout} = await runCaptured(MetricsList, ['--project', PID])
    expect(apiMock.get).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/metric_groups?page=1`)
    expect(stdout).toContain('SELECT users')
  })

  it('adds the kind filter', async () => {
    apiMock.get.mockResolvedValue(envelope([]))
    await runCaptured(MetricsList, ['--project', PID, '--kind', 'sql'])
    expect(apiMock.get).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/metric_groups?page=1&kind=sql`)
  })

  it('exits non-zero on an API error', async () => {
    apiMock.get.mockRejectedValue(apiError(500, 'R500-SYS-001', 'boom'))
    const {stderr} = await runExpectingExit(MetricsList, ['--project', PID])
    expect(stderr).toContain('R500-SYS-001')
  })
})

describe('metrics show / promote', () => {
  it('show → fetches one group', async () => {
    apiMock.get.mockResolvedValue(envelope({id: MG, kind: 'method'}))
    const {stdout} = await runCaptured(MetricsShow, [MG, '--project', PID])
    expect(apiMock.get).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/metric_groups/${MG}`)
    expect(stdout).toContain('method')
  })

  it('promote → PUT .../promotion and prints the ticket', async () => {
    apiMock.put.mockResolvedValue(envelope({code: 'DRRA-9'}))
    const {stdout} = await runCaptured(MetricsPromote, [MG, '--project', PID])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/metric_groups/${MG}/promotion`)
    expect(stdout).toContain('Ticket created')
  })
})

// CYCL-44 — bulk triage of metrics, twin of the errors one (CYRA-45).
describe('metrics bulk-triage', () => {
  it('sends ids[] + bulk_action and says how many groups it changed', async () => {
    apiMock.post.mockResolvedValue(
      envelope([
        {id: 'mg-1', kind: 'sql', name: 'SELECT users', status: 'resolved'},
        {id: 'mg-2', kind: 'method', name: 'Report#run', status: 'resolved'},
      ]),
    )
    const {stdout} = await runCaptured(MetricsBulkTriage, [
      '--project', PID, '--action', 'resolve', '--group', 'mg-1', '--group', 'mg-2',
    ])
    expect(apiMock.post).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/metric_groups/bulk_triage`, {
      bulk_action: 'resolve',
      ids: ['mg-1', 'mg-2'],
    })
    expect(stdout).toContain('2 metric groups')
    expect(stdout).toContain('Report#run')
  })

  it('an id outside the project does not pass as good: exits non-zero and names the ids left out', async () => {
    apiMock.post.mockResolvedValue(envelope([{id: 'mg-1', kind: 'sql', name: 'SELECT users', status: 'ignored'}]))
    const {message} = await runExpectingExit(MetricsBulkTriage, [
      '--project', PID, '--action', 'ignore', '--group', 'mg-1', '--group', 'mg-ALTRO',
    ])
    expect(message).toContain('C404-MTG-001')
    expect(message).toContain('mg-ALTRO')
  })

  it("rejects an action outside the vocabulary without calling the server", async () => {
    await runExpectingExit(MetricsBulkTriage, ['--project', PID, '--action', 'cancella', '--group', 'mg-1'], 2)
    expect(apiMock.post).not.toHaveBeenCalled()
  })

  it('with --json returns the envelope and stays silent', async () => {
    apiMock.post.mockResolvedValue(envelope([{id: 'mg-1', kind: 'sql', name: 'q', status: 'resolved'}]))
    const {stdout} = await runCaptured(MetricsBulkTriage, [
      '--project', PID, '--action', 'resolve', '--group', 'mg-1', '--json',
    ])
    expect(stdout).toContain('"data"')
    expect(stdout).not.toContain('Triaged')
  })

  it('a response without groups does not pass as a success', async () => {
    apiMock.post.mockResolvedValue({data: undefined})
    const {message} = await runExpectingExit(MetricsBulkTriage, [
      '--project', PID, '--action', 'resolve', '--group', 'mg-1',
    ])
    expect(message).toContain('C404-MTG-001')
  })

  it('propagates a backend error', async () => {
    apiMock.post.mockRejectedValue(apiError(403, 'R403-PERM-001', 'forbidden'))
    const {stderr} = await runExpectingExit(MetricsBulkTriage, [
      '--project', PID, '--action', 'resolve', '--group', 'mg-1',
    ])
    expect(stderr).toContain('R403-PERM-001')
  })
})
