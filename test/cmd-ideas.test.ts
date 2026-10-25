import {beforeEach, describe, expect, it, vi} from 'vitest'
import {apiMock, resetApiMock} from './helpers/api-mock'
import {PID, envelope, run, runCaptured, runExpectingExit} from './helpers/command'

vi.mock('../src/lib/api', async (io) => {
  const actual = await io<typeof import('../src/lib/api')>()
  const {apiMock} = await import('./helpers/api-mock')
  return {...actual, CliApi: vi.fn(function () { return apiMock })}
})
vi.mock('../src/lib/config', async (io) => {
  const actual = await io<typeof import('../src/lib/config')>()
  return {...actual, loadConfig: vi.fn(() => ({apiUrl: 'https://api.test', token: 'tok_test'}))}
})

import IdeasComment from '../src/commands/ideas/comment'
import IdeasCommentDelete from '../src/commands/ideas/comment-delete'
import IdeasComments from '../src/commands/ideas/comments'
import IdeasConvert from '../src/commands/ideas/convert'
import IdeasCreate from '../src/commands/ideas/create'
import IdeasList from '../src/commands/ideas/list'
import IdeasShow from '../src/commands/ideas/show'
import IdeasUnvote from '../src/commands/ideas/unvote'
import IdeasUpdate from '../src/commands/ideas/update'
import IdeasVote from '../src/commands/ideas/vote'
import IdeasCase from '../src/commands/ideas/case'
import IdeasCaseDelete from '../src/commands/ideas/case-delete'
import IdeasCaseUpdate from '../src/commands/ideas/case-update'
import IdeasArchive from '../src/commands/ideas/archive'
import IdeasDelete from '../src/commands/ideas/delete'
import IdeasUnarchive from '../src/commands/ideas/unarchive'
import IdeasLink from '../src/commands/ideas/link'
import IdeasUnlink from '../src/commands/ideas/unlink'

const I = 'idea-1'
// Lookup ids: passing a UUID skips the by-name resolution, so no extra GET (CYCL-34).
const STATUS_UUID = '66666666-6666-4666-8666-666666666666'
const PRIORITY_UUID = '77777777-7777-4777-8777-777777777777'

beforeEach(() => {
  resetApiMock()
})

describe('ideas list / show', () => {
  it('list calls the endpoint with page and prints the table', async () => {
    apiMock.get.mockResolvedValue(
      envelope([{id: I, title: 'Dark mode', status: 'open', votes_count: 3, comments_count: 2}]),
    )
    const {stdout: out} = await runCaptured(IdeasList, ['--project', PID])
    expect(apiMock.get).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/ideas?page=1`)
    expect(out).toContain('Dark mode')
    expect(out).toContain('open')
  })

  it('list passes status and sort as query params', async () => {
    apiMock.get.mockResolvedValue(envelope([]))
    await runCaptured(IdeasList, ['--project', PID, '--status', 'archived', '--sort', 'recent'])
    expect(apiMock.get).toHaveBeenCalledWith(
      `/cli/v1/projects/${PID}/ideas?page=1&status=archived&sort=recent`,
    )
  })

  it('show prints the fields, multiline problem, solution and stakeholders', async () => {
    apiMock.get.mockResolvedValue(
      envelope({id: I, title: 'Dark mode', status: 'open', problem: 'riga1\nriga2',
                solution: 'Tema scuro', stakeholders: ['Team Mobile', 'Clienti']}),
    )
    const {stdout: out} = await runCaptured(IdeasShow, [I, '--project', PID])
    expect(apiMock.get).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/ideas/${I}`)
    expect(out).toContain('Problem:')
    expect(out).toContain('riga1')
    expect(out).toContain('Solution:')
    expect(out).toContain('Stakeholders: Team Mobile, Clienti')
  })

  // CYCL-61 — monetization, risks and linked ideas in show.
  it('show prints monetization, risks, base, evolutions and linked ideas', async () => {
    apiMock.get.mockResolvedValue(
      envelope({id: I, title: 'Tavoli', status: 'open', problem: 'p', monetization: 'Boost a pagamento',
                risks: 'Serve moderazione', parent: {id: 'base-1', title: 'Compagni di serata', status: 'open'},
                evolutions: [], related_ideas: [{id: 'rel-1', title: 'Marketplace DJ', status: 'open'}]}),
    )
    const {stdout: out} = await runCaptured(IdeasShow, [I, '--project', PID])
    expect(out).toContain('Monetization:')
    expect(out).toContain('Boost a pagamento')
    expect(out).toContain('Risks and constraints:')
    expect(out).toContain('Evolves from: Compagni di serata (base-1)')
    expect(out).toContain('Related ideas:')
    expect(out).toContain('- Marketplace DJ · open · rel-1')
    expect(out).not.toContain('Evolutions:')
  })
})

describe('ideas create', () => {
  it('POST with title, problem, solution and stakeholders (repeatable)', async () => {
    apiMock.post.mockResolvedValue(envelope({id: I, title: 'Dark mode'}))
    await runCaptured(IdeasCreate, [
      '--project', PID, '--title', 'Dark mode',
      '--problem', 'La dashboard acceca di notte', '--solution', 'Tema scuro',
      '--stakeholders', 'Team Mobile', '--stakeholders', 'Clienti',
    ])
    expect(apiMock.post).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/ideas`, {
      title: 'Dark mode',
      problem: 'La dashboard acceca di notte',
      solution: 'Tema scuro',
      monetization: undefined,
      risks: undefined,
      evolves_id: undefined,
      stakeholders: ['Team Mobile', 'Clienti'],
    })
  })

  // CYCL-61 — an evolution is born already linked to its base, with monetization and risks.
  it('POST with --evolves, --monetization and --risks', async () => {
    apiMock.post.mockResolvedValue(envelope({id: I, title: 'Tavoli'}))
    await runCaptured(IdeasCreate, [
      '--project', PID, '--title', 'Tavoli', '--problem', 'p',
      '--monetization', 'Boost', '--risks', 'Moderazione', '--evolves', 'base-1',
    ])
    expect(apiMock.post).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/ideas`, {
      title: 'Tavoli',
      problem: 'p',
      solution: undefined,
      monetization: 'Boost',
      risks: 'Moderazione',
      evolves_id: 'base-1',
      stakeholders: [],
    })
  })

  it('POST with the problem only: solution undefined, stakeholders empty list', async () => {
    apiMock.post.mockResolvedValue(envelope({id: I, title: 'X'}))
    await runCaptured(IdeasCreate, ['--project', PID, '--title', 'X', '--problem', 'p'])
    expect(apiMock.post).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/ideas`, {
      title: 'X',
      problem: 'p',
      solution: undefined,
      monetization: undefined,
      risks: undefined,
      evolves_id: undefined,
      stakeholders: [],
    })
  })
})

describe('ideas update', () => {
  it('PUT full replace with title, problem, solution and stakeholders (repeatable)', async () => {
    apiMock.put.mockResolvedValue(envelope({id: I, title: 'Referral'}))
    await runCaptured(IdeasUpdate, [
      I, '--project', PID, '--title', 'Referral',
      '--problem', 'La crescita è a pagamento', '--solution', 'Inviti tracciati',
      '--stakeholders', 'Growth', '--stakeholders', 'Backend',
    ])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/ideas/${I}`, {
      title: 'Referral',
      problem: 'La crescita è a pagamento',
      solution: 'Inviti tracciati',
      stakeholders: ['Growth', 'Backend'],
    })
  })

  it('PUT with --monetization and --risks: in the body only when passed', async () => {
    apiMock.put.mockResolvedValue(envelope({id: I, title: 'X'}))
    await runCaptured(IdeasUpdate, [I, '--project', PID, '--title', 'X', '--problem', 'p', '--risks', 'r'])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/ideas/${I}`, {
      title: 'X',
      problem: 'p',
      risks: 'r',
    })
  })

  it('PUT with only title+problem: solution and stakeholders omitted from the body', async () => {
    apiMock.put.mockResolvedValue(envelope({id: I, title: 'X'}))
    await runCaptured(IdeasUpdate, [I, '--project', PID, '--title', 'X', '--problem', 'p'])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/ideas/${I}`, {
      title: 'X',
      problem: 'p',
    })
  })
})

describe('ideas case', () => {
  it('POST with title and description', async () => {
    apiMock.post.mockResolvedValue(envelope({id: 'case-1', idea_id: I, title: 'Check-in QR'}))
    await runCaptured(IdeasCase, [I, '--project', PID, '--title', 'Check-in QR', '--description', 'Scan del QR'])
    expect(apiMock.post).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/ideas/${I}/cases`, {
      title: 'Check-in QR',
      description: 'Scan del QR',
    })
  })

  it('POST with the title only: description undefined', async () => {
    apiMock.post.mockResolvedValue(envelope({id: 'case-1', idea_id: I, title: 'Solo titolo'}))
    await runCaptured(IdeasCase, [I, '--project', PID, '--title', 'Solo titolo'])
    expect(apiMock.post).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/ideas/${I}/cases`, {
      title: 'Solo titolo',
      description: undefined,
    })
  })
})

describe('ideas vote / unvote', () => {
  it('vote does PUT on the singleton and prints the count', async () => {
    apiMock.put.mockResolvedValue(envelope({idea_id: I, votes_count: 4, voted: true}))
    const {stdout: out} = await runCaptured(IdeasVote, [I, '--project', PID])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/ideas/${I}/vote`)
    expect(out).toContain('(4 votes)')
  })

  it('unvote does DELETE on the singleton', async () => {
    apiMock.delete.mockResolvedValue(envelope({idea_id: I, votes_count: 0, voted: false}))
    await runCaptured(IdeasUnvote, [I, '--project', PID])
    expect(apiMock.delete).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/ideas/${I}/vote`)
  })
})

describe('ideas comments', () => {
  it('comment does POST with the body', async () => {
    apiMock.post.mockResolvedValue(envelope({id: 'c-1', body: 'Ottima idea'}))
    await runCaptured(IdeasComment, [I, '--project', PID, '--body', 'Ottima idea'])
    expect(apiMock.post).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/ideas/${I}/comments`, {
      body: 'Ottima idea',
    })
  })

  it('comments reads all the pages and prints author + body', async () => {
    apiMock.get.mockResolvedValue({
      data: [{id: 'c-1', author: 'Dana', body: 'Serve su mobile', created_at: '2026-07-02'}],
      meta: {total_pages: 1},
    })
    const {stdout: out} = await runCaptured(IdeasComments, [I, '--project', PID])
    expect(apiMock.get).toHaveBeenCalledWith(
      `/cli/v1/projects/${PID}/ideas/${I}/comments?page=1&per=100`,
    )
    expect(out).toContain('Dana')
    expect(out).toContain('Serve su mobile')
  })

  it('comment-delete rejects without --confirm (exit 2)', async () => {
    await runExpectingExit(IdeasCommentDelete, [I, '--project', PID, '--comment-id', 'c-1'], 2)
    expect(apiMock.delete).not.toHaveBeenCalled()
  })

  it('comment-delete with --confirm does DELETE', async () => {
    apiMock.delete.mockResolvedValue(envelope({}))
    await runCaptured(IdeasCommentDelete, [I, '--project', PID, '--comment-id', 'c-1', '--confirm'])
    expect(apiMock.delete).toHaveBeenCalledWith(
      `/cli/v1/projects/${PID}/ideas/${I}/comments/c-1`,
    )
  })
})

describe('ideas convert', () => {
  it('without an explicit draft does an empty PUT (server-side AI synthesis) and warns about the wait', async () => {
    apiMock.put.mockResolvedValue(envelope({id: 'tk-1', code: 'ACME-7', title: 'Dark mode'}))
    const {stdout: out} = await runCaptured(IdeasConvert, [I, '--project', PID])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/ideas/${I}/conversion`, {})
    expect(out).toContain('AI')
    expect(out).toContain('ACME-7')
  })

  it('with an explicit draft maps all the flags', async () => {
    apiMock.put.mockResolvedValue(envelope({id: 'tk-1', code: 'ACME-8'}))
    await runCaptured(IdeasConvert, [
      I, '--project', PID,
      '--title', 'T', '--description', 'D', '--kind', 'story',
      '--status', STATUS_UUID, '--priority', PRIORITY_UUID,
    ])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/ideas/${I}/conversion`, {
      title: 'T', description: 'D', kind: 'story', status_id: STATUS_UUID, priority_id: PRIORITY_UUID,
    })
    expect(apiMock.get).not.toHaveBeenCalled()
  })

  // The ticket born from an idea also takes status and priority by name (CYCL-34).
  it('--status and --priority accept the code, and the old --status-id/--priority-id stay valid', async () => {
    apiMock.put.mockResolvedValue(envelope({id: 'tk-1', code: 'ACME-9'}))
    apiMock.get.mockImplementation(async (path: string) => {
      if (path.startsWith('/cli/v1/types/ticket_statuses')) {
        return envelope([{id: 'st-open', code: 'open', label: 'Open'}])
      }
      if (path.startsWith('/cli/v1/types/ticket_priorities')) {
        return envelope([{id: 'pr-high', code: 'high', label: 'High'}])
      }
      throw new Error(`GET inattesa: ${path}`)
    })
    await runCaptured(IdeasConvert, [
      I, '--project', PID, '--title', 'T', '--description', 'D',
      '--status', 'open', '--priority-id', 'High',
    ])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/ideas/${I}/conversion`, {
      title: 'T', description: 'D', status_id: 'st-open', priority_id: 'pr-high',
    })
  })
})

// Coverage of the else branch of `if (!this.jsonEnabled())` (--json mode = output suppressed, returns
// the envelope) + the fallback branches the happy path does not touch (missing counter/body, empty list).
describe('ideas — branch coverage (--json and edge)', () => {
  it('show --json returns the envelope without readable output', async () => {
    apiMock.get.mockResolvedValue(envelope({id: I, title: 'X', problem: 'b'}))
    const res = (await run(IdeasShow, [I, '--project', PID, '--json'])) as {data: {id: string}}
    expect(res.data.id).toBe(I)
  })

  it('show with the problem only skips the Solution/Stakeholders blocks', async () => {
    apiMock.get.mockResolvedValue(envelope({id: I, title: 'X', problem: 'p'}))
    const {stdout: out} = await runCaptured(IdeasShow, [I, '--project', PID])
    expect(out).toContain('Problem:')
    expect(out).not.toContain('Solution:')
    expect(out).not.toContain('Stakeholders:')
  })

  it('create --json returns the envelope', async () => {
    apiMock.post.mockResolvedValue(envelope({id: I}))
    const res = (await run(IdeasCreate, ['--project', PID, '--title', 'X', '--problem', 'y', '--json'])) as {
      data: {id: string}
    }
    expect(res.data.id).toBe(I)
  })

  it('vote --json + payload without votes_count (missing counter)', async () => {
    apiMock.put.mockResolvedValue(envelope({idea_id: I}))
    const res = (await run(IdeasVote, [I, '--project', PID, '--json'])) as {data: unknown}
    expect(res.data).toBeTruthy()
    // human mode with a missing counter → no "(n votes)" parenthesis
    const {stdout: out} = await runCaptured(IdeasVote, [I, '--project', PID])
    expect(out).toContain(`Voted idea ${I}`)
    expect(out).not.toContain('votes)')
  })

  it('unvote human mode without votes_count', async () => {
    apiMock.delete.mockResolvedValue(envelope({idea_id: I}))
    const {stdout: out} = await runCaptured(IdeasUnvote, [I, '--project', PID])
    expect(out).toContain(`Removed vote from idea ${I}`)
    expect(out).not.toContain('votes)')
  })

  it('comment --json returns the envelope', async () => {
    apiMock.post.mockResolvedValue(envelope({id: 'c-1'}))
    const res = (await run(IdeasComment, [I, '--project', PID, '--body', 'x', '--json'])) as {data: unknown}
    expect(res.data).toBeTruthy()
  })

  it('comments --json and empty comments', async () => {
    apiMock.get.mockResolvedValue({data: [], meta: {total_pages: 1}})
    const res = (await run(IdeasComments, [I, '--project', PID, '--json'])) as {data: unknown[]}
    expect(res.data).toHaveLength(0)
    const {stdout: out} = await runCaptured(IdeasComments, [I, '--project', PID])
    expect(out).toContain('(nessun commento)')
  })

  it('convert --json does not print the AI warning', async () => {
    apiMock.put.mockResolvedValue(envelope({id: 'tk-1', code: 'ACME-9'}))
    const res = (await run(IdeasConvert, [I, '--project', PID, '--json'])) as {data: unknown}
    expect(res.data).toBeTruthy()
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/ideas/${I}/conversion`, {})
  })

  it('update --json returns the envelope without readable output', async () => {
    apiMock.put.mockResolvedValue(envelope({id: I, title: 'X'}))
    const res = (await run(IdeasUpdate, [I, '--project', PID, '--title', 'X', '--problem', 'p', '--json'])) as {
      data: {id: string}
    }
    expect(res.data.id).toBe(I)
  })

  it('case --json returns the envelope', async () => {
    apiMock.post.mockResolvedValue(envelope({id: 'case-1', idea_id: I}))
    const res = (await run(IdeasCase, [I, '--project', PID, '--title', 'X', '--json'])) as {data: unknown}
    expect(res.data).toBeTruthy()
  })

  it('comment-delete --json with --confirm', async () => {
    apiMock.delete.mockResolvedValue(envelope({}))
    const res = (await run(IdeasCommentDelete, [
      I, '--project', PID, '--comment-id', 'c-1', '--confirm', '--json',
    ])) as {deleted: string}
    expect(res.deleted).toBe('c-1')
  })

  // `res.data ?? {}` branch: envelope without `data` (the backend may omit it) → fallback {}.
  it('create/comment/case/convert/update in human mode tolerate an envelope without data', async () => {
    apiMock.post.mockResolvedValue({})
    await expect(runCaptured(IdeasCreate, ['--project', PID, '--title', 'X', '--problem', 'y'])).resolves.toBeTruthy()
    await expect(runCaptured(IdeasComment, [I, '--project', PID, '--body', 'x'])).resolves.toBeTruthy()
    await expect(runCaptured(IdeasCase, [I, '--project', PID, '--title', 'C'])).resolves.toBeTruthy()
    apiMock.put.mockResolvedValue({})
    await expect(runCaptured(IdeasConvert, [I, '--project', PID, '--title', 'T', '--description', 'D'])).resolves.toBeTruthy()
    await expect(runCaptured(IdeasUpdate, [I, '--project', PID, '--title', 'T', '--problem', 'P'])).resolves.toBeTruthy()
  })

  // comments: multi-page branch (follows total_pages) and `res.data ?? []` / `total_pages ?? 1` branch.
  it('comments follows the pagination across several pages', async () => {
    apiMock.get
      .mockResolvedValueOnce({data: [{id: 'c-1', author: 'A', body: 'uno'}], meta: {total_pages: 2}})
      .mockResolvedValueOnce({data: [{id: 'c-2', author: 'B', body: 'due'}], meta: {total_pages: 2}})
    const {stdout: out} = await runCaptured(IdeasComments, [I, '--project', PID])
    expect(apiMock.get).toHaveBeenCalledTimes(2)
    expect(out).toContain('uno')
    expect(out).toContain('due')
  })

  it('comments without meta uses a single page (total_pages 1 fallback)', async () => {
    apiMock.get.mockResolvedValue({data: undefined})
    const {stdout: out} = await runCaptured(IdeasComments, [I, '--project', PID])
    expect(apiMock.get).toHaveBeenCalledTimes(1)
    expect(out).toContain('(nessun commento)')
  })
})

describe('ideas delete', () => {
  it('rejects without --confirm (exit 2, no API call)', async () => {
    const {message} = await runExpectingExit(IdeasDelete, [I, '--project', PID], 2)
    expect(message).toContain('Refusing to delete')
    expect(apiMock.delete).not.toHaveBeenCalled()
  })

  it('with --confirm does DELETE and returns deleted', async () => {
    apiMock.delete.mockResolvedValue(envelope({}))
    const {result, stdout: out} = await runCaptured(IdeasDelete, [I, '--project', PID, '--confirm'])
    expect(apiMock.delete).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/ideas/${I}`)
    expect(out).toContain(`Deleted idea ${I}`)
    expect((result as {deleted: string}).deleted).toBe(I)
  })

  it('--json with --confirm returns deleted without readable output', async () => {
    apiMock.delete.mockResolvedValue(envelope({}))
    const res = (await run(IdeasDelete, [I, '--project', PID, '--confirm', '--json'])) as {deleted: string}
    expect(res.deleted).toBe(I)
  })
})

describe('ideas archive / unarchive', () => {
  it('archive does PUT on the singleton and prints the record', async () => {
    apiMock.put.mockResolvedValue(envelope({id: I, status: 'archived'}))
    const {stdout: out} = await runCaptured(IdeasArchive, [I, '--project', PID])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/ideas/${I}/archive`)
    expect(out).toContain(`Archived idea ${I}`)
  })

  it('unarchive does DELETE on the singleton and prints the record', async () => {
    apiMock.delete.mockResolvedValue(envelope({id: I, status: 'open'}))
    const {stdout: out} = await runCaptured(IdeasUnarchive, [I, '--project', PID])
    expect(apiMock.delete).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/ideas/${I}/archive`)
    expect(out).toContain(`Reopened idea ${I}`)
  })

  it('archive --json returns the envelope (and tolerates an envelope without data)', async () => {
    apiMock.put.mockResolvedValue({})
    const res = (await run(IdeasArchive, [I, '--project', PID, '--json'])) as Record<string, unknown>
    expect(res).toBeTruthy()
  })

  it('unarchive --json returns the envelope', async () => {
    apiMock.delete.mockResolvedValue(envelope({id: I}))
    const res = (await run(IdeasUnarchive, [I, '--project', PID, '--json'])) as {data: {id: string}}
    expect(res.data.id).toBe(I)
  })
})

describe('ideas case-update / case-delete', () => {
  it('case-update does PUT with only the passed fields (title + description)', async () => {
    apiMock.put.mockResolvedValue(envelope({id: 'case-1', idea_id: I, title: 'QR'}))
    await runCaptured(IdeasCaseUpdate, [I, 'case-1', '--project', PID, '--title', 'QR', '--description', 'Scan'])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/ideas/${I}/cases/case-1`, {
      title: 'QR',
      description: 'Scan',
    })
  })

  it('case-update with the title only: description omitted from the body', async () => {
    apiMock.put.mockResolvedValue(envelope({id: 'case-1'}))
    await runCaptured(IdeasCaseUpdate, [I, 'case-1', '--project', PID, '--title', 'Solo titolo'])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/ideas/${I}/cases/case-1`, {title: 'Solo titolo'})
  })

  it('case-update with --description only: title omitted from the body', async () => {
    apiMock.put.mockResolvedValue(envelope({id: 'case-1'}))
    await runCaptured(IdeasCaseUpdate, [I, 'case-1', '--project', PID, '--description', 'Solo descr'])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/ideas/${I}/cases/case-1`, {
      description: 'Solo descr',
    })
  })

  it('case-update --json returns the envelope', async () => {
    apiMock.put.mockResolvedValue(envelope({id: 'case-1'}))
    const res = (await run(IdeasCaseUpdate, [I, 'case-1', '--project', PID, '--title', 'X', '--json'])) as {
      data: {id: string}
    }
    expect(res.data.id).toBe('case-1')
  })

  it('case-delete rejects without --confirm (exit 2)', async () => {
    await runExpectingExit(IdeasCaseDelete, [I, 'case-1', '--project', PID], 2)
    expect(apiMock.delete).not.toHaveBeenCalled()
  })

  it('case-delete with --confirm does DELETE and returns deleted', async () => {
    apiMock.delete.mockResolvedValue(envelope({}))
    const {result} = await runCaptured(IdeasCaseDelete, [I, 'case-1', '--project', PID, '--confirm'])
    expect(apiMock.delete).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/ideas/${I}/cases/case-1`)
    expect((result as {deleted: string}).deleted).toBe('case-1')
  })

  it('case-delete --json with --confirm', async () => {
    apiMock.delete.mockResolvedValue(envelope({}))
    const res = (await run(IdeasCaseDelete, [I, 'case-1', '--project', PID, '--confirm', '--json'])) as {
      deleted: string
    }
    expect(res.deleted).toBe('case-1')
  })

  // `res.data ?? {}` fallback: the backend may omit `data` → human mode must not crash.
  it('archive/unarchive/case-update in human mode tolerate an envelope without data', async () => {
    apiMock.put.mockResolvedValue({})
    await expect(runCaptured(IdeasArchive, [I, '--project', PID])).resolves.toBeTruthy()
    await expect(runCaptured(IdeasCaseUpdate, [I, 'case-1', '--project', PID, '--title', 'X'])).resolves.toBeTruthy()
    apiMock.delete.mockResolvedValue({})
    await expect(runCaptured(IdeasUnarchive, [I, '--project', PID])).resolves.toBeTruthy()
  })
})

describe('ideas convert — limits of the ticket being born (CYCL-32)', () => {
  it("the help states the title and description limits", () => {
    const flags = IdeasConvert.flags as Record<string, {description?: string}>
    expect(flags.title.description).toContain('255')
    expect(flags.description.description).toContain('4000')
  })

  it('lists the too-long fields together without calling the server', async () => {
    const {message} = await runExpectingExit(
      IdeasConvert,
      ['idea-1', '--project', PID, '--title', 'T'.repeat(300), '--description', 'd'.repeat(4200)],
      2,
    )
    expect(message).toContain('--title is 300 characters (max 255)')
    expect(message).toContain('--description is 4200 characters (max 4000)')
    expect(apiMock.put).not.toHaveBeenCalled()
  })
})

// CYCL-61 — links between ideas.
describe('ideas link / unlink', () => {
  it('link without --kind → POST related', async () => {
    apiMock.post.mockResolvedValue(envelope({id: I, title: 'Dark mode', related_ideas: [{id: 'o', title: 'Altra', status: 'open'}]}))
    const {stdout: out} = await runCaptured(IdeasLink, [I, 'o', '--project', PID])
    expect(apiMock.post).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/ideas/${I}/links`, {target_id: 'o', kind: 'related'})
    expect(out).toContain('Linked (related)')
  })

  it('link --kind evolution → POST evolution', async () => {
    apiMock.post.mockResolvedValue(envelope({id: I, title: 'Tavoli'}))
    await runCaptured(IdeasLink, [I, 'base-1', '--project', PID, '--kind', 'evolution'])
    expect(apiMock.post).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/ideas/${I}/links`, {target_id: 'base-1', kind: 'evolution'})
  })

  it('link with an unknown --kind → exits before calling the API', async () => {
    await runExpectingExit(IdeasLink, [I, 'o', '--project', PID, '--kind', 'cugina'], 2)
    expect(apiMock.post).not.toHaveBeenCalled()
  })

  it('unlink → DELETE on the path of the other idea', async () => {
    apiMock.delete.mockResolvedValue(undefined)
    const {stdout: out} = await runCaptured(IdeasUnlink, [I, 'o', '--project', PID])
    expect(apiMock.delete).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/ideas/${I}/links/o`)
    expect(out).toContain('Unlinked')
  })
})
