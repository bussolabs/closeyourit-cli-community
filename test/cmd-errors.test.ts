import {beforeEach, describe, expect, it, vi} from 'vitest'
import {apiMock, resetApiMock} from './helpers/api-mock'
import {MID, PID, apiError, envelope, runCaptured, runExpectingExit} from './helpers/command'

vi.mock('../src/lib/api', async (io) => {
  const actual = await io<typeof import('../src/lib/api')>()
  const {apiMock} = await import('./helpers/api-mock')
  return {...actual, CliApi: vi.fn(function () { return apiMock })}
})
vi.mock('../src/lib/config', async (io) => {
  const actual = await io<typeof import('../src/lib/config')>()
  return {...actual, loadConfig: vi.fn(() => ({apiUrl: 'https://api.test', token: 'tok_test'}))}
})

import ErrorsAssign from '../src/commands/errors/assign'
import ErrorsBulkTriage from '../src/commands/errors/bulk-triage'
import ErrorsDelete from '../src/commands/errors/delete'
import ErrorsList from '../src/commands/errors/list'
import ErrorsMerge from '../src/commands/errors/merge'
import ErrorsMute from '../src/commands/errors/mute'
import ErrorsPromote from '../src/commands/errors/promote'
import ErrorsReopen from '../src/commands/errors/reopen'
import ErrorsResolve from '../src/commands/errors/resolve'
import ErrorsShow from '../src/commands/errors/show'
import ErrorsSplit from '../src/commands/errors/split'
import ErrorsUnmute from '../src/commands/errors/unmute'

const GROUP = 'eg-1'

beforeEach(() => resetApiMock())

describe('errors list', () => {
  it('lists error groups for a project', async () => {
    apiMock.get.mockResolvedValue(envelope([{id: 'eg-1', title: 'Boom', status: 'unresolved', events_count: 3}]))
    const {stdout} = await runCaptured(ErrorsList, ['--project', PID])
    expect(apiMock.get).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/error_groups?page=1`)
    expect(stdout).toContain('Boom')
  })

  it('adds the status filter to the query', async () => {
    apiMock.get.mockResolvedValue(envelope([]))
    await runCaptured(ErrorsList, ['--project', PID, '--status', 'unresolved', '--page', '2'])
    expect(apiMock.get).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/error_groups?page=2&status=unresolved`)
  })

  // Regression CYCL-1: -p <KEY> for a project on a later projects page (legalbloom LBRA) must resolve
  // like any other key, not fail with C404-PRJ-001 while the UUID works.
  it('resolves a key on a later page of projects list (regression CYCL-1)', async () => {
    apiMock.get
      .mockResolvedValueOnce(envelope([{id: 'p-cyra', key: 'CYRA'}], {total_pages: 2}))
      .mockResolvedValueOnce(envelope([{id: 'p-lbra', key: 'LBRA'}], {total_pages: 2}))
      .mockResolvedValueOnce(envelope([{id: 'eg-1', title: 'Boom', status: 'unresolved', events_count: 1}]))
    const {stdout} = await runCaptured(ErrorsList, ['--project', 'LBRA'])
    expect(apiMock.get).toHaveBeenNthCalledWith(1, '/cli/v1/projects?page=1&per=100')
    expect(apiMock.get).toHaveBeenNthCalledWith(2, '/cli/v1/projects?page=2&per=100')
    expect(apiMock.get).toHaveBeenNthCalledWith(3, '/cli/v1/projects/p-lbra/error_groups?page=1')
    expect(stdout).toContain('Boom')
  })

  it('exits non-zero on an API error', async () => {
    apiMock.get.mockRejectedValue(apiError(403, 'R403-ERR-001', 'forbidden'))
    const {stderr} = await runExpectingExit(ErrorsList, ['--project', PID])
    expect(stderr).toContain('R403-ERR-001')
  })
})

describe('errors show', () => {
  it('fetches a single group', async () => {
    apiMock.get.mockResolvedValue(envelope({id: GROUP, title: 'Boom'}))
    const {stdout} = await runCaptured(ErrorsShow, [GROUP, '--project', PID])
    expect(apiMock.get).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/error_groups/${GROUP}`)
    expect(stdout).toContain('Boom')
  })
})

describe('errors state transitions', () => {
  it('resolve → PUT .../resolution', async () => {
    apiMock.put.mockResolvedValue(envelope({}))
    const {stdout} = await runCaptured(ErrorsResolve, [GROUP, '--project', PID])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/error_groups/${GROUP}/resolution`)
    expect(stdout).toContain('marked as resolved')
  })

  it('reopen → DELETE .../resolution', async () => {
    apiMock.delete.mockResolvedValue(envelope({}))
    const {stdout} = await runCaptured(ErrorsReopen, [GROUP, '--project', PID])
    expect(apiMock.delete).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/error_groups/${GROUP}/resolution`)
    expect(stdout).toContain('reopened')
  })

  it('mute → PUT .../mute', async () => {
    apiMock.put.mockResolvedValue(envelope({}))
    const {stdout} = await runCaptured(ErrorsMute, [GROUP, '--project', PID])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/error_groups/${GROUP}/mute`)
    expect(stdout).toContain('muted')
  })

  it('unmute → DELETE .../mute', async () => {
    apiMock.delete.mockResolvedValue(envelope({}))
    const {stdout} = await runCaptured(ErrorsUnmute, [GROUP, '--project', PID])
    expect(apiMock.delete).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/error_groups/${GROUP}/mute`)
    expect(stdout).toContain('unmuted')
  })

  it('promote → PUT .../promotion and prints the ticket', async () => {
    apiMock.put.mockResolvedValue(envelope({code: 'DRRA-12', title: 'Boom'}))
    const {stdout} = await runCaptured(ErrorsPromote, [GROUP, '--project', PID])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/error_groups/${GROUP}/promotion`)
    expect(stdout).toContain('Ticket created')
    expect(stdout).toContain('DRRA-12')
  })

  it('propagates a backend error from a transition', async () => {
    apiMock.put.mockRejectedValue(apiError(409, 'R409-ERR-002', 'already resolved'))
    const {stderr} = await runExpectingExit(ErrorsResolve, [GROUP, '--project', PID])
    expect(stderr).toContain('R409-ERR-002')
  })
})

// CYCL-44 — bulk operations and grouping fixes, which already existed on the server
// (CYRA-45, CYRA-153, CYRA-192) but could not be reached from the terminal.

describe('errors bulk-triage', () => {
  it('sends ids[] + bulk_action and says how many groups it changed', async () => {
    apiMock.post.mockResolvedValue(
      envelope([
        {id: 'eg-1', title: 'Boom', status: 'resolved'},
        {id: 'eg-2', title: 'Crash', status: 'resolved'},
      ]),
    )
    const {stdout} = await runCaptured(ErrorsBulkTriage, [
      '--project', PID, '--action', 'resolve', '--group', 'eg-1', '--group', 'eg-2',
    ])
    expect(apiMock.post).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/error_groups/bulk_triage`, {
      bulk_action: 'resolve',
      ids: ['eg-1', 'eg-2'],
    })
    expect(stdout).toContain('2 error groups')
    expect(stdout).toContain('Crash')
  })

  // Ticket scenario 1: the server drops the ids that are not from this project and answers 200
  // on the rest (`scope.where(id:)`), so only whoever compares sees the partial result. Passing it
  // as good would leave a script convinced it closed thirty groups after closing twenty-eight.
  it('an id outside the project does not pass as good: exits non-zero and names the ids left out', async () => {
    apiMock.post.mockResolvedValue(envelope([{id: 'eg-1', title: 'Boom', status: 'resolved'}]))
    const {message} = await runExpectingExit(ErrorsBulkTriage, [
      '--project', PID, '--action', 'resolve', '--group', 'eg-1', '--group', 'eg-ALTRO',
    ])
    expect(message).toContain('C404-ERG-001')
    expect(message).toContain('eg-ALTRO')
    expect(message).not.toContain('eg-1,')
  })

  // The same id twice would come back as a single row from the server (`where(id:)` does not duplicate): without
  // deduplication the comparison would read it as "one not found" and the command would fail wrongly.
  it('deduplicates repeated ids before sending them', async () => {
    apiMock.post.mockResolvedValue(envelope([{id: 'eg-1', title: 'Boom', status: 'ignored'}]))
    const {stdout} = await runCaptured(ErrorsBulkTriage, [
      '--project', PID, '--action', 'ignore', '--group', 'eg-1', '--group', 'eg-1',
    ])
    expect(apiMock.post).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/error_groups/bulk_triage`, {
      bulk_action: 'ignore',
      ids: ['eg-1'],
    })
    expect(stdout).toContain('1 error group')
  })

  it('compares the ids case-insensitively', async () => {
    apiMock.post.mockResolvedValue(envelope([{id: 'EG-1', title: 'Boom', status: 'unresolved'}]))
    const {stdout} = await runCaptured(ErrorsBulkTriage, [
      '--project', PID, '--action', 'reopen', '--group', 'eg-1',
    ])
    expect(stdout).toContain('1 error group')
  })

  it("rejects an action outside the vocabulary without calling the server", async () => {
    await runExpectingExit(ErrorsBulkTriage, ['--project', PID, '--action', 'cancella', '--group', 'eg-1'], 2)
    expect(apiMock.post).not.toHaveBeenCalled()
  })

  it('with --json returns the envelope and stays silent', async () => {
    apiMock.post.mockResolvedValue(envelope([{id: 'eg-1', title: 'Boom', status: 'resolved'}], {updated: 1}))
    const {stdout} = await runCaptured(ErrorsBulkTriage, [
      '--project', PID, '--action', 'resolve', '--group', 'eg-1', '--json',
    ])
    expect(stdout).toContain('"data"')
    expect(stdout).not.toContain('Triaged')
  })

  // An envelope without rows means none of the requested groups was touched: passing it as a
  // success would say «done» on a command that did nothing.
  it('a response without groups does not pass as a success', async () => {
    apiMock.post.mockResolvedValue({data: undefined})
    const {message} = await runExpectingExit(ErrorsBulkTriage, [
      '--project', PID, '--action', 'resolve', '--group', 'eg-1',
    ])
    expect(message).toContain('C404-ERG-001')
  })

  it('propagates a backend error', async () => {
    apiMock.post.mockRejectedValue(apiError(403, 'R403-PERM-001', 'forbidden'))
    const {stderr} = await runExpectingExit(ErrorsBulkTriage, [
      '--project', PID, '--action', 'resolve', '--group', 'eg-1',
    ])
    expect(stderr).toContain('R403-PERM-001')
  })
})

describe('errors assign', () => {
  it('assigns by resolving the member by email', async () => {
    apiMock.get.mockResolvedValue(envelope([{account_id: 'acct-1', email: 'alice@acme.test'}]))
    apiMock.patch.mockResolvedValue(envelope({id: GROUP, assignee: {id: 'acct-1', name: 'Alice'}}))
    const {stdout} = await runCaptured(ErrorsAssign, [GROUP, '--project', PID, '--assignee', 'alice@acme.test'])
    expect(apiMock.patch).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/error_groups/${GROUP}/assign`, {
      assignee_id: 'acct-1',
    })
    expect(stdout).toContain('Alice')
  })

  it('--unassign sends an empty assignee', async () => {
    apiMock.patch.mockResolvedValue(envelope({id: GROUP, assignee: null}))
    const {stdout} = await runCaptured(ErrorsAssign, [GROUP, '--project', PID, '--unassign'])
    expect(apiMock.patch).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/error_groups/${GROUP}/assign`, {
      assignee_id: '',
    })
    expect(stdout).toContain('unassigned')
  })

  // Server-side anti-BOLA: an account outside the organization is not found and the group stays
  // unassigned, with a 200 response identical to a successful one (Errors::Assign). Whoever wrote
  // the command would think they had given the error to someone.
  it("exits non-zero if the server did not apply the assignee", async () => {
    apiMock.patch.mockResolvedValue(envelope({id: GROUP, assignee: null}))
    const {message} = await runExpectingExit(ErrorsAssign, [GROUP, '--project', PID, '--assignee', MID])
    expect(message).toContain('C404-MBR-001')
    expect(message).toContain(MID)
  })

  // UUID_RE accepts uppercase too, so an id written in uppercase reaches the server as
  // is — but the database returns it in lowercase. A literal comparison would read
  // a perfectly successful assignment as rejected, and the command would fail wrongly.
  it('accepts the response even if the id comes back in lowercase', async () => {
    // A UUID with letters, not MID (all digits): it is the only shape where uppercase exists.
    const lower = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
    const upper = lower.toUpperCase()
    apiMock.patch.mockResolvedValue(envelope({id: GROUP, assignee: {id: lower, name: 'Alice'}}))
    const {stdout} = await runCaptured(ErrorsAssign, [GROUP, '--project', PID, '--assignee', upper])
    expect(apiMock.patch).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/error_groups/${GROUP}/assign`, {
      assignee_id: upper,
    })
    expect(stdout).toContain('Alice')
  })

  it('asks for --assignee or --unassign', async () => {
    const {message} = await runExpectingExit(ErrorsAssign, [GROUP, '--project', PID], 2)
    expect(message).toContain('--unassign')
    expect(apiMock.patch).not.toHaveBeenCalled()
  })
})

describe('errors merge', () => {
  it('refuses to merge without --confirm', async () => {
    const {message} = await runExpectingExit(ErrorsMerge, [GROUP, '--project', PID, '--group', 'eg-2'], 2)
    expect(message).toContain('--confirm')
    expect(apiMock.post).not.toHaveBeenCalled()
  })

  // The ids leave raw, without filters or convenience deduplication: all-or-nothing is kept by the
  // server (Errors::Merge#resolve_sources!), and cleaning them here would take away its proof that
  // something is missing — it would merge the valid ones and ignore the others, on an operation that cannot be undone.
  it('POST .../merge with the source ids as they were written', async () => {
    apiMock.post.mockResolvedValue(envelope({id: GROUP, title: 'Boom', events_count: 9}))
    const {stdout} = await runCaptured(ErrorsMerge, [
      GROUP, '--project', PID, '--group', 'eg-2', '--group', 'eg-2', '--group', 'eg-3', '--confirm',
    ])
    expect(apiMock.post).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/error_groups/${GROUP}/merge`, {
      ids: ['eg-2', 'eg-2', 'eg-3'],
    })
    expect(stdout).toContain('Boom')
  })

  // Scenario 1: invalid identifier → the server merges nothing, and the command reports it.
  it('an unknown id stops the merge without touching any group', async () => {
    apiMock.post.mockRejectedValue(
      apiError(422, 'R422-ERROR-004', 'Gruppi non trovati in questo progetto: eg-9. Nessuna fusione eseguita.'),
    )
    const {stderr} = await runExpectingExit(ErrorsMerge, [
      GROUP, '--project', PID, '--group', 'eg-9', '--confirm',
    ])
    expect(stderr).toContain('R422-ERROR-004')
    expect(stderr).toContain('Nessuna fusione eseguita')
  })
})

describe('errors split', () => {
  it('POST .../split with the event_ids and prints the new group', async () => {
    apiMock.post.mockResolvedValue(envelope({id: 'eg-new', title: 'Boom', events_count: 2}))
    const {stdout} = await runCaptured(ErrorsSplit, [
      GROUP, '--project', PID, '--event', 'ev-1', '--event', 'ev-2',
    ])
    expect(apiMock.post).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/error_groups/${GROUP}/split`, {
      event_ids: ['ev-1', 'ev-2'],
    })
    expect(stdout).toContain('eg-new')
  })

  // The server deduplicates the received event_ids (`Array(event_ids).uniq`), so counting the flags
  // written would say two occurrences split off where one was. The real count is the one
  // of the new group, which recount! computes on the occurrences really moved.
  it('counts the split occurrences from the new group, not from the flags written', async () => {
    apiMock.post.mockResolvedValue(envelope({id: 'eg-new', title: 'Boom', events_count: 1}))
    const {stdout} = await runCaptured(ErrorsSplit, [
      GROUP, '--project', PID, '--event', 'ev-1', '--event', 'ev-1',
    ])
    expect(stdout).toContain('Split 1 occurrence out of')
  })

  it("an occurrence that is not from this group stops the split", async () => {
    apiMock.post.mockRejectedValue(
      apiError(422, 'R422-ERROR-006', 'Occorrenze non trovate in questo gruppo: ev-9. Nessuna divisione eseguita.'),
    )
    const {stderr} = await runExpectingExit(ErrorsSplit, [GROUP, '--project', PID, '--event', 'ev-9'])
    expect(stderr).toContain('R422-ERROR-006')
  })
})

describe('errors delete', () => {
  it('refuses to delete without --confirm', async () => {
    const {message} = await runExpectingExit(ErrorsDelete, [GROUP, '--project', PID], 2)
    expect(message).toContain('--confirm')
    expect(apiMock.delete).not.toHaveBeenCalled()
  })

  it('DELETE of the group and its occurrences', async () => {
    apiMock.delete.mockResolvedValue(envelope({id: GROUP, deleted: true}))
    const {stdout} = await runCaptured(ErrorsDelete, [GROUP, '--project', PID, '--confirm'])
    expect(apiMock.delete).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/error_groups/${GROUP}`)
    expect(stdout).toContain(GROUP)
  })
})
