import {beforeEach, describe, expect, it, vi} from 'vitest'
import {apiMock, resetApiMock} from './helpers/api-mock'
import {PID, apiError, capture, envelope, run, runCaptured, runExpectingExit} from './helpers/command'

vi.mock('../src/lib/api', async (io) => {
  const actual = await io<typeof import('../src/lib/api')>()
  const {apiMock} = await import('./helpers/api-mock')
  return {...actual, CliApi: vi.fn(function () { return apiMock })}
})
vi.mock('../src/lib/config', async (io) => {
  const actual = await io<typeof import('../src/lib/config')>()
  return {...actual, loadConfig: vi.fn(() => ({apiUrl: 'https://api.test', token: 'tok_test'}))}
})

import TicketsDependenciesAdd from '../src/commands/tickets/dependencies/add'
import TicketsDependenciesList from '../src/commands/tickets/dependencies/list'
import TicketsDependenciesRemove from '../src/commands/tickets/dependencies/remove'

const T = 'CYRA-132'
const BASE = `/cli/v1/projects/${PID}/tickets/${T}/dependencies`

// CYCL-39 — you decide the work order by approving the plan, and so far the only way to write it was
// the page: one link per round, 55 times. And twelve of those links join two different products, which
// simply cannot be written from the page — the server accepts them, it is the menu that does not offer them.
describe('tickets dependencies', () => {
  beforeEach(() => resetApiMock())

  describe('list', () => {
    it('lists code, title, status and whether it is done', async () => {
      apiMock.get.mockResolvedValue(envelope([
        {id: 'dep-1', hidden: false, code: 'CYAU-83', title: 'La macchina non rifà il lavoro',
         done: false, status: {label: 'In lavorazione', code: 'in_progress'}},
      ]))

      const {stdout} = await runCaptured(TicketsDependenciesList, [T, '--project', PID])

      expect(apiMock.get).toHaveBeenCalledWith(BASE)
      expect(stdout).toContain('dep-1')
      expect(stdout).toContain('CYAU-83')
      expect(stdout).toContain('In lavorazione')
      expect(stdout).toContain('no')
    })

    // A prerequisite in a product your access cannot see: it says THAT it exists and whether it is done, not
    // which one it is. Hiding its very existence would say «this ticket is not blocked» — false, and it would
    // make you start.
    it('a prerequisite outside your access stays visible as a fact, without name or title', async () => {
      apiMock.get.mockResolvedValue(envelope([
        {id: 'dep-2', hidden: true, code: null, title: null, done: true, status: {label: 'Fatto', code: 'done'}},
      ]))

      const {stdout} = await runCaptured(TicketsDependenciesList, [T, '--project', PID])

      expect(stdout).toContain('dep-2')
      expect(stdout).toContain('Fatto')
      expect(stdout).toContain('sì')
      // The row must SAY it is hidden. An empty cell reads as «missing data» and invites you to
      // ignore it: here the data is there, and it is that a prerequisite exists and you cannot see it.
      expect(stdout).toContain('(nascosto)')
      expect(stdout).toContain('(fuori dal tuo accesso)')
      expect(stdout).not.toContain('null')
    })
  })

  describe('add', () => {
    it('POST with the prerequisite code, even from another product', async () => {
      apiMock.post.mockResolvedValue(envelope({id: 'dep-9'}))

      await run(TicketsDependenciesAdd, [T, 'CYAU-83', '--project', PID])

      expect(apiMock.post).toHaveBeenCalledWith(BASE, {blocker: 'CYAU-83'})
    })

    // Re-running the file of 55 links must be safe: a link already written is work already done,
    // not an error.
    it('an existing link is not an error: it says so and exits 0', async () => {
      apiMock.post.mockRejectedValue(apiError(422, 'R422-TICKET-017', 'Dipendenza non valida'))
      apiMock.get.mockResolvedValue(envelope([{id: 'dep-1', code: 'CYAU-83'}]))

      const {stdout} = await runCaptured(TicketsDependenciesAdd, [T, 'CYAU-83', '--project', PID])

      expect(stdout).toContain('già presente')
      expect(process.exitCode ?? 0).toBe(0)
    })

    // THE distinction that makes the point above safe: the same code answers EVERY edge not
    // allowed. Treating it wholesale as «fine» would pass off as successful rows rejected for
    // a completely different reason — and the file would look applied when it is not.
    it('the same code, but the link is NOT there: then it is a real error and propagates', async () => {
      apiMock.post.mockRejectedValue(apiError(422, 'R422-TICKET-017', 'Dipendenza non valida'))
      apiMock.get.mockResolvedValue(envelope([{id: 'dep-1', code: 'QUALCUN-ALTRO'}]))

      await runExpectingExit(TicketsDependenciesAdd, [T, 'CYAU-83', '--project', PID], 1)
    })

    it('a cycle between prerequisites always propagates: the row is wrong and must be seen', async () => {
      apiMock.post.mockRejectedValue(apiError(422, 'R422-TICKET-013', 'Ciclo'))

      await runExpectingExit(TicketsDependenciesAdd, [T, 'CYAU-83', '--project', PID], 1)
      expect(apiMock.get).not.toHaveBeenCalled()
    })

    it('a prerequisite that does not exist always propagates', async () => {
      apiMock.post.mockRejectedValue(apiError(404, 'R404-TICKET-015', 'Blocker non trovato'))

      await runExpectingExit(TicketsDependenciesAdd, [T, 'MAI-1', '--project', PID], 1)
      expect(apiMock.get).not.toHaveBeenCalled()
    })
  })

  describe('remove', () => {
    // The server wants the dependency UUID, which no command has ever shown you: the prerequisite is
    // named by its code, the one you wrote to add it.
    it('resolves the prerequisite code into the dependency id', async () => {
      apiMock.get.mockResolvedValue(envelope([{id: 'dep-7', code: 'CYAU-83'}]))
      apiMock.delete.mockResolvedValue(envelope({}))

      await run(TicketsDependenciesRemove, [T, 'CYAU-83', '--project', PID])

      expect(apiMock.delete).toHaveBeenCalledWith(`${BASE}/dep-7`)
    })

    it('also accepts the dependency id, which is what list prints', async () => {
      apiMock.get.mockResolvedValue(envelope([{id: 'dep-7', code: 'CYAU-83'}]))
      apiMock.delete.mockResolvedValue(envelope({}))

      await run(TicketsDependenciesRemove, [T, 'dep-7', '--project', PID])

      expect(apiMock.delete).toHaveBeenCalledWith(`${BASE}/dep-7`)
    })

    // No blind DELETE: without having found the edge, sending it would mean asking the server
    // to delete an id we do not have and reading its 404 as if it were our answer.
    it('missing prerequisite → exit 2 and no DELETE', async () => {
      apiMock.get.mockResolvedValue(envelope([{id: 'dep-7', code: 'QUALCUN-ALTRO'}]))

      const {message} = await runExpectingExit(TicketsDependenciesRemove, [T, 'CYAU-83', '--project', PID], 2)

      expect(message).toContain('Nessun prerequisito')
      expect(apiMock.delete).not.toHaveBeenCalled()
    })
  })
})

// A HIDDEN prerequisite has `code: null`, which compared as a string counts as "". An empty argument
// therefore becomes "" and matches the first redacted row: `remove <ticket> ""` would delete a
// prerequisite the caller does not even have the right to see, without saying anything. It is the
// worst combination — an unchecked argument that reaches a deletion, and hits
// exactly the row you would not notice.
describe('an empty prerequisite deletes nothing (security review)', () => {
  beforeEach(() => resetApiMock())

  it('remove with an empty argument: exit 2, and no DELETE', async () => {
    apiMock.get.mockResolvedValue(envelope([{id: 'dep-nascosta', hidden: true, code: null, blocker_id: null}]))

    await runExpectingExit(TicketsDependenciesRemove, ['CYRA-132', '', '--project', PID], 2)

    expect(apiMock.delete).not.toHaveBeenCalled()
  })

  it('remove with only spaces: same', async () => {
    apiMock.get.mockResolvedValue(envelope([{id: 'dep-nascosta', hidden: true, code: null, blocker_id: null}]))

    await runExpectingExit(TicketsDependenciesRemove, ['CYRA-132', '   ', '--project', PID], 2)

    expect(apiMock.delete).not.toHaveBeenCalled()
  })

  // Twin on the other side: with an empty argument add would say «already present» by reading a redacted
  // row, and would exit 0 — a real error passing for work done.
  it('add with an empty argument does not say «already present» by reading a redacted row', async () => {
    apiMock.post.mockRejectedValue(apiError(422, 'R422-TICKET-017', 'Dipendenza non valida'))
    apiMock.get.mockResolvedValue(envelope([{id: 'dep-nascosta', hidden: true, code: null}]))

    await runExpectingExit(TicketsDependenciesAdd, ['CYRA-132', '', '--project', PID], 2)
  })
})
