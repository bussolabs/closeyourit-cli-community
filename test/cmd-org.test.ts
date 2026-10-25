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

import OrgShow from '../src/commands/org/show'
import OrgUpdate from '../src/commands/org/update'

beforeEach(() => resetApiMock())

describe('org show', () => {
  it('fetches the organization', async () => {
    apiMock.get.mockResolvedValue(envelope({name: 'Acme', slug: 'acme'}))
    const {stdout} = await runCaptured(OrgShow, [])
    expect(apiMock.get).toHaveBeenCalledWith('/cli/v1/organization')
    expect(stdout).toContain('Acme')
  })

  it('exits non-zero on an API error', async () => {
    apiMock.get.mockRejectedValue(apiError(403, 'R403-ORG-001', 'forbidden'))
    const {stderr} = await runExpectingExit(OrgShow, [])
    expect(stderr).toContain('R403-ORG-001')
  })
})

describe('org update', () => {
  it('maps --projects-view to default_projects_view and sends only given fields', async () => {
    apiMock.put.mockResolvedValue(envelope({name: 'Acme Inc'}))
    const {stdout} = await runCaptured(OrgUpdate, ['--name', 'Acme Inc', '--projects-view', 'table'])
    expect(apiMock.put).toHaveBeenCalledWith('/cli/v1/organization', {name: 'Acme Inc', default_projects_view: 'table'})
    expect(stdout).toContain('Organization updated')
  })

  it('rejects an invalid --projects-view option (exit 2)', async () => {
    const {error} = await runExpectingExit(OrgUpdate, ['--projects-view', 'grid'], 2)
    expect(error).toBeTruthy()
    expect(apiMock.put).not.toHaveBeenCalled()
  })

  it('sends the log/analytics retentions as integers only when passed', async () => {
    apiMock.put.mockResolvedValue(envelope({name: 'Acme'}))
    await runCaptured(OrgUpdate, ['--logs-retention-days', '30', '--analytics-retention-days', '365'])
    expect(apiMock.put).toHaveBeenCalledWith('/cli/v1/organization', {
      logs_retention_days: 30,
      analytics_retention_days: 365,
    })
  })
})
