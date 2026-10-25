// CYCL-56 — the six tools the MCP server exposes over knowledge.
//
// Each one is the same call the matching command makes: no new logic here, so the
// limits of whoever is connected stay those of their token (scenario 3). The only tool that
// writes, `kb_propose`, must ALWAYS go into review: it is the guarantee of scenario 2 and it cannot
// depend on what its caller asks.

import {beforeEach, describe, expect, it, vi} from 'vitest'
import {apiMock, resetApiMock} from './helpers/api-mock'
import {PID, apiError, envelope} from './helpers/command'

vi.mock('../src/lib/git', () => ({parseRepoSlug: vi.fn(), repoSlug: vi.fn()}))

import type {CliApi} from '../src/lib/api'
import {McpToolInputError, findTool, toolDefinitions} from '../src/lib/mcp/tools'
import type {McpToolContext} from '../src/lib/mcp/tools'
import {repoSlug} from '../src/lib/git'

function context(extra: Partial<McpToolContext> = {}): McpToolContext {
  return {api: apiMock as unknown as CliApi, cwd: '/tmp/repo', timeoutMs: 5000, ...extra}
}

function call(name: string, args: Record<string, unknown>, ctx: McpToolContext = context()): Promise<unknown> {
  const tool = findTool(name)
  if (!tool) throw new Error(`strumento inesistente: ${name}`)
  return tool.run(args, ctx)
}

beforeEach(() => {
  resetApiMock()
  vi.mocked(repoSlug).mockReset()
  vi.mocked(repoSlug).mockResolvedValue(undefined)
})

describe('the tool catalogue', () => {
  it('exposes the six knowledge tools, each with its input schema', () => {
    const names = toolDefinitions().map((tool) => tool.name)
    expect(names).toEqual(['kb_search', 'kb_ask', 'kb_show', 'kb_related', 'kb_context', 'kb_propose'])
    for (const tool of toolDefinitions()) {
      expect(tool.description.length).toBeGreaterThan(0)
      expect(tool.inputSchema).toMatchObject({type: 'object'})
    }
  })

  it('declares everything read-only except proposing a page', () => {
    const readOnly = Object.fromEntries(toolDefinitions().map((t) => [t.name, t.annotations?.readOnlyHint]))
    expect(readOnly).toEqual({
      kb_search: true,
      kb_ask: true,
      kb_show: true,
      kb_related: true,
      kb_context: true,
      kb_propose: false,
    })
  })

  it('exposes no tool that publishes, accepts or deletes a page', () => {
    const names = toolDefinitions().map((tool) => tool.name)
    for (const forbidden of ['kb_publish', 'kb_approve', 'kb_reject', 'kb_delete', 'kb_update', 'kb_create']) {
      expect(names).not.toContain(forbidden)
    }
  })
})

describe('kb_search', () => {
  it('searches with the filters and returns the server envelope', async () => {
    apiMock.get.mockResolvedValue(envelope([{id: 'pg-1'}], {search: 'semantic'}))
    const out = await call('kb_search', {query: 'kamal rollback', project: 'ACME', kind: 'decision,guide', per: 3})
    expect(apiMock.get).toHaveBeenCalledWith(
      '/cli/v1/knowledge/pages?page=1&per=3&project=ACME&kind%5B%5D=decision&kind%5B%5D=guide&q=kamal+rollback',
    )
    expect(out).toEqual({data: [{id: 'pg-1'}], meta: {search: 'semantic'}})
  })

  it('accepts the kinds as a list too and asks for related pages when told to', async () => {
    apiMock.get.mockResolvedValue(envelope([]))
    await call('kb_search', {query: 'deploy', kind: ['note', 'guide'], with_related: true, page: 2})
    expect(apiMock.get).toHaveBeenCalledWith(
      '/cli/v1/knowledge/pages?page=2&kind%5B%5D=note&kind%5B%5D=guide&q=deploy&related=1',
    )
  })

  it('rejects a search without a query instead of calling the server', async () => {
    await expect(call('kb_search', {query: '   '})).rejects.toBeInstanceOf(McpToolInputError)
    expect(apiMock.get).not.toHaveBeenCalled()
  })

  it('rejects a page below the first', async () => {
    await expect(call('kb_search', {query: 'x', page: 0})).rejects.toBeInstanceOf(McpToolInputError)
    expect(apiMock.get).not.toHaveBeenCalled()
  })
})

describe('arguments that arrive malformed', () => {
  it('rejects a text that is not text, instead of sending it to the server as any string', async () => {
    await expect(call('kb_search', {query: {a: 1}})).rejects.toBeInstanceOf(McpToolInputError)
    await expect(call('kb_show', {id: 'pg-1', question: 42})).rejects.toBeInstanceOf(McpToolInputError)
    expect(apiMock.get).not.toHaveBeenCalled()
  })

  it('rejects a number that is not a number', async () => {
    await expect(call('kb_search', {query: 'x', per: 'tante'})).rejects.toBeInstanceOf(McpToolInputError)
    await expect(call('kb_search', {query: 'x', page: 1.5})).rejects.toBeInstanceOf(McpToolInputError)
    expect(apiMock.get).not.toHaveBeenCalled()
  })

  it('accepts a number written as text, which is how several clients send it', async () => {
    apiMock.get.mockResolvedValue(envelope([]))
    await call('kb_search', {query: 'x', per: '2'})
    expect(apiMock.get).toHaveBeenCalledWith('/cli/v1/knowledge/pages?page=1&per=2&q=x')
  })

  it('reads a switch only when it really is yes', async () => {
    apiMock.get.mockResolvedValue(envelope({}))
    await call('kb_show', {id: 'pg-1', related: 'false'})
    expect(apiMock.get).toHaveBeenCalledWith('/cli/v1/knowledge/pages/pg-1')
  })
})

describe('kb_ask', () => {
  it('forwards the question to the service and reports answer and sources', async () => {
    apiMock.post.mockResolvedValue(envelope({answer: 'Si torna indietro con kamal rollback', pages: []}))
    const out = await call('kb_ask', {question: 'come si torna indietro?'})
    expect(apiMock.post).toHaveBeenCalledWith('/cli/v1/knowledge/ask', {question: 'come si torna indietro?'})
    expect(out).toEqual({data: {answer: 'Si torna indietro con kamal rollback', pages: []}})
  })

  it('rejects an empty question', async () => {
    await expect(call('kb_ask', {})).rejects.toBeInstanceOf(McpToolInputError)
    expect(apiMock.post).not.toHaveBeenCalled()
  })
})

describe('kb_show', () => {
  it('reads a whole page', async () => {
    apiMock.get.mockResolvedValue(envelope({id: 'pg-1', body: '# Titolo'}))
    await call('kb_show', {id: 'pg-1'})
    expect(apiMock.get).toHaveBeenCalledWith('/cli/v1/knowledge/pages/pg-1')
  })

  it('also asks for the pages to read next, filtered on the question', async () => {
    apiMock.get.mockResolvedValue(envelope({id: 'pg-1'}, {related: []}))
    await call('kb_show', {id: 'pg-1', question: 'come si torna indietro?'})
    expect(apiMock.get).toHaveBeenCalledWith('/cli/v1/knowledge/pages/pg-1?question=come+si+torna+indietro%3F')
  })

  it('with related and without a question asks for the full list of links', async () => {
    apiMock.get.mockResolvedValue(envelope({id: 'pg-1'}))
    await call('kb_show', {id: 'pg-1', related: true})
    expect(apiMock.get).toHaveBeenCalledWith('/cli/v1/knowledge/pages/pg-1?related=1')
  })

  it('rejects a read without a page', async () => {
    await expect(call('kb_show', {})).rejects.toBeInstanceOf(McpToolInputError)
  })
})

describe('kb_related', () => {
  it('lists the nearby pages, with only the written links when requested', async () => {
    apiMock.get.mockResolvedValue(envelope([]))
    await call('kb_related', {id: 'pg-1', links_only: true, question: 'deploy'})
    expect(apiMock.get).toHaveBeenCalledWith('/cli/v1/knowledge/pages/pg-1/related?question=deploy&links_only=1')
  })

  it('without filters calls the bare route', async () => {
    apiMock.get.mockResolvedValue(envelope([]))
    await call('kb_related', {id: 'pg 1'})
    expect(apiMock.get).toHaveBeenCalledWith('/cli/v1/knowledge/pages/pg%201/related')
  })
})

describe('kb_context', () => {
  const PAGES = [{id: 'pg-1', title: 'Rollback', kind: 'guide'}, {id: 'pg-2', title: 'Due database', kind: 'decision'}]

  it('prints the context of the given project', async () => {
    apiMock.get.mockResolvedValue(envelope({project: {key: 'ACME'}, pages: PAGES}))
    const out = await call('kb_context', {project: 'ACME', limit: 5})
    expect(apiMock.get).toHaveBeenCalledWith('/cli/v1/knowledge/context?project=ACME&per=5', {})
    expect(out).toEqual({data: {project: {key: 'ACME'}, pages: PAGES}})
  })

  it('without a project recognises it from the git remote of the working folder', async () => {
    vi.mocked(repoSlug).mockResolvedValue('bussolabs/acme-api')
    apiMock.get
      .mockResolvedValueOnce(envelope([{project_key: 'ACME', repository: {full_name: 'BussoLabs/Acme-Api'}}]))
      .mockResolvedValueOnce(envelope({pages: PAGES}))
    await call('kb_context', {})
    expect(vi.mocked(repoSlug)).toHaveBeenCalledWith('/tmp/repo', 5000)
    expect(apiMock.get).toHaveBeenNthCalledWith(2, '/cli/v1/knowledge/context?project=ACME&per=10', {})
  })

  it('outside a project answers that there is no context, not a failure', async () => {
    const out = await call('kb_context', {})
    expect(out).toEqual({data: {project: null, pages: []}})
  })

  it('falls back to the page list when the server does not expose the context yet', async () => {
    apiMock.get
      .mockRejectedValueOnce(apiError(404, 'C404-API-000', 'Request failed (404)'))
      .mockResolvedValueOnce(envelope(PAGES))
    const out = await call('kb_context', {project: 'ACME'})
    expect(apiMock.get).toHaveBeenNthCalledWith(2, '/cli/v1/knowledge/pages?page=1&per=10&project=ACME', {})
    expect(out).toEqual({data: PAGES})
  })

  it('returns no more pages than the requested cap, whatever the server sends', async () => {
    apiMock.get.mockResolvedValue(envelope({pages: PAGES}))
    const out = await call('kb_context', {project: 'ACME', limit: 1})
    expect(out).toEqual({data: {pages: [PAGES[0]]}})
  })

  it('rejects a cap below one page', async () => {
    await expect(call('kb_context', {project: 'ACME', limit: 0})).rejects.toBeInstanceOf(McpToolInputError)
  })
})

describe('kb_propose — scenario 2: the proposal never publishes', () => {
  it('creates the page awaiting review', async () => {
    apiMock.post.mockResolvedValue(envelope({id: 'pg-9', status: 'in_review'}))
    const out = await call('kb_propose', {project: 'ACME', title: 'Trappola dei worktree', body: 'Testo'})
    expect(apiMock.post).toHaveBeenCalledWith('/cli/v1/knowledge/pages', {
      project: 'ACME',
      title: 'Trappola dei worktree',
      kind: 'note',
      body: 'Testo',
      tech_spec: undefined,
      in_review: true,
      review_note: undefined,
      author_origin: 'mcp',
    })
    expect(out).toEqual({data: {id: 'pg-9', status: 'in_review'}})
  })

  it('stays in review even if the caller asks to publish', async () => {
    apiMock.post.mockResolvedValue(envelope({id: 'pg-9'}))
    await call('kb_propose', {
      project: 'ACME',
      title: 'T',
      body: 'B',
      in_review: false,
      status: 'published',
      published: true,
    })
    const [, body] = apiMock.post.mock.calls[0] as [string, Record<string, unknown>]
    expect(body.in_review).toBe(true)
    expect(body).not.toHaveProperty('status')
    expect(body).not.toHaveProperty('published')
  })

  it('attributes the text to the connected assistant when it does not declare it', async () => {
    apiMock.post.mockResolvedValue(envelope({id: 'pg-9'}))
    await call('kb_propose', {project: 'ACME', title: 'T', body: 'B'}, context({clientName: 'Cursor'}))
    const [, body] = apiMock.post.mock.calls[0] as [string, Record<string, unknown>]
    expect(body.author_origin).toBe('Cursor')
  })

  it('lets the author of the text be declared explicitly', async () => {
    apiMock.post.mockResolvedValue(envelope({id: 'pg-9'}))
    await call('kb_propose', {project: 'ACME', title: 'T', body: 'B', author_origin: 'skill kb-inbox'})
    const [, body] = apiMock.post.mock.calls[0] as [string, Record<string, unknown>]
    expect(body.author_origin).toBe('skill kb-inbox')
  })

  it('carries extra projects, groups, tags and review note', async () => {
    apiMock.get.mockResolvedValue(envelope([{id: PID, name: 'Piattaforma'}]))
    apiMock.post.mockResolvedValue(envelope({id: 'pg-9'}))
    await call('kb_propose', {
      project: ['ACME', PID],
      group: ['Piattaforma'],
      tag: ['deploy', 'kamal'],
      title: 'T',
      body: 'B',
      kind: 'guide',
      tech_spec: 'dettagli',
      review_note: 'Successo oggi',
    })
    expect(apiMock.post).toHaveBeenCalledWith('/cli/v1/knowledge/pages', {
      project: 'ACME',
      project_ids: [PID],
      group_ids: [PID],
      tags: ['deploy', 'kamal'],
      title: 'T',
      kind: 'guide',
      body: 'B',
      tech_spec: 'dettagli',
      in_review: true,
      review_note: 'Successo oggi',
      author_origin: 'mcp',
    })
  })

  it('requires the page to belong to something', async () => {
    await expect(call('kb_propose', {title: 'T', body: 'B'})).rejects.toBeInstanceOf(McpToolInputError)
    expect(apiMock.post).not.toHaveBeenCalled()
  })

  it('rejects title and text over the server cap before sending them', async () => {
    const error = await call('kb_propose', {
      project: 'ACME',
      title: 'x'.repeat(256),
      body: 'y'.repeat(4001),
    }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(McpToolInputError)
    expect((error as Error).message).toContain('title')
    expect((error as Error).message).toContain('body')
    expect(apiMock.post).not.toHaveBeenCalled()
  })

  it('requires title and text', async () => {
    await expect(call('kb_propose', {project: 'ACME', body: 'B'})).rejects.toBeInstanceOf(McpToolInputError)
    await expect(call('kb_propose', {project: 'ACME', title: 'T'})).rejects.toBeInstanceOf(McpToolInputError)
  })
})
