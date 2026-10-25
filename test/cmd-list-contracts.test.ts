import {beforeEach, describe, expect, it, vi} from 'vitest'
import {apiMock, resetApiMock} from './helpers/api-mock'
import {PID, envelope, runCaptured} from './helpers/command'

vi.mock('../src/lib/api', async (io) => {
  const actual = await io<typeof import('../src/lib/api')>()
  const {apiMock} = await import('./helpers/api-mock')
  return {...actual, CliApi: vi.fn(function () { return apiMock })}
})
vi.mock('../src/lib/config', async (io) => {
  const actual = await io<typeof import('../src/lib/config')>()
  return {...actual, loadConfig: vi.fn(() => ({apiUrl: 'https://api.test', token: 'tok_test'}))}
})

import ListCommand0 from '../src/commands/alerts/channels/list'
import ListCommand1 from '../src/commands/servers/list'
import ListCommand2 from '../src/commands/seo/pages'
import ListCommand3 from '../src/commands/seo-sites/list'
import ListCommand4 from '../src/commands/vulnerabilities/runtimes'
import ListCommand5 from '../src/commands/groups/list'
import ListCommand6 from '../src/commands/teams/list'
import ListCommand7 from '../src/commands/roles/list'
import ListCommand8 from '../src/commands/projects/list'
import ListCommand9 from '../src/commands/environments/list'
import ListCommand10 from '../src/commands/platforms/list'
import ListCommand11 from '../src/commands/usage/list'
import ListCommand12 from '../src/commands/usage/reporters'
import ListCommand13 from '../src/commands/coverage/show'
import ListCommand14 from '../src/commands/errors/list'
import ListCommand15 from '../src/commands/errors/grouping-rules/list'
import ListCommand16 from '../src/commands/metrics/list'
import ListCommand17 from '../src/commands/monitors/list'
import ListCommand18 from '../src/commands/logs/list'
import ListCommand19 from '../src/commands/matrix/statuses'
import ListCommand20 from '../src/commands/matrix/list'
import ListCommand21 from '../src/commands/members/list'
import ListCommand22 from '../src/commands/invitations/list'
import ListCommand23 from '../src/commands/cron-monitors/list'
import ServiceAccountsList from '../src/commands/service-accounts/list'
import VulnerabilitiesList from '../src/commands/vulnerabilities/list'
import QuestionsList from '../src/commands/tickets/questions/list'
import DependenciesList from '../src/commands/tickets/dependencies/list'
import ProvisionShow from '../src/commands/tokens/provisions/show'

beforeEach(() => resetApiMock())

// Partial API rows occur before a monitor reports or while optional metadata is absent.
// The human view must remain readable; JSON consumers must receive the unchanged envelope.
const commands: Array<[string, Parameters<typeof runCaptured>[0], string[]]> = [
  ['alerts/channels/list', ListCommand0, []], ['servers/list', ListCommand1, []], ['seo/pages', ListCommand2, []], ['seo-sites/list', ListCommand3, []],
  ['vulnerabilities/runtimes', ListCommand4, []], ['groups/list', ListCommand5, []], ['teams/list', ListCommand6, []], ['roles/list', ListCommand7, []],
  ['projects/list', ListCommand8, []], ['environments/list', ListCommand9, []], ['platforms/list', ListCommand10, []],
  ['usage/list', ListCommand11, ['-p', PID]], ['usage/reporters', ListCommand12, ['-p', PID]], ['coverage/show', ListCommand13, ['-p', PID]],
  ['errors/list', ListCommand14, ['-p', PID]], ['errors/grouping-rules/list', ListCommand15, ['-p', PID]],
  ['metrics/list', ListCommand16, ['-p', PID]], ['monitors/list', ListCommand17, ['-p', PID]], ['logs/list', ListCommand18, ['-p', PID]],
  ['matrix/statuses', ListCommand19, []], ['matrix/list', ListCommand20, []], ['members/list', ListCommand21, []],
  ['invitations/list', ListCommand22, []], ['cron-monitors/list', ListCommand23, ['-p', PID]],
  ['service-accounts/list', ServiceAccountsList, []], ['vulnerabilities/list', VulnerabilitiesList, []],
]

describe.each(commands)('%s response boundaries', (_path, command, argv) => {
  it.each([null, [], [{}], [{}, {}]].map((data) => ({data})))('renders an incomplete or empty collection: $data', async ({data}) => {
    const response = envelope(data)
    apiMock.get.mockResolvedValue(response)
    const {result, stdout} = await runCaptured(command, argv)
    expect(result).toEqual(response)
    expect(stdout).not.toMatch(/undefined|\[object Object\]/)
    expect(apiMock.get).toHaveBeenCalledOnce()
    expect(apiMock.post).not.toHaveBeenCalled()
  })

  it('preserves unknown fields for JSON consumers without human output', async () => {
    const response = envelope([{future_field: 'keep-me'}], {total_pages: 2})
    apiMock.get.mockResolvedValue(response)
    const {result, stdout} = await runCaptured(command, [...argv, '--json'])
    expect(result).toEqual(response)
    expect(JSON.parse(stdout)).toEqual(response)
    expect(apiMock.get).toHaveBeenCalledOnce()
  })
})

describe('partially populated ticket and provision details', () => {
  it('renders a question and answer while optional identity and text fields are missing', async () => {
    apiMock.get.mockResolvedValue(envelope([{answers: [{}]}]))
    const {result, stdout} = await runCaptured(QuestionsList, [PID, '-p', PID])
    expect(result).toEqual({data: [{answers: [{}]}]})
    expect(stdout).toContain('↳ ?')
    expect(stdout).not.toContain('undefined')
  })

  it('keeps an absent question collection empty and machine readable', async () => {
    apiMock.get.mockResolvedValue(envelope(null))
    const {result, stdout} = await runCaptured(QuestionsList, [PID, '-p', PID, '--json'])
    expect(result).toEqual({data: []})
    expect(JSON.parse(stdout)).toEqual(result)
  })

  it('renders dependencies before their optional status metadata is populated', async () => {
    apiMock.get.mockResolvedValue(envelope([{}, {status: {code: 'pending'}}]))
    const {result, stdout} = await runCaptured(DependenciesList, [PID, '-p', PID])
    expect(result).toEqual([{}, {status: {code: 'pending'}}])
    expect(stdout).toContain('pending')
    expect(stdout).not.toContain('undefined')
  })

  it('shows placeholders without exposing unexpected fields in an incomplete provision', async () => {
    apiMock.get.mockResolvedValue(envelope({provision: {}, secret: 'MUST_NOT_ESCAPE'}))
    const {result, stdout} = await runCaptured(ProvisionShow, [PID, '-p', PID])
    expect(result).toEqual({data: {token: {}, provision: {}}})
    expect(stdout).toContain(`Provision ${PID}`)
    expect(stdout).toContain('status:      -')
    expect(stdout).not.toContain('MUST_NOT_ESCAPE')
  })

  it('shows available provision metadata and an explicit synchronization error', async () => {
    const provision = {id: 'provision-1', status: 'failed', secret_name: 'EXAMPLE',
      destination_project_id: PID, destination_environment_id: 'development', error_code: 'sync_failed'}
    apiMock.get.mockResolvedValue(envelope({provision}))
    const {stdout} = await runCaptured(ProvisionShow, [PID, '-p', PID])
    for (const value of Object.values(provision)) expect(stdout).toContain(value)
  })
})
