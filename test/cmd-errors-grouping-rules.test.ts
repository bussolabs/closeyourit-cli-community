// CYCL-44 — the rules the project uses to bend the automatic grouping of errors
// (CYRA-153) could only be written from the site: after a noisy release they were needed from the terminal,
// where the noise is seen first.

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

import ErrorsGroupingRulesCreate from '../src/commands/errors/grouping-rules/create'
import ErrorsGroupingRulesDelete from '../src/commands/errors/grouping-rules/delete'
import ErrorsGroupingRulesList from '../src/commands/errors/grouping-rules/list'
import ErrorsGroupingRulesUpdate from '../src/commands/errors/grouping-rules/update'

const RULE = 'egr-1'

beforeEach(() => resetApiMock())

describe('errors grouping-rules list', () => {
  it('lists the project rules, in order of application', async () => {
    apiMock.get.mockResolvedValue(
      envelope([
        {id: RULE, position: 0, field: 'message', operator: 'contains', value: 'timeout', fingerprint_key: 'net-timeout', active: true},
      ]),
    )
    const {stdout} = await runCaptured(ErrorsGroupingRulesList, ['--project', PID])
    expect(apiMock.get).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/error_grouping_rules?page=1`)
    expect(stdout).toContain('net-timeout')
    expect(stdout).toContain('contains')
  })

  it('propagates a backend error', async () => {
    apiMock.get.mockRejectedValue(apiError(404, 'C404-PRJ-001', 'Project not found'))
    const {stderr} = await runExpectingExit(ErrorsGroupingRulesList, ['--project', PID])
    expect(stderr).toContain('C404-PRJ-001')
  })
})

describe('errors grouping-rules create', () => {
  it('creates the rule with field, comparison, value and grouping key', async () => {
    apiMock.post.mockResolvedValue(envelope({id: RULE, field: 'culprit', operator: 'starts_with'}))
    const {stdout} = await runCaptured(ErrorsGroupingRulesCreate, [
      '--project', PID,
      '--field', 'culprit',
      '--operator', 'starts_with',
      '--value', 'app/jobs/',
      '--fingerprint-key', 'jobs',
      '--position', '2',
    ])
    expect(apiMock.post).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/error_grouping_rules`, {
      field: 'culprit',
      fingerprint_key: 'jobs',
      operator: 'starts_with',
      position: 2,
      value: 'app/jobs/',
    })
    expect(stdout).toContain('Grouping rule created')
  })

  it('is born disabled with --no-active', async () => {
    apiMock.post.mockResolvedValue(envelope({id: RULE, active: false}))
    await runCaptured(ErrorsGroupingRulesCreate, [
      '--project', PID, '--field', 'message', '--operator', 'equals', '--value', 'boom',
      '--fingerprint-key', 'boom', '--no-active',
    ])
    expect(apiMock.post).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/error_grouping_rules`, {
      active: false,
      field: 'message',
      fingerprint_key: 'boom',
      operator: 'equals',
      value: 'boom',
    })
  })

  // field/operator are a closed vocabulary on the model side: a value outside the list is stopped by oclif
  // before the call, so the error states the alternatives instead of the server 422.
  it('rejects a field outside the vocabulary without calling the server', async () => {
    await runExpectingExit(
      ErrorsGroupingRulesCreate,
      ['--project', PID, '--field', 'stacktrace', '--operator', 'equals', '--value', 'x', '--fingerprint-key', 'k'],
      2,
    )
    expect(apiMock.post).not.toHaveBeenCalled()
  })

  it('propagates the backend rejection', async () => {
    apiMock.post.mockRejectedValue(apiError(422, 'R422-ERRGROUPRULE-001', 'Value non può essere vuoto'))
    const {stderr} = await runExpectingExit(ErrorsGroupingRulesCreate, [
      '--project', PID, '--field', 'message', '--operator', 'contains', '--value', ' ', '--fingerprint-key', 'k',
    ])
    expect(stderr).toContain('R422-ERRGROUPRULE-001')
  })
})

describe('errors grouping-rules update', () => {
  it('sends only the passed fields', async () => {
    apiMock.put.mockResolvedValue(envelope({id: RULE, position: 5}))
    const {stdout} = await runCaptured(ErrorsGroupingRulesUpdate, [RULE, '--project', PID, '--position', '5'])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/error_grouping_rules/${RULE}`, {position: 5})
    expect(stdout).toContain('Grouping rule updated')
  })

  it('disables a rule without deleting it', async () => {
    apiMock.put.mockResolvedValue(envelope({id: RULE, active: false}))
    await runCaptured(ErrorsGroupingRulesUpdate, [RULE, '--project', PID, '--no-active'])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/error_grouping_rules/${RULE}`, {active: false})
  })

  // An empty-handed PUT would pass as a success without changing anything: better to say it first.
  it('asks for at least one field to change', async () => {
    const {message} = await runExpectingExit(ErrorsGroupingRulesUpdate, [RULE, '--project', PID], 2)
    expect(message).toContain('--value')
    expect(apiMock.put).not.toHaveBeenCalled()
  })
})

describe('errors grouping-rules delete', () => {
  it('refuses to delete without --confirm', async () => {
    const {message} = await runExpectingExit(ErrorsGroupingRulesDelete, [RULE, '--project', PID], 2)
    expect(message).toContain('--confirm')
    expect(apiMock.delete).not.toHaveBeenCalled()
  })

  it('with --json does not print the human line', async () => {
    apiMock.delete.mockResolvedValue(envelope({}))
    const {result, stdout} = await runCaptured(ErrorsGroupingRulesDelete, [RULE, '--project', PID, '--confirm', '--json'])
    expect(result).toEqual({deleted: RULE})
    expect(stdout).not.toContain('Deleted grouping rule')
  })

  it('deletes the rule', async () => {
    apiMock.delete.mockResolvedValue(envelope({}))
    const {stdout} = await runCaptured(ErrorsGroupingRulesDelete, [RULE, '--project', PID, '--confirm'])
    expect(apiMock.delete).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/error_grouping_rules/${RULE}`)
    expect(stdout).toContain(RULE)
  })
})
