import {beforeEach, describe, expect, it, vi} from 'vitest'
import {apiMock, resetApiMock} from './helpers/api-mock'
import {GID, PID, apiError, envelope, runCaptured, runExpectingExit} from './helpers/command'
import {readFile} from 'node:fs/promises'

vi.mock('../src/lib/api', async (io) => {
  const actual = await io<typeof import('../src/lib/api')>()
  const {apiMock} = await import('./helpers/api-mock')
  return {...actual, CliApi: vi.fn(function () { return apiMock })}
})
vi.mock('../src/lib/config', async (io) => {
  const actual = await io<typeof import('../src/lib/config')>()
  return {...actual, loadConfig: vi.fn(() => ({apiUrl: 'https://api.test', token: 'tok_test'}))}
})
vi.mock('node:fs/promises', () => ({readFile: vi.fn()}))

import KbAsk from '../src/commands/kb/ask'
import KbConsolidate from '../src/commands/kb/consolidate'
import KbCreate from '../src/commands/kb/create'
import KbDelete from '../src/commands/kb/delete'
import KbList from '../src/commands/kb/list'
import KbRelated from '../src/commands/kb/related'
import KbSearch from '../src/commands/kb/search'
import KbShow from '../src/commands/kb/show'
import KbUpdate from '../src/commands/kb/update'

const ID = 'pg-1'

beforeEach(() => {
  resetApiMock()
  vi.mocked(readFile).mockReset()
})

describe('kb list', () => {
  it('lists the pages without filters', async () => {
    apiMock.get.mockResolvedValue(
      envelope([{title: 'Kamal rollback', kind: 'guide', project: 'ACME', author: 'Ada', updated_at: '2026-07-02'}]),
    )
    const {stdout} = await runCaptured(KbList, [])
    expect(apiMock.get).toHaveBeenCalledWith('/cli/v1/knowledge/pages?page=1')
    expect(stdout).toContain('Kamal rollback')
    expect(stdout).toContain('Ada')
  })

  it('forwards project, kind (repeatable + comma) and per as query', async () => {
    apiMock.get.mockResolvedValue(envelope([]))
    await runCaptured(KbList, ['--project', 'acme-api', '--kind', 'note', '--kind', 'decision,guide', '--per', '50'])
    expect(apiMock.get).toHaveBeenCalledWith(
      '/cli/v1/knowledge/pages?page=1&per=50&project=acme-api&kind%5B%5D=note&kind%5B%5D=decision&kind%5B%5D=guide',
    )
  })

  it('truncates long titles keeping the table on one line', async () => {
    const longTitle = 'x'.repeat(120)
    apiMock.get.mockResolvedValue(envelope([{title: longTitle, kind: 'note'}]))
    const {stdout} = await runCaptured(KbList, [])
    expect(stdout).toContain('…')
    expect(stdout).not.toContain(longTitle)
  })

  it('renders empty cells for a row without fields', async () => {
    apiMock.get.mockResolvedValue(envelope([{}]))
    const {result} = await runCaptured(KbList, [])
    expect((result as {data: unknown[]}).data).toHaveLength(1)
  })

  it('with --json returns the envelope and does not print the table', async () => {
    apiMock.get.mockResolvedValue(envelope([{title: 'X'}], {total: 1}))
    const {result, stdout} = await runCaptured(KbList, ['--json'])
    expect((result as {data: unknown[]}).data).toHaveLength(1)
    expect(stdout).not.toContain('UPDATED')
  })

  it('exits non-zero on an API error', async () => {
    apiMock.get.mockRejectedValue(apiError(500, 'R500-SYS-001', 'boom'))
    const {stderr} = await runExpectingExit(KbList, [])
    expect(stderr).toContain('R500-SYS-001')
  })
})

describe('kb search', () => {
  it('joins the variadic query and sends it as q', async () => {
    apiMock.get.mockResolvedValue(envelope([{title: 'Backoff'}], {search: 'semantic'}))
    const {stdout} = await runCaptured(KbSearch, ['connection', 'pool', 'timeout'])
    expect(apiMock.get).toHaveBeenCalledWith('/cli/v1/knowledge/pages?page=1&q=connection+pool+timeout')
    expect(stdout).toContain('Backoff')
  })

  it('does not show the hint when the search is semantic', async () => {
    apiMock.get.mockResolvedValue(envelope([{title: 'X'}], {search: 'semantic'}))
    const {stdout} = await runCaptured(KbSearch, ['foo'])
    expect(stdout).not.toContain('semantic search unavailable')
  })

  it('shows the hint when the server falls back to the title ILIKE', async () => {
    apiMock.get.mockResolvedValue(envelope([{title: 'X'}], {search: 'like'}))
    const {stdout} = await runCaptured(KbSearch, ['foo', '--project', 'acme-api'])
    expect(stdout).toContain('(semantic search unavailable — showing title matches)')
  })

  it('requires at least one query word (exit 2)', async () => {
    const {message} = await runExpectingExit(KbSearch, [], 2)
    expect(message).toContain('Provide a search query')
    expect(apiMock.get).not.toHaveBeenCalled()
  })

  it('with --json returns the raw envelope', async () => {
    apiMock.get.mockResolvedValue(envelope([{title: 'X'}], {search: 'like'}))
    const {result, stdout} = await runCaptured(KbSearch, ['foo', '--json'])
    expect((result as {data: unknown[]}).data).toHaveLength(1)
    expect(stdout).not.toContain('semantic search unavailable')
  })

  it('exits non-zero on an API error', async () => {
    apiMock.get.mockRejectedValue(apiError(503, 'R503-SYS-002', 'down'))
    const {stderr} = await runExpectingExit(KbSearch, ['foo'])
    expect(stderr).toContain('R503-SYS-002')
  })
})

describe('kb search --status', () => {
  it('with --status all also finds the pending proposal, with its status in a column', async () => {
    apiMock.get.mockResolvedValue(
      envelope(
        [{title: 'Trappola', kind: 'note', status: 'in_review', project: 'ACME', author: 'Ada', updated_at: '2026-09-03'}],
        {search: 'like'},
      ),
    )
    const {stdout} = await runCaptured(KbSearch, ['trappola', '--status', 'all'])
    expect(apiMock.get).toHaveBeenCalledWith('/cli/v1/knowledge/pages?page=1&q=trappola&status=all')
    expect(stdout).toContain('STATUS')
    expect(stdout).toContain('in_review')
  })

  it('searches only the discarded pages when asked to', async () => {
    apiMock.get.mockResolvedValue(envelope([]))
    await runCaptured(KbSearch, ['foo', '--status', 'rejected'])
    expect(apiMock.get).toHaveBeenCalledWith('/cli/v1/knowledge/pages?page=1&q=foo&status=rejected')
  })

  it('without the flag the search stays as before: no status in the query, no column', async () => {
    apiMock.get.mockResolvedValue(
      envelope([{title: 'Kamal', kind: 'guide', status: 'published', project: 'ACME'}], {search: 'semantic'}),
    )
    const {stdout} = await runCaptured(KbSearch, ['kamal'])
    expect(apiMock.get).toHaveBeenCalledWith('/cli/v1/knowledge/pages?page=1&q=kamal')
    expect(stdout).not.toContain('STATUS')
  })

  it('rejects a status that does not exist without calling the server', async () => {
    await runExpectingExit(KbSearch, ['foo', '--status', 'bozza'], 2)
    expect(apiMock.get).not.toHaveBeenCalled()
  })

  it('the status coexists with the other search filters', async () => {
    apiMock.get.mockResolvedValue(envelope([]))
    await runCaptured(KbSearch, [
      'foo', '--project', 'acme-api', '--kind', 'note', '--status', 'in_review', '--with-related',
    ])
    expect(apiMock.get).toHaveBeenCalledWith(
      '/cli/v1/knowledge/pages?page=1&project=acme-api&kind%5B%5D=note&q=foo&related=1&status=in_review',
    )
  })
})

describe('kb show', () => {
  it('prints the header and the raw markdown body', async () => {
    apiMock.get.mockResolvedValue(
      envelope({id: ID, title: 'ADR queue', kind: 'decision', project: 'ACME', author: 'Ada', body: '# Titolo\n\nCorpo markdown'}),
    )
    const {stdout} = await runCaptured(KbShow, [ID])
    expect(apiMock.get).toHaveBeenCalledWith(`/cli/v1/knowledge/pages/${ID}`)
    expect(stdout).toContain('title: ADR queue')
    expect(stdout).toContain('# Titolo\n\nCorpo markdown')
  })

  it('omits the body when it is empty', async () => {
    apiMock.get.mockResolvedValue(envelope({id: ID, title: 'Vuota', kind: 'note', body: null}))
    const {stdout} = await runCaptured(KbShow, [ID])
    expect(stdout).toContain('title: Vuota')
    expect(stdout.endsWith('note')).toBe(true)
  })

  it('prints the technical section after the body, under a dedicated heading', async () => {
    apiMock.get.mockResolvedValue(
      envelope({id: ID, title: 'ADR queue', kind: 'decision', body: 'Corpo semplice', tech_spec: '## Dettagli\n\ntabelle e indici'}),
    )
    const {stdout} = await runCaptured(KbShow, [ID])
    expect(stdout).toContain('🔧 Technical:')
    expect(stdout).toContain('## Dettagli\n\ntabelle e indici')
    expect(stdout.indexOf('Corpo semplice')).toBeLessThan(stdout.indexOf('🔧 Technical:'))
  })

  it('shows the technical section even when the body is empty', async () => {
    apiMock.get.mockResolvedValue(envelope({id: ID, title: 'Solo tecnico', kind: 'note', body: null, tech_spec: 'dettagli tecnici'}))
    const {stdout} = await runCaptured(KbShow, [ID])
    expect(stdout).toContain('🔧 Technical:')
    expect(stdout).toContain('dettagli tecnici')
  })

  it('omits the technical section when it is absent or empty', async () => {
    apiMock.get.mockResolvedValue(envelope({id: ID, title: 'Solo testo', kind: 'note', body: 'Corpo', tech_spec: '   '}))
    const {stdout} = await runCaptured(KbShow, [ID])
    expect(stdout).not.toContain('🔧 Technical:')
  })

  it('with --json returns the envelope', async () => {
    apiMock.get.mockResolvedValue(envelope({id: ID, title: 'X', body: 'b'}))
    const {result, stdout} = await runCaptured(KbShow, [ID, '--json'])
    expect((result as {data: {id: string}}).data.id).toBe(ID)
    expect(stdout).not.toContain(`id: ${ID}`)
  })

  it('exits non-zero on an API error', async () => {
    apiMock.get.mockRejectedValue(apiError(404, 'R404-KNOWLEDGE-002', 'not found'))
    const {stderr} = await runExpectingExit(KbShow, [ID])
    expect(stderr).toContain('R404-KNOWLEDGE-002')
  })
})

describe('kb create', () => {
  it('creates with --body and the default kind note', async () => {
    apiMock.post.mockResolvedValue(envelope({id: ID, title: 'Kamal'}))
    const {stdout} = await runCaptured(KbCreate, ['--project', 'acme-api', '--title', 'Kamal', '--body', 'Steps'])
    expect(apiMock.post).toHaveBeenCalledWith('/cli/v1/knowledge/pages', {
      project: 'acme-api',
      title: 'Kamal',
      kind: 'note',
      body: 'Steps',
    })
    expect(stdout).toContain('Knowledge page created')
  })

  it('reads the body from --body-file with an explicit kind', async () => {
    vi.mocked(readFile).mockResolvedValue('body dal file')
    apiMock.post.mockResolvedValue(envelope({id: ID}))
    await runCaptured(KbCreate, ['--project', PID, '--title', 'ADR', '--kind', 'decision', '--body-file', './adr.md'])
    expect(vi.mocked(readFile)).toHaveBeenCalledWith('./adr.md', 'utf8')
    expect(apiMock.post).toHaveBeenCalledWith('/cli/v1/knowledge/pages', {
      project: PID,
      title: 'ADR',
      kind: 'decision',
      body: 'body dal file',
    })
  })

  it('exits 2 if the body file is not readable', async () => {
    vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'))
    const {message} = await runExpectingExit(KbCreate, ['--project', PID, '--title', 'X', '--body-file', './missing.md'], 2)
    expect(message).toContain('File not found or unreadable')
    expect(apiMock.post).not.toHaveBeenCalled()
  })

  it('exits 2 without --body or --body-file', async () => {
    const {message} = await runExpectingExit(KbCreate, ['--project', PID, '--title', 'X'], 2)
    expect(message).toContain('Provide the page body')
    expect(apiMock.post).not.toHaveBeenCalled()
  })

  it('with --json returns the envelope', async () => {
    apiMock.post.mockResolvedValue(envelope({id: ID}))
    const {result, stdout} = await runCaptured(KbCreate, ['--project', PID, '--title', 'X', '--body', 'b', '--json'])
    expect((result as {data: {id: string}}).data.id).toBe(ID)
    expect(stdout).not.toContain('Knowledge page created')
  })

  it('creates with the inline technical section', async () => {
    apiMock.post.mockResolvedValue(envelope({id: ID}))
    await runCaptured(KbCreate, ['--project', 'acme-api', '--title', 'K', '--body', 'Steps', '--tech-spec', 'dettagli tecnici'])
    expect(apiMock.post).toHaveBeenCalledWith('/cli/v1/knowledge/pages', {
      project: 'acme-api',
      title: 'K',
      kind: 'note',
      body: 'Steps',
      tech_spec: 'dettagli tecnici',
    })
  })

  it('reads the technical section from --tech-spec-file', async () => {
    vi.mocked(readFile).mockResolvedValue('tech dal file')
    apiMock.post.mockResolvedValue(envelope({id: ID}))
    await runCaptured(KbCreate, ['--project', PID, '--title', 'ADR', '--body', 'corpo', '--tech-spec-file', './tech.md'])
    expect(vi.mocked(readFile)).toHaveBeenCalledWith('./tech.md', 'utf8')
    expect(apiMock.post).toHaveBeenCalledWith('/cli/v1/knowledge/pages', {
      project: PID,
      title: 'ADR',
      kind: 'note',
      body: 'corpo',
      tech_spec: 'tech dal file',
    })
  })

  it('exits 2 if the technical section file is not readable', async () => {
    vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'))
    const {message} = await runExpectingExit(KbCreate, ['--project', PID, '--title', 'X', '--body', 'b', '--tech-spec-file', './missing.md'], 2)
    expect(message).toContain('File not found or unreadable')
    expect(apiMock.post).not.toHaveBeenCalled()
  })
})

describe('kb update', () => {
  it('updates only the title re-sending the current kind and body', async () => {
    apiMock.get.mockResolvedValue(envelope({id: ID, title: 'Vecchio', kind: 'note', body: 'corpo corrente'}))
    apiMock.put.mockResolvedValue(envelope({id: ID, title: 'Nuovo'}))
    const {stdout} = await runCaptured(KbUpdate, [ID, '--title', 'Nuovo'])
    expect(apiMock.get).toHaveBeenCalledWith(`/cli/v1/knowledge/pages/${ID}`)
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/knowledge/pages/${ID}`, {
      title: 'Nuovo',
      kind: 'note',
      body: 'corpo corrente',
    })
    expect(stdout).toContain('Knowledge page updated')
  })

  it('updates kind and body (from file) keeping the current title', async () => {
    vi.mocked(readFile).mockResolvedValue('nuovo corpo')
    apiMock.get.mockResolvedValue(envelope({id: ID, title: 'Titolo', kind: 'note', body: 'vecchio'}))
    apiMock.put.mockResolvedValue(envelope({id: ID}))
    await runCaptured(KbUpdate, [ID, '--kind', 'guide', '--body-file', './b.md'])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/knowledge/pages/${ID}`, {
      title: 'Titolo',
      kind: 'guide',
      body: 'nuovo corpo',
    })
  })

  it('exits 2 if no field is passed', async () => {
    const {message} = await runExpectingExit(KbUpdate, [ID], 2)
    expect(message).toContain('Provide at least one of')
    expect(apiMock.get).not.toHaveBeenCalled()
  })

  it('exits 2 if the body file is not readable', async () => {
    vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'))
    const {message} = await runExpectingExit(KbUpdate, [ID, '--body-file', './missing.md'], 2)
    expect(message).toContain('File not found or unreadable')
    expect(apiMock.put).not.toHaveBeenCalled()
  })

  it('with --json returns the envelope', async () => {
    apiMock.get.mockResolvedValue(envelope({id: ID, title: 'T', kind: 'note', body: 'b'}))
    apiMock.put.mockResolvedValue(envelope({id: ID}))
    const {result, stdout} = await runCaptured(KbUpdate, [ID, '--title', 'Nuovo', '--json'])
    expect((result as {data: {id: string}}).data.id).toBe(ID)
    expect(stdout).not.toContain('Knowledge page updated')
  })

  it('exits non-zero on an API error', async () => {
    apiMock.get.mockRejectedValue(apiError(403, 'R403-KNOWLEDGE-001', 'forbidden'))
    const {stderr} = await runExpectingExit(KbUpdate, [ID, '--title', 'X'])
    expect(stderr).toContain('R403-KNOWLEDGE-001')
  })

  it('updates the inline technical section keeping the other fields', async () => {
    apiMock.get.mockResolvedValue(envelope({id: ID, title: 'T', kind: 'guide', body: 'corpo', tech_spec: 'vecchio'}))
    apiMock.put.mockResolvedValue(envelope({id: ID}))
    await runCaptured(KbUpdate, [ID, '--tech-spec', 'nuovo tecnico'])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/knowledge/pages/${ID}`, {
      title: 'T',
      kind: 'guide',
      body: 'corpo',
      tech_spec: 'nuovo tecnico',
    })
  })

  it('preserves the current technical section when only the body is updated', async () => {
    apiMock.get.mockResolvedValue(envelope({id: ID, title: 'T', kind: 'note', body: 'vecchio', tech_spec: 'tech corrente'}))
    apiMock.put.mockResolvedValue(envelope({id: ID}))
    await runCaptured(KbUpdate, [ID, '--body', 'nuovo corpo'])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/knowledge/pages/${ID}`, {
      title: 'T',
      kind: 'note',
      body: 'nuovo corpo',
      tech_spec: 'tech corrente',
    })
  })

  it('reads the technical section from --tech-spec-file', async () => {
    vi.mocked(readFile).mockResolvedValue('tech dal file')
    apiMock.get.mockResolvedValue(envelope({id: ID, title: 'T', kind: 'note', body: 'corpo'}))
    apiMock.put.mockResolvedValue(envelope({id: ID}))
    await runCaptured(KbUpdate, [ID, '--tech-spec-file', './tech.md'])
    expect(vi.mocked(readFile)).toHaveBeenCalledWith('./tech.md', 'utf8')
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/knowledge/pages/${ID}`, {
      title: 'T',
      kind: 'note',
      body: 'corpo',
      tech_spec: 'tech dal file',
    })
  })

  it('exits 2 if the technical section file is not readable', async () => {
    vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'))
    const {message} = await runExpectingExit(KbUpdate, [ID, '--tech-spec-file', './missing.md'], 2)
    expect(message).toContain('File not found or unreadable')
    expect(apiMock.put).not.toHaveBeenCalled()
  })
})

describe('kb delete', () => {
  it('rejects without --confirm', async () => {
    const {message} = await runExpectingExit(KbDelete, [ID], 2)
    expect(message).toContain('Refusing to delete')
    expect(apiMock.delete).not.toHaveBeenCalled()
  })

  it('deletes with --confirm', async () => {
    apiMock.delete.mockResolvedValue(envelope({}))
    const {result, stdout} = await runCaptured(KbDelete, [ID, '--confirm'])
    expect(apiMock.delete).toHaveBeenCalledWith(`/cli/v1/knowledge/pages/${ID}`)
    expect((result as {deleted: string}).deleted).toBe(ID)
    expect(stdout).toContain(`Deleted knowledge page ${ID}`)
  })

  it('with --json deletes without printing', async () => {
    apiMock.delete.mockResolvedValue(envelope({}))
    const {result, stdout} = await runCaptured(KbDelete, [ID, '--confirm', '--json'])
    expect((result as {deleted: string}).deleted).toBe(ID)
    expect(stdout).not.toContain('Deleted knowledge page')
  })
})

describe('kb ask', () => {
  it('asks the variadic question and prints answer + citations', async () => {
    apiMock.post.mockResolvedValue(
      envelope({
        answer: 'Esegui kamal rollback.',
        insufficient: false,
        pages: [{id: 'pg-9', kind: 'guide', title: 'Kamal rollback'}],
      }),
    )
    const {stdout} = await runCaptured(KbAsk, ['how', 'do', 'we', 'roll', 'back'])
    expect(apiMock.post).toHaveBeenCalledWith('/cli/v1/knowledge/ask', {question: 'how do we roll back'})
    expect(stdout).toContain('Esegui kamal rollback.')
    expect(stdout).toContain('Sources:')
    expect(stdout).toContain('[guide] Kamal rollback · pg-9')
  })

  it('shows the dedicated message and no sources when insufficient', async () => {
    apiMock.post.mockResolvedValue(envelope({answer: '', insufficient: true, pages: []}))
    const {stdout} = await runCaptured(KbAsk, ['domanda', 'oscura'])
    expect(stdout).toContain('does not have enough')
    expect(stdout).not.toContain('Sources:')
  })

  it('requires a question (exit 2)', async () => {
    const {message} = await runExpectingExit(KbAsk, [], 2)
    expect(message).toContain('Provide a question')
    expect(apiMock.post).not.toHaveBeenCalled()
  })

  it('with --json returns the raw envelope', async () => {
    apiMock.post.mockResolvedValue(envelope({answer: 'a', insufficient: false, pages: []}))
    const {result, stdout} = await runCaptured(KbAsk, ['una', 'domanda', '--json'])
    expect((result as {data: {answer: string}}).data.answer).toBe('a')
    expect(stdout).not.toContain('Asking the knowledge base')
  })

  it('exits non-zero when the AI is down', async () => {
    apiMock.post.mockRejectedValue(apiError(502, 'R502-KNOWLEDGE-004', 'AI down'))
    const {stderr} = await runExpectingExit(KbAsk, ['domanda'])
    expect(stderr).toContain('R502-KNOWLEDGE-004')
  })
})

// An envelope without `data` (or without `meta`) exercises the defensive fallbacks `?? {}` / `?? []` / `?? ''`.
describe('kb — envelope without data (fallback branches)', () => {
  it('list tolerates an envelope without data', async () => {
    apiMock.get.mockResolvedValue({})
    const {stdout} = await runCaptured(KbList, [])
    expect(stdout).toContain('(no results)')
  })

  it('search tolerates an envelope without data and meta', async () => {
    apiMock.get.mockResolvedValue({})
    const {stdout} = await runCaptured(KbSearch, ['foo'])
    expect(stdout).toContain('(no results)')
  })

  it('show tolerates an envelope without data', async () => {
    apiMock.get.mockResolvedValue({})
    const {result} = await runCaptured(KbShow, [ID])
    expect(result).toEqual({})
  })

  it('create tolerates an envelope without data', async () => {
    apiMock.post.mockResolvedValue({})
    const {stdout} = await runCaptured(KbCreate, ['--project', PID, '--title', 'X', '--body', 'b'])
    expect(stdout).toContain('Knowledge page created')
  })

  it('update tolerates envelopes without data on GET and PUT', async () => {
    apiMock.get.mockResolvedValue({})
    apiMock.put.mockResolvedValue({})
    await runCaptured(KbUpdate, [ID, '--title', 'Nuovo'])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/knowledge/pages/${ID}`, {
      title: 'Nuovo',
      kind: undefined,
      body: undefined,
    })
  })

  it('ask tolerates an envelope without data (no answer, no sources)', async () => {
    apiMock.post.mockResolvedValue({})
    const {stdout} = await runCaptured(KbAsk, ['domanda'])
    expect(stdout).toContain('Asking the knowledge base')
    expect(stdout).not.toContain('Sources:')
  })
})

describe('related pages', () => {
  const RELATED = [
    {id: 'pg-2', kind: 'guide', title: 'Deploy Kamal', project: 'ACME', via: 'link', relevance: 0.88},
    {id: 'pg-3', kind: 'note', title: 'Runbook', project: 'ACME', via: 'semantic', relevance: null},
  ]

  describe('kb related', () => {
    it('lists the related pages with origin and score', async () => {
      apiMock.get.mockResolvedValue(envelope(RELATED))
      const {stdout} = await runCaptured(KbRelated, [ID])
      expect(apiMock.get).toHaveBeenCalledWith(`/cli/v1/knowledge/pages/${ID}/related`)
      expect(stdout).toContain('[guide] Deploy Kamal · pg-2 (link · 0.88)')
      expect(stdout).toContain('[note] Runbook · pg-3 (semantic)')
    })

    it('forwards the question and --links-only as query', async () => {
      apiMock.get.mockResolvedValue(envelope([]))
      await runCaptured(KbRelated, [ID, '--question', 'come annullo un rilascio?', '--links-only'])
      expect(apiMock.get).toHaveBeenCalledWith(
        `/cli/v1/knowledge/pages/${ID}/related?question=come+annullo+un+rilascio%3F&links_only=1`,
      )
    })

    it('says explicitly when there is nothing related', async () => {
      apiMock.get.mockResolvedValue(envelope([]))
      const {stdout} = await runCaptured(KbRelated, [ID])
      expect(stdout).toContain('No related pages.')
    })

    it('with --json returns the envelope instead of the readable block', async () => {
      apiMock.get.mockResolvedValue(envelope(RELATED))
      const {result, stdout} = await runCaptured(KbRelated, [ID, '--json'])
      expect((result as {data: unknown[]}).data).toHaveLength(2)
      expect(stdout).not.toContain('🔗 Related:')
    })
  })

  describe('kb show', () => {
    it('without the flag does not ask for related pages and does not print them', async () => {
      apiMock.get.mockResolvedValue(envelope({id: ID, title: 'ADR', kind: 'decision', body: 'b'}))
      const {stdout} = await runCaptured(KbShow, [ID])
      expect(apiMock.get).toHaveBeenCalledWith(`/cli/v1/knowledge/pages/${ID}`)
      expect(stdout).not.toContain('Related:')
    })

    it('with --related asks for and prints the block', async () => {
      apiMock.get.mockResolvedValue(envelope({id: ID, title: 'ADR', body: 'b'}, {related: RELATED}))
      const {stdout} = await runCaptured(KbShow, [ID, '--related'])
      expect(apiMock.get).toHaveBeenCalledWith(`/cli/v1/knowledge/pages/${ID}?related=1`)
      expect(stdout).toContain('🔗 Related:')
      expect(stdout).toContain('Deploy Kamal')
    })

    it('--question implies related pages and travels as query', async () => {
      apiMock.get.mockResolvedValue(envelope({id: ID, title: 'ADR', body: 'b'}, {related: []}))
      await runCaptured(KbShow, [ID, '--question', 'che DB?'])
      expect(apiMock.get).toHaveBeenCalledWith(`/cli/v1/knowledge/pages/${ID}?question=che+DB%3F`)
    })
  })

  describe('kb ask', () => {
    it('prints the second hop after the sources', async () => {
      apiMock.post.mockResolvedValue(
        envelope({answer: 'PostgreSQL', insufficient: false, pages: [{id: 'pg-1', kind: 'guide', title: 'Scelta DB'}], related: RELATED}),
      )
      const {stdout} = await runCaptured(KbAsk, ['che', 'DB'])
      expect(stdout.indexOf('📚 Sources:')).toBeLessThan(stdout.indexOf('🔗 Related:'))
      expect(stdout).toContain('Deploy Kamal')
    })

    it('without related pages does not print the block', async () => {
      apiMock.post.mockResolvedValue(envelope({answer: 'a', insufficient: false, pages: [], related: []}))
      const {stdout} = await runCaptured(KbAsk, ['domanda'])
      expect(stdout).not.toContain('Related:')
    })
  })

  describe('kb search', () => {
    it('with --with-related asks for the computation and prints one block per result', async () => {
      apiMock.get.mockResolvedValue(
        envelope([{id: 'pg-1', title: 'Rollback', kind: 'guide'}], {related: {'pg-1': RELATED}}),
      )
      const {stdout} = await runCaptured(KbSearch, ['rollback', '--with-related'])
      expect(apiMock.get).toHaveBeenCalledWith('/cli/v1/knowledge/pages?page=1&q=rollback&related=1')
      expect(stdout).toContain('🔗 Related:')
      expect(stdout).toContain('Rollback')
      expect(stdout).toContain('Deploy Kamal')
    })

    it('without the flag the query stays as before', async () => {
      apiMock.get.mockResolvedValue(envelope([]))
      await runCaptured(KbSearch, ['rollback'])
      expect(apiMock.get).toHaveBeenCalledWith('/cli/v1/knowledge/pages?page=1&q=rollback')
    })
  })
})

describe('proposal review (CYCL-17)', () => {
  describe('kb create --in-review', () => {
    it('proposes the page instead of publishing it, with its rationale', async () => {
      apiMock.post.mockResolvedValue(envelope({id: ID, title: 'Trappola', status: 'in_review'}))
      const {stdout} = await runCaptured(KbCreate, [
        '--project', 'acme-api', '--title', 'Trappola', '--body', 'Corpo',
        '--in-review', '--review-note', 'Trappola incontrata oggi',
      ])
      expect(apiMock.post).toHaveBeenCalledWith('/cli/v1/knowledge/pages', {
        project: 'acme-api',
        title: 'Trappola',
        kind: 'note',
        body: 'Corpo',
        in_review: true,
        review_note: 'Trappola incontrata oggi',
      })
      expect(stdout).toContain('waiting for review')
    })

    it('without the flag does not send in_review: the page is born published as before', async () => {
      apiMock.post.mockResolvedValue(envelope({id: ID}))
      const {stdout} = await runCaptured(KbCreate, ['--project', 'acme-api', '--title', 'X', '--body', 'Corpo'])
      const payload = apiMock.post.mock.calls[0][1] as Record<string, unknown>
      expect(payload.in_review).toBeUndefined()
      expect(stdout).toContain('Knowledge page created')
    })

    it('exits 2 if the rationale arrives without --in-review', async () => {
      const {message} = await runExpectingExit(
        KbCreate,
        ['--project', PID, '--title', 'X', '--body', 'Corpo', '--review-note', 'perché sì'],
        2,
      )
      expect(message).toContain('--review-note only applies')
      expect(apiMock.post).not.toHaveBeenCalled()
    })
  })

  describe('kb list --status / --awaiting-consolidation', () => {
    it('requests the review queue and shows the status column', async () => {
      apiMock.get.mockResolvedValue(
        envelope([{title: 'Trappola', kind: 'note', status: 'in_review', project: 'ACME', author: 'Ada', updated_at: '2026-08-09'}]),
      )
      const {stdout} = await runCaptured(KbList, ['--status', 'in_review'])
      expect(apiMock.get).toHaveBeenCalledWith('/cli/v1/knowledge/pages?page=1&status=in_review')
      expect(stdout).toContain('STATUS')
      expect(stdout).toContain('in_review')
    })

    it('a list of published pages only stays without the status column', async () => {
      apiMock.get.mockResolvedValue(
        envelope([{title: 'Kamal', kind: 'guide', status: 'published', project: 'ACME', author: 'Ada', updated_at: '2026-08-09'}]),
      )
      const {stdout} = await runCaptured(KbList, [])
      expect(stdout).not.toContain('STATUS')
      expect(stdout).toContain('Kamal')
    })

    it('lists the accepted pages still to archive', async () => {
      apiMock.get.mockResolvedValue(envelope([]))
      await runCaptured(KbList, ['--awaiting-consolidation'])
      expect(apiMock.get).toHaveBeenCalledWith('/cli/v1/knowledge/pages?page=1&awaiting_consolidation=1')
    })

    it('rejects a status that does not exist', async () => {
      await runExpectingExit(KbList, ['--status', 'bozza'], 2)
      expect(apiMock.get).not.toHaveBeenCalled()
    })
  })

  describe('kb consolidate', () => {
    it('records the document path', async () => {
      apiMock.post.mockResolvedValue(envelope({id: ID, source_path: 'troubleshooting/rails.md'}))
      const {stdout} = await runCaptured(KbConsolidate, [ID, '--path', 'troubleshooting/rails.md'])
      expect(apiMock.post).toHaveBeenCalledWith(`/cli/v1/knowledge/pages/${ID}/consolidated`, {
        source_path: 'troubleshooting/rails.md',
      })
      expect(stdout).toContain('Knowledge page filed')
      expect(stdout).toContain('troubleshooting/rails.md')
    })

    it('with --json returns the envelope', async () => {
      apiMock.post.mockResolvedValue(envelope({id: ID}))
      const res = await runCaptured(KbConsolidate, [ID, '--path', 'global/git.md', '--json'])
      expect(res.result).toEqual(envelope({id: ID}))
      expect(res.stdout).not.toContain('Knowledge page filed')
    })

    it('without --path no call is made', async () => {
      await runExpectingExit(KbConsolidate, [ID], 2)
      expect(apiMock.post).not.toHaveBeenCalled()
    })

    it('propagates the server error when the page is not accepted yet', async () => {
      apiMock.post.mockRejectedValue(apiError(422, 'R422-KNOWLEDGE-009', 'Questa pagina non è ancora stata accettata.'))
      const {message} = await runExpectingExit(KbConsolidate, [ID, '--path', 'global/git.md'], 1)
      expect(message).toContain('R422-KNOWLEDGE-009')
    })
  })
})

describe('length limits declared and checked before saving (CYCL-32)', () => {
  describe("the command help", () => {
    it('states the limit of every kb create field', () => {
      const flags = KbCreate.flags as Record<string, {description?: string}>
      expect(flags.title.description).toContain('255')
      expect(flags.body.description).toContain('4000')
      expect(flags['body-file'].description).toContain('4000')
      expect(flags['tech-spec'].description).toContain('1500')
      expect(flags['tech-spec-file'].description).toContain('1500')
      expect(flags['review-note'].description).toContain('240')
    })

    it('states the limit of every kb update field', () => {
      const flags = KbUpdate.flags as Record<string, {description?: string}>
      expect(flags.title.description).toContain('255')
      expect(flags.body.description).toContain('4000')
      expect(flags['body-file'].description).toContain('4000')
      expect(flags['tech-spec'].description).toContain('1500')
      expect(flags['tech-spec-file'].description).toContain('1500')
    })
  })

  describe('kb create', () => {
    it('lists all the too-long fields in a single error, without calling the server', async () => {
      const {message} = await runExpectingExit(
        KbCreate,
        ['--project', PID, '--title', 'X', '--body', 'x'.repeat(4200), '--tech-spec', 'y'.repeat(1700)],
        2,
      )
      expect(message).toContain('--body is 4200 characters (max 4000)')
      expect(message).toContain('--tech-spec is 1700 characters (max 1500)')
      expect(apiMock.post).not.toHaveBeenCalled()
    })

    it('counts the body read from file and names the file flag', async () => {
      vi.mocked(readFile).mockResolvedValue('x'.repeat(4100))
      const {message} = await runExpectingExit(
        KbCreate,
        ['--project', PID, '--title', 'X', '--body-file', './lungo.md'],
        2,
      )
      expect(message).toContain('--body-file is 4100 characters (max 4000)')
      expect(apiMock.post).not.toHaveBeenCalled()
    })

    it('also counts title and review note', async () => {
      const {message} = await runExpectingExit(
        KbCreate,
        ['--project', PID, '--title', 'T'.repeat(300), '--body', 'corpo', '--in-review', '--review-note', 'n'.repeat(250)],
        2,
      )
      expect(message).toContain('--title is 300 characters (max 255)')
      expect(message).toContain('--review-note is 250 characters (max 240)')
      expect(apiMock.post).not.toHaveBeenCalled()
    })

    it('lets through a body exactly at the limit', async () => {
      apiMock.post.mockResolvedValue(envelope({id: ID}))
      await runCaptured(KbCreate, ['--project', PID, '--title', 'X', '--body', 'x'.repeat(4000)])
      expect(apiMock.post).toHaveBeenCalled()
    })
  })

  describe('kb update', () => {
    it('stops the body that grows beyond the limit before writing', async () => {
      apiMock.get.mockResolvedValue(envelope({id: ID, title: 'T', kind: 'note', body: 'corto'}))
      const {message} = await runExpectingExit(KbUpdate, [ID, '--body', 'x'.repeat(4001)], 2)
      expect(message).toContain('--body is 4001 characters (max 4000)')
      expect(apiMock.put).not.toHaveBeenCalled()
    })

    it('does not block a page already over the limit that is being shortened', async () => {
      apiMock.get.mockResolvedValue(envelope({id: ID, title: 'T', kind: 'note', body: 'x'.repeat(4500)}))
      apiMock.put.mockResolvedValue(envelope({id: ID}))
      await runCaptured(KbUpdate, [ID, '--body', 'x'.repeat(4300)])
      expect(apiMock.put).toHaveBeenCalled()
    })

    it('does not block the title change of a page whose body is already over the limit', async () => {
      apiMock.get.mockResolvedValue(envelope({id: ID, title: 'T', kind: 'note', body: 'x'.repeat(4500)}))
      apiMock.put.mockResolvedValue(envelope({id: ID}))
      await runCaptured(KbUpdate, [ID, '--title', 'Nuovo'])
      expect(apiMock.put).toHaveBeenCalled()
    })
  })
})

describe('scopes, tags and author origin (CYCL-45)', () => {
  const PID2 = '66666666-6666-4666-8666-666666666666'
  const GID2 = '77777777-7777-4777-8777-777777777777'

  describe('kb create', () => {
    it('links several projects, several groups and the tags to the new page', async () => {
      apiMock.post.mockResolvedValue(envelope({id: ID}))
      await runCaptured(KbCreate, [
        '--project', PID, '--project', PID2,
        '--group', GID, '--group', GID2,
        '--tag', 'deploy', '--tag', 'kamal',
        '--title', 'Procedura', '--body', 'Passi',
      ])
      expect(apiMock.post).toHaveBeenCalledWith('/cli/v1/knowledge/pages', {
        project: PID,
        project_ids: [PID2],
        group_ids: [GID, GID2],
        tags: ['deploy', 'kamal'],
        title: 'Procedura',
        kind: 'note',
        body: 'Passi',
      })
    })

    it('with a single project lists no scopes and does not look up its key', async () => {
      apiMock.post.mockResolvedValue(envelope({id: ID}))
      await runCaptured(KbCreate, ['--project', 'acme-api', '--title', 'X', '--body', 'b'])
      const payload = apiMock.post.mock.calls[0][1] as Record<string, unknown>
      expect(payload.project).toBe('acme-api')
      expect(payload).not.toHaveProperty('project_ids')
      expect(apiMock.get).not.toHaveBeenCalled()
    })

    it('resolves the projects beyond the first by key', async () => {
      apiMock.get.mockResolvedValue(envelope([{id: PID2, key: 'BETA'}], {total_pages: 1}))
      apiMock.post.mockResolvedValue(envelope({id: ID}))
      await runCaptured(KbCreate, ['--project', 'acme-api', '--project', 'beta', '--title', 'X', '--body', 'b'])
      expect(apiMock.get).toHaveBeenCalledWith('/cli/v1/projects?page=1&per=100')
      const payload = apiMock.post.mock.calls[0][1] as Record<string, unknown>
      expect(payload.project).toBe('acme-api')
      expect(payload.project_ids).toEqual([PID2])
    })

    it('resolves the groups by name', async () => {
      apiMock.get.mockResolvedValue(envelope([{id: GID, name: 'Piattaforma'}], {total_pages: 1}))
      apiMock.post.mockResolvedValue(envelope({id: ID}))
      await runCaptured(KbCreate, ['--project', PID, '--group', 'Piattaforma', '--title', 'X', '--body', 'b'])
      expect(apiMock.get).toHaveBeenCalledWith('/cli/v1/groups?page=1&per=100')
      expect((apiMock.post.mock.calls[0][1] as Record<string, unknown>).group_ids).toEqual([GID])
    })

    it('exits non-zero when a group does not exist, without creating the page', async () => {
      apiMock.get.mockResolvedValue(envelope([{id: GID, name: 'Piattaforma'}], {total_pages: 1}))
      const {stderr} = await runExpectingExit(KbCreate, ['--project', PID, '--group', 'Fantasma', '--title', 'X', '--body', 'b'])
      expect(stderr).toContain('Group not found: Fantasma')
      expect(apiMock.post).not.toHaveBeenCalled()
    })

    it('declares who wrote the text', async () => {
      apiMock.post.mockResolvedValue(envelope({id: ID}))
      await runCaptured(KbCreate, ['--project', PID, '--title', 'X', '--body', 'b', '--author-origin', 'closeyourit-autopilot'])
      expect((apiMock.post.mock.calls[0][1] as Record<string, unknown>).author_origin).toBe('closeyourit-autopilot')
    })

    it('creates a group-only page, without any project', async () => {
      apiMock.post.mockResolvedValue(envelope({id: ID}))
      await runCaptured(KbCreate, ['--group', GID, '--title', 'X', '--body', 'b'])
      const payload = apiMock.post.mock.calls[0][1] as Record<string, unknown>
      expect(payload.group_ids).toEqual([GID])
      expect(payload).not.toHaveProperty('project')
      expect(payload).not.toHaveProperty('project_ids')
    })

    it('exits 2 without project or group, before any call', async () => {
      const {message} = await runExpectingExit(KbCreate, ['--title', 'X', '--body', 'b'], 2)
      expect(message).toContain('--project')
      expect(message).toContain('--group')
      expect(apiMock.post).not.toHaveBeenCalled()
      expect(apiMock.get).not.toHaveBeenCalled()
    })

    it('shows scopes and tags of the page just created', async () => {
      apiMock.post.mockResolvedValue(
        envelope({
          id: ID,
          title: 'Procedura',
          projects: [{key: 'ACME', name: 'Acme'}, {key: 'BETA', name: 'Beta'}],
          groups: ['Piattaforma'],
          tags: ['deploy'],
        }),
      )
      const {stdout} = await runCaptured(KbCreate, ['--project', PID, '--title', 'Procedura', '--body', 'b'])
      expect(stdout).toContain('projects: ACME, BETA')
      expect(stdout).toContain('groups: Piattaforma')
      expect(stdout).toContain('tags: deploy')
    })
  })

  describe('kb update', () => {
    it('sends no scopes or tags when they are not passed', async () => {
      apiMock.get.mockResolvedValue(envelope({id: ID, title: 'T', kind: 'note', body: 'corpo'}))
      apiMock.put.mockResolvedValue(envelope({id: ID}))
      await runCaptured(KbUpdate, [ID, '--body', 'nuovo corpo'])
      const payload = apiMock.put.mock.calls[0][1] as Record<string, unknown>
      expect(payload).not.toHaveProperty('project_ids')
      expect(payload).not.toHaveProperty('group_ids')
      expect(payload).not.toHaveProperty('tags')
      expect(payload).not.toHaveProperty('author_origin')
    })

    it('replaces projects, groups and tags without touching the text or re-reading it', async () => {
      apiMock.put.mockResolvedValue(envelope({id: ID}))
      await runCaptured(KbUpdate, [
        ID, '--project', PID, '--project', PID2, '--group', GID, '--tag', 'deploy', '--tag', 'kamal',
      ])
      // No re-read: without text fields to merge there is nothing to read, and sending back
      // the text just read would overwrite the edit of whoever wrote in the meantime.
      expect(apiMock.get).not.toHaveBeenCalled()
      expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/knowledge/pages/${ID}`, {
        project_ids: [PID, PID2],
        group_ids: [GID],
        tags: ['deploy', 'kamal'],
      })
    })

    it('merges the current text only when the text changes too', async () => {
      apiMock.get.mockResolvedValue(envelope({id: ID, title: 'T', kind: 'note', body: 'corpo'}))
      apiMock.put.mockResolvedValue(envelope({id: ID}))
      await runCaptured(KbUpdate, [ID, '--title', 'Nuovo', '--tag', 'deploy'])
      expect(apiMock.get).toHaveBeenCalledWith(`/cli/v1/knowledge/pages/${ID}`)
      expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/knowledge/pages/${ID}`, {
        title: 'Nuovo',
        kind: 'note',
        body: 'corpo',
        tech_spec: undefined,
        tags: ['deploy'],
      })
    })

    it('accepts tags alone as an update', async () => {
      apiMock.put.mockResolvedValue(envelope({id: ID}))
      await runCaptured(KbUpdate, [ID, '--tag', 'deploy'])
      expect((apiMock.put.mock.calls[0][1] as Record<string, unknown>).tags).toEqual(['deploy'])
    })

    it('clears the tags with --tag ""', async () => {
      apiMock.put.mockResolvedValue(envelope({id: ID}))
      await runCaptured(KbUpdate, [ID, '--tag', ''])
      expect((apiMock.put.mock.calls[0][1] as Record<string, unknown>).tags).toEqual([])
    })

    it('declares who rewrote the text', async () => {
      apiMock.get.mockResolvedValue(envelope({id: ID, title: 'T', kind: 'note', body: 'corpo'}))
      apiMock.put.mockResolvedValue(envelope({id: ID}))
      await runCaptured(KbUpdate, [ID, '--body', 'riscritto', '--author-origin', 'skill-kb-inbox'])
      expect((apiMock.put.mock.calls[0][1] as Record<string, unknown>).author_origin).toBe('skill-kb-inbox')
    })

    it('names the new flags when no field is passed', async () => {
      const {message} = await runExpectingExit(KbUpdate, [ID], 2)
      expect(message).toContain('--project')
      expect(message).toContain('--group')
      expect(message).toContain('--tag')
      expect(apiMock.get).not.toHaveBeenCalled()
    })
  })

  describe('kb show', () => {
    it('shows all the projects, groups and tags', async () => {
      apiMock.get.mockResolvedValue(
        envelope({
          id: ID,
          title: 'Procedura',
          kind: 'guide',
          project: 'ACME',
          projects: [{key: 'ACME', name: 'Acme'}, {key: 'BETA', name: 'Beta'}],
          groups: ['Piattaforma'],
          tags: ['deploy', 'kamal'],
          body: 'Passi',
        }),
      )
      const {stdout} = await runCaptured(KbShow, [ID])
      expect(stdout).toContain('projects: ACME, BETA')
      expect(stdout).toContain('groups: Piattaforma')
      expect(stdout).toContain('tags: deploy, kamal')
    })

    it("does not repeat the list when the page has a single project and no tags", async () => {
      apiMock.get.mockResolvedValue(
        envelope({id: ID, title: 'X', project: 'ACME', projects: [{key: 'ACME', name: 'Acme'}], groups: [], tags: [], body: 'b'}),
      )
      const {stdout} = await runCaptured(KbShow, [ID])
      expect(stdout).toContain('project: ACME')
      expect(stdout).not.toContain('projects:')
      expect(stdout).not.toContain('groups:')
      expect(stdout).not.toContain('tags:')
    })
  })
})
