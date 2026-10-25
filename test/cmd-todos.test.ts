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

import TodosComplete from '../src/commands/todos/complete'
import TodosCreate from '../src/commands/todos/create'
import TodosDelete from '../src/commands/todos/delete'
import TodosItemsAdd from '../src/commands/todos/items/add'
import TodosItemsDelete from '../src/commands/todos/items/delete'
import TodosItemsList from '../src/commands/todos/items/list'
import TodosItemsUpdate from '../src/commands/todos/items/update'
import TodosList from '../src/commands/todos/list'
import TodosReorder from '../src/commands/todos/reorder'
import TodosShare from '../src/commands/todos/share'
import TodosShared from '../src/commands/todos/shared'
import TodosSharedShow from '../src/commands/todos/shared-show'
import TodosShares from '../src/commands/todos/shares'
import TodosShow from '../src/commands/todos/show'
import TodosUncomplete from '../src/commands/todos/uncomplete'
import TodosUpdate from '../src/commands/todos/update'

const LID = 'tl-1' // list id (passed through: todo lists have no by-name resolver)
const IID = 'ti-1' // item id
const TKID = 'tk-1' // ticket id

beforeEach(() => resetApiMock())

describe('todos list', () => {
  it('lists the owned lists with item counts (default page)', async () => {
    apiMock.get.mockResolvedValue(
      envelope([{id: LID, name: 'Sprint prep', items_count: 3, done_count: 1}], {total: 1}),
    )
    const {result, stdout} = await runCaptured(TodosList, [])
    expect(apiMock.get).toHaveBeenCalledWith('/cli/v1/todo_lists?page=1')
    expect(stdout).toContain('Sprint prep')
    expect((result as {data: unknown[]}).data).toHaveLength(1)
  })

  it('honours --page', async () => {
    apiMock.get.mockResolvedValue(envelope([]))
    await runCaptured(TodosList, ['--page', '2'])
    expect(apiMock.get).toHaveBeenCalledWith('/cli/v1/todo_lists?page=2')
  })

  it('exits non-zero on an API error', async () => {
    apiMock.get.mockRejectedValue(apiError(500, 'R500-SYS-001', 'server down'))
    const {stderr} = await runExpectingExit(TodosList, [])
    expect(stderr).toContain('R500-SYS-001')
  })
})

describe('todos show', () => {
  it('fetches a single list by id', async () => {
    apiMock.get.mockResolvedValue(envelope({id: LID, name: 'Sprint prep'}))
    const {stdout} = await runCaptured(TodosShow, [LID])
    expect(apiMock.get).toHaveBeenCalledWith(`/cli/v1/todo_lists/${LID}`)
    expect(stdout).toContain('Sprint prep')
  })
})

describe('todos create', () => {
  it('posts name only when --color is omitted', async () => {
    apiMock.post.mockResolvedValue(envelope({id: LID, name: 'Sprint prep'}))
    const {stdout} = await runCaptured(TodosCreate, ['--name', 'Sprint prep'])
    expect(apiMock.post).toHaveBeenCalledWith('/cli/v1/todo_lists', {name: 'Sprint prep'})
    expect(stdout).toContain('Todo list created')
  })

  it('maps --color into the body', async () => {
    apiMock.post.mockResolvedValue(envelope({id: LID}))
    await runCaptured(TodosCreate, ['--name', 'Sprint prep', '--color', 'indigo'])
    expect(apiMock.post).toHaveBeenCalledWith('/cli/v1/todo_lists', {name: 'Sprint prep', color: 'indigo'})
  })
})

describe('todos update', () => {
  it('sends only --name', async () => {
    apiMock.put.mockResolvedValue(envelope({id: LID, name: 'New'}))
    const {stdout} = await runCaptured(TodosUpdate, [LID, '--name', 'New'])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/todo_lists/${LID}`, {name: 'New'})
    expect(stdout).toContain('Todo list updated')
  })

  it('sends only --color', async () => {
    apiMock.put.mockResolvedValue(envelope({id: LID}))
    await runCaptured(TodosUpdate, [LID, '--color', 'rose'])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/todo_lists/${LID}`, {color: 'rose'})
  })
})

describe('todos delete', () => {
  it('refuses without --confirm (exit 2, no api call)', async () => {
    const {message} = await runExpectingExit(TodosDelete, [LID], 2)
    expect(message).toContain('Refusing to delete')
    expect(apiMock.delete).not.toHaveBeenCalled()
  })

  it('deletes with --confirm', async () => {
    apiMock.delete.mockResolvedValue(envelope({}))
    const {result, stdout} = await runCaptured(TodosDelete, [LID, '--confirm'])
    expect(apiMock.delete).toHaveBeenCalledWith(`/cli/v1/todo_lists/${LID}`)
    expect(stdout).toContain('Deleted todo list')
    expect((result as {deleted: string}).deleted).toBe(LID)
  })

  it('deletes silently in --json mode', async () => {
    apiMock.delete.mockResolvedValue(envelope({}))
    const {result} = await runCaptured(TodosDelete, [LID, '--confirm', '--json'])
    expect((result as {deleted: string}).deleted).toBe(LID)
  })
})

describe('todos reorder', () => {
  it('PUTs the list ids in the given order', async () => {
    apiMock.put.mockResolvedValue(envelope(null))
    const {stdout} = await runCaptured(TodosReorder, ['--list', LID, '--list', 'tl-2'])
    expect(apiMock.put).toHaveBeenCalledWith('/cli/v1/todo_lists/reorder', {ordered_ids: [LID, 'tl-2']})
    expect(stdout).toContain('Reordered 2 todo lists')
  })
})

describe('todos shares / share', () => {
  it('lists the recipients of a list', async () => {
    apiMock.get.mockResolvedValue(envelope([{id: 'acc-1', name: 'Ada', handle: 'ada'}]))
    const {stdout} = await runCaptured(TodosShares, [LID])
    expect(apiMock.get).toHaveBeenCalledWith(`/cli/v1/todo_lists/${LID}/sharing`)
    expect(stdout).toContain('ada')
  })

  it('shares with the given accounts', async () => {
    apiMock.put.mockResolvedValue(envelope([{id: 'acc-1', name: 'Ada', handle: 'ada'}]))
    const {stdout} = await runCaptured(TodosShare, [LID, '--account', 'acc-1', '--account', 'acc-2'])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/todo_lists/${LID}/sharing`, {
      account_ids: ['acc-1', 'acc-2'],
    })
    expect(stdout).toContain('shared with 1 members')
  })

  it('unshares everything when --account is omitted (empty set)', async () => {
    apiMock.put.mockResolvedValue(envelope([]))
    const {stdout} = await runCaptured(TodosShare, [LID])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/todo_lists/${LID}/sharing`, {account_ids: []})
    expect(stdout).toContain('shared with 0 members')
  })
})

describe('todos complete / uncomplete', () => {
  it('completes an item (PUT completion)', async () => {
    apiMock.put.mockResolvedValue(envelope({id: IID, done: true}))
    const {stdout} = await runCaptured(TodosComplete, [LID, IID])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/todo_lists/${LID}/items/${IID}/completion`)
    expect(stdout).toContain('Todo item completed')
  })

  it('reopens an item (DELETE completion)', async () => {
    apiMock.delete.mockResolvedValue(envelope({id: IID, done: false}))
    const {stdout} = await runCaptured(TodosUncomplete, [LID, IID])
    expect(apiMock.delete).toHaveBeenCalledWith(`/cli/v1/todo_lists/${LID}/items/${IID}/completion`)
    expect(stdout).toContain('Todo item reopened')
  })
})

describe('todos shared (received)', () => {
  it('lists received lists with the owner name (owner present and absent)', async () => {
    apiMock.get.mockResolvedValue(
      envelope([
        {id: LID, name: 'Roadmap', owner: {name: 'Ada'}, items_count: 2, done_count: 0},
        {id: 'tl-2', name: 'Orphan'}, // no owner → the optional-chain / ?? '' fallback
      ]),
    )
    const {stdout} = await runCaptured(TodosShared, [])
    expect(apiMock.get).toHaveBeenCalledWith('/cli/v1/shared_todo_lists?page=1')
    expect(stdout).toContain('Ada')
  })

  it('honours --page', async () => {
    apiMock.get.mockResolvedValue(envelope([]))
    await runCaptured(TodosShared, ['--page', '3'])
    expect(apiMock.get).toHaveBeenCalledWith('/cli/v1/shared_todo_lists?page=3')
  })

  it('shows a single received list', async () => {
    apiMock.get.mockResolvedValue(envelope({id: LID, name: 'Roadmap'}))
    const {stdout} = await runCaptured(TodosSharedShow, [LID])
    expect(apiMock.get).toHaveBeenCalledWith(`/cli/v1/shared_todo_lists/${LID}`)
    expect(stdout).toContain('Roadmap')
  })
})

describe('todos items list', () => {
  it('lists items rendering done state and ticket code (both branches)', async () => {
    apiMock.get.mockResolvedValue(
      envelope([
        {id: IID, title: 'Write changelog', done: true, ticket_code: 'ACME-12'},
        {id: 'ti-2', title: 'Fix login', done: false}, // done=no + ticket '-'
      ]),
    )
    const {stdout} = await runCaptured(TodosItemsList, [LID])
    expect(apiMock.get).toHaveBeenCalledWith(`/cli/v1/todo_lists/${LID}/items?page=1`)
    expect(stdout).toContain('ACME-12')
    expect(stdout).toContain('yes')
    expect(stdout).toContain('no')
  })
})

describe('todos items add', () => {
  it('posts title only when ticket and position are omitted', async () => {
    apiMock.post.mockResolvedValue(envelope({id: IID, title: 'T'}))
    const {stdout} = await runCaptured(TodosItemsAdd, [LID, '--title', 'T'])
    expect(apiMock.post).toHaveBeenCalledWith(`/cli/v1/todo_lists/${LID}/items`, {title: 'T'})
    expect(stdout).toContain('Todo item added')
  })

  it('maps --ticket and --position into the body', async () => {
    apiMock.post.mockResolvedValue(envelope({id: IID}))
    await runCaptured(TodosItemsAdd, [LID, '--title', 'T', '--ticket', TKID, '--position', '2'])
    expect(apiMock.post).toHaveBeenCalledWith(`/cli/v1/todo_lists/${LID}/items`, {
      title: 'T',
      ticket_id: TKID,
      position: 2,
    })
  })
})

describe('todos items update', () => {
  it('sends only --title', async () => {
    apiMock.put.mockResolvedValue(envelope({id: IID, title: 'New'}))
    const {stdout} = await runCaptured(TodosItemsUpdate, [LID, IID, '--title', 'New'])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/todo_lists/${LID}/items/${IID}`, {title: 'New'})
    expect(stdout).toContain('Todo item updated')
  })

  it('relinks a ticket and repositions (title omitted)', async () => {
    apiMock.put.mockResolvedValue(envelope({id: IID}))
    await runCaptured(TodosItemsUpdate, [LID, IID, '--ticket', TKID, '--position', '3'])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/todo_lists/${LID}/items/${IID}`, {
      ticket_id: TKID,
      position: 3,
    })
  })
})

describe('todos items delete', () => {
  it('refuses without --confirm (exit 2, no api call)', async () => {
    const {message} = await runExpectingExit(TodosItemsDelete, [LID, IID], 2)
    expect(message).toContain('Refusing to delete')
    expect(apiMock.delete).not.toHaveBeenCalled()
  })

  it('deletes with --confirm', async () => {
    apiMock.delete.mockResolvedValue(envelope({}))
    const {result, stdout} = await runCaptured(TodosItemsDelete, [LID, IID, '--confirm'])
    expect(apiMock.delete).toHaveBeenCalledWith(`/cli/v1/todo_lists/${LID}/items/${IID}`)
    expect(stdout).toContain('Deleted todo item')
    expect((result as {deleted: string}).deleted).toBe(IID)
  })

  it('deletes silently in --json mode', async () => {
    apiMock.delete.mockResolvedValue(envelope({}))
    const {result} = await runCaptured(TodosItemsDelete, [LID, IID, '--confirm', '--json'])
    expect((result as {deleted: string}).deleted).toBe(IID)
  })
})

/**
 * Cross-command branch coverage (mirrors test/cmd-branches.test.ts):
 *  - `--json` → the else side of every `if (!this.jsonEnabled())`.
 *  - `{data: undefined}` → the fallback side of `res.data ?? {}` / `?? []`.
 *  - a sparse `[{}]` row → the null side of each `String(x ?? '')` in the tables.
 * delete/items-delete are covered above (they return `{deleted}`, not an envelope).
 */
type Entry = [name: string, command: {run: typeof TodosShow.run}, argv: string[]]

const recordCommands: Entry[] = [
  ['todos show', TodosShow, [LID]],
  ['todos create', TodosCreate, ['--name', 'L']],
  ['todos update', TodosUpdate, [LID]],
  ['todos reorder', TodosReorder, ['--list', LID]],
  ['todos complete', TodosComplete, [LID, IID]],
  ['todos uncomplete', TodosUncomplete, [LID, IID]],
  ['todos shared-show', TodosSharedShow, [LID]],
  ['todos items add', TodosItemsAdd, [LID, '--title', 'T']],
  ['todos items update', TodosItemsUpdate, [LID, IID]],
]

const arrayCommands: Entry[] = [
  ['todos list', TodosList, []],
  ['todos shares', TodosShares, [LID]],
  ['todos share', TodosShare, [LID]],
  ['todos shared', TodosShared, []],
  ['todos items list', TodosItemsList, [LID]],
]

function resolveAllWith(value: unknown): void {
  for (const method of ['get', 'post', 'put', 'delete'] as const) apiMock[method].mockResolvedValue(value)
}

describe('--json suppresses human output and returns the envelope', () => {
  it.each(recordCommands)('%s --json', async (_name, command, argv) => {
    resolveAllWith(envelope({id: 'x', done: true}))
    const {result, stdout} = await runCaptured(command, [...argv, '--json'])
    expect(result).toBeTruthy()
    expect(stdout).toContain('"data"')
  })

  it.each(arrayCommands)('%s --json', async (_name, command, argv) => {
    resolveAllWith(envelope([{id: 'x'}]))
    const {result, stdout} = await runCaptured(command, [...argv, '--json'])
    expect(result).toBeTruthy()
    expect(stdout).toContain('"data"')
  })
})

describe('a null envelope falls back to an empty record/list without crashing', () => {
  it.each([...recordCommands, ...arrayCommands])('%s tolerates data: undefined', async (_name, command, argv) => {
    resolveAllWith({data: undefined})
    await expect(runCaptured(command, argv)).resolves.toBeTruthy()
  })
})

describe('tables render sparse rows without crashing (null-field fallbacks)', () => {
  it.each(arrayCommands)('%s renders empty cells for a sparse row', async (_name, command, argv) => {
    resolveAllWith(envelope([{}]))
    await expect(runCaptured(command, argv)).resolves.toBeTruthy()
  })
})
