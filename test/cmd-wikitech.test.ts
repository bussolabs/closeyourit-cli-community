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
vi.mock('node:fs/promises', () => ({readFile: vi.fn()}))
vi.mock('../src/lib/stdin', () => ({readStream: vi.fn()}))

import {readFile} from 'node:fs/promises'
import {readStream} from '../src/lib/stdin'
import WikitechAdd from '../src/commands/wikitech/add'
import WikitechAsk from '../src/commands/wikitech/ask'
import WikitechSearch from '../src/commands/wikitech/search'
import WikitechShow from '../src/commands/wikitech/show'

const NOTE = {
  id: 'note-1',
  status: 'pending',
  source_label: 'TikTok @github.signals',
  source_url: 'https://www.tiktok.com/@github.signals/video/1',
  source_published_at: '2026-10-30T10:00:00Z',
  links: ['https://github.com/astral-sh/uv'],
  created_at: '2026-11-01T12:00:00Z',
}

const SUMMARY = {
  id: 'entry-1',
  name: 'uv',
  summary: 'Fast Python package manager written in Rust',
  categories: ['python', 'packaging'],
  repo_url: 'https://github.com/astral-sh/uv',
  verification: 'verified',
  sources_count: 3,
  stars: 42000,
  license: 'MIT',
  language: 'Rust',
  updated_at: '2026-10-31',
}

function withStdinTTY<T>(isTTY: boolean | undefined, fn: () => Promise<T>): Promise<T> {
  const original = process.stdin.isTTY
  Object.defineProperty(process.stdin, 'isTTY', {configurable: true, value: isTTY})
  return fn().finally(() => {
    Object.defineProperty(process.stdin, 'isTTY', {configurable: true, value: original})
  })
}

beforeEach(() => {
  resetApiMock()
  vi.mocked(readFile).mockReset()
  vi.mocked(readStream).mockReset()
})

describe('wikitech add', () => {
  it('sends the body read from --file with source fields and repeatable links', async () => {
    vi.mocked(readFile).mockResolvedValue('uv replaces pip and virtualenv')
    apiMock.post.mockResolvedValue(envelope(NOTE))
    const {stdout} = await runCaptured(WikitechAdd, [
      '--file', './note.txt',
      '--source-label', 'TikTok @github.signals',
      '--source-url', 'https://www.tiktok.com/@github.signals/video/1',
      '--source-published-at', '2026-10-30T10:00:00Z',
      '--link', 'https://github.com/astral-sh/uv',
      '--link', ' https://docs.astral.sh/uv ',
    ])
    expect(readFile).toHaveBeenCalledWith('./note.txt', 'utf8')
    expect(apiMock.post).toHaveBeenCalledWith('/cli/v1/wikitech/notes', {
      body: 'uv replaces pip and virtualenv',
      source_label: 'TikTok @github.signals',
      source_url: 'https://www.tiktok.com/@github.signals/video/1',
      source_published_at: '2026-10-30T10:00:00Z',
      links: ['https://github.com/astral-sh/uv', 'https://docs.astral.sh/uv'],
    })
    expect(stdout).toContain('Note saved')
    expect(stdout).toContain('note-1')
    expect(stdout).toContain('pending')
  })

  it('omits the optional keys when they are not given', async () => {
    vi.mocked(readFile).mockResolvedValue('just a body')
    apiMock.post.mockResolvedValue(envelope(NOTE))
    await runCaptured(WikitechAdd, ['--file', './note.txt'])
    expect(apiMock.post).toHaveBeenCalledWith('/cli/v1/wikitech/notes', {body: 'just a body'})
  })

  it('reads the body from stdin with --file -', async () => {
    vi.mocked(readStream).mockResolvedValue('piped body\n')
    apiMock.post.mockResolvedValue(envelope(NOTE))
    await runCaptured(WikitechAdd, ['--file', '-'])
    expect(readFile).not.toHaveBeenCalled()
    expect(apiMock.post).toHaveBeenCalledWith('/cli/v1/wikitech/notes', {body: 'piped body\n'})
  })

  it('reads the body from piped stdin when --file is absent', async () => {
    vi.mocked(readStream).mockResolvedValue('piped body')
    apiMock.post.mockResolvedValue(envelope(NOTE))
    await withStdinTTY(false, () => runCaptured(WikitechAdd, []))
    expect(apiMock.post).toHaveBeenCalledWith('/cli/v1/wikitech/notes', {body: 'piped body'})
  })

  it('without --file on a terminal asks for a body source (exit 2)', async () => {
    const {message} = await withStdinTTY(true, () => runExpectingExit(WikitechAdd, [], 2))
    expect(message).toContain('--file')
    expect(apiMock.post).not.toHaveBeenCalled()
  })

  it('refuses an unreadable file (exit 2)', async () => {
    vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'))
    const {message} = await runExpectingExit(WikitechAdd, ['--file', './missing.txt'], 2)
    expect(message).toContain('File not found or unreadable: ./missing.txt')
    expect(apiMock.post).not.toHaveBeenCalled()
  })

  it('refuses a blank body before the call (exit 2)', async () => {
    vi.mocked(readStream).mockResolvedValue('  \n ')
    const {message} = await runExpectingExit(WikitechAdd, ['--file', '-'], 2)
    expect(message).toContain('empty')
    expect(apiMock.post).not.toHaveBeenCalled()
  })

  it('refuses a body over 20000 characters before the call (exit 2)', async () => {
    vi.mocked(readFile).mockResolvedValue('x'.repeat(20_001))
    const {message} = await runExpectingExit(WikitechAdd, ['--file', './big.txt'], 2)
    expect(message).toContain('20000')
    expect(apiMock.post).not.toHaveBeenCalled()
  })

  it('says when the note was already saved (meta.duplicate)', async () => {
    vi.mocked(readFile).mockResolvedValue('uv replaces pip')
    apiMock.post.mockResolvedValue(envelope(NOTE, {duplicate: true}))
    const {stdout} = await runCaptured(WikitechAdd, ['--file', './note.txt'])
    expect(stdout).toContain('Already saved')
    expect(stdout).not.toContain('Note saved')
  })

  it('with --json returns the envelope including meta.duplicate', async () => {
    vi.mocked(readFile).mockResolvedValue('uv replaces pip')
    apiMock.post.mockResolvedValue(envelope(NOTE, {duplicate: true}))
    const {result, stdout} = await runCaptured(WikitechAdd, ['--file', './note.txt', '--json'])
    expect(result).toEqual({data: NOTE, meta: {duplicate: true}})
    expect(stdout).not.toContain('Already saved')
  })

  it('exits non-zero on a server validation error', async () => {
    vi.mocked(readFile).mockResolvedValue('body')
    apiMock.post.mockRejectedValue(apiError(422, 'R422-WIKITECH-003', 'invalid URL'))
    const {stderr} = await runExpectingExit(WikitechAdd, ['--file', './note.txt', '--source-url', 'ftp://x'], 2)
    expect(stderr).toContain('R422-WIKITECH-003')
  })
})

describe('wikitech search', () => {
  it('joins the variadic query and sends it as q, rendering a table', async () => {
    apiMock.get.mockResolvedValue(envelope([SUMMARY], {page: 1, per: 25, total: 1, total_pages: 1, search: 'semantic'}))
    const {stdout} = await runCaptured(WikitechSearch, ['python', 'package', 'manager'])
    expect(apiMock.get).toHaveBeenCalledWith('/cli/v1/wikitech/entries?page=1&q=python+package+manager')
    expect(stdout).toContain('NAME')
    expect(stdout).toContain('uv')
    expect(stdout).toContain('python, packaging')
    expect(stdout).toContain('verified')
    expect(stdout).toContain('entry-1')
    expect(stdout).not.toContain('semantic search unavailable')
  })

  it('without a query lists the entries', async () => {
    apiMock.get.mockResolvedValue(envelope([SUMMARY]))
    await runCaptured(WikitechSearch, [])
    expect(apiMock.get).toHaveBeenCalledWith('/cli/v1/wikitech/entries?page=1')
  })

  it('forwards category, verification, page and per', async () => {
    apiMock.get.mockResolvedValue(envelope([]))
    await runCaptured(WikitechSearch, ['uv', '--category', 'python', '--verification', 'unconfirmed', '--page', '2', '--per', '10'])
    expect(apiMock.get).toHaveBeenCalledWith(
      '/cli/v1/wikitech/entries?page=2&per=10&q=uv&category=python&verification=unconfirmed',
    )
  })

  it('rejects an unknown verification value (exit 2)', async () => {
    await runExpectingExit(WikitechSearch, ['--verification', 'maybe'], 2)
    expect(apiMock.get).not.toHaveBeenCalled()
  })

  it('rejects a page below 1 before the call (exit 2)', async () => {
    const {message} = await runExpectingExit(WikitechSearch, ['--page', '0'], 2)
    expect(message).toContain('Invalid --page 0')
    expect(apiMock.get).not.toHaveBeenCalled()
  })

  it('shows the hint when the server falls back to a text match', async () => {
    apiMock.get.mockResolvedValue(envelope([SUMMARY], {search: 'like'}))
    const {stdout} = await runCaptured(WikitechSearch, ['uv'])
    expect(stdout).toContain('(semantic search unavailable — showing text matches)')
  })

  it('renders empty cells for a row without fields', async () => {
    apiMock.get.mockResolvedValue(envelope([{}]))
    const {result} = await runCaptured(WikitechSearch, [])
    expect((result as {data: unknown[]}).data).toHaveLength(1)
  })

  it('with --json returns the raw envelope and prints no table', async () => {
    apiMock.get.mockResolvedValue(envelope([SUMMARY], {search: 'like'}))
    const {result, stdout} = await runCaptured(WikitechSearch, ['uv', '--json'])
    expect((result as {data: unknown[]}).data).toEqual([SUMMARY])
    expect(stdout).not.toContain('NAME')
  })

  it('exits non-zero on an API error', async () => {
    apiMock.get.mockRejectedValue(apiError(503, 'R503-SYS-002', 'down'))
    const {stderr} = await runExpectingExit(WikitechSearch, ['uv'])
    expect(stderr).toContain('R503-SYS-002')
  })
})

describe('wikitech show', () => {
  const ENTRY = {
    ...SUMMARY,
    facts: ['Resolves dependencies 10x faster than pip', 'Ships a single static binary'],
    links: ['https://docs.astral.sh/uv'],
    repo: {
      full_name: 'astral-sh/uv',
      stars: 42000,
      license: 'MIT',
      language: 'Rust',
      pushed_at: '2026-10-30',
      fetched_at: '2026-10-31',
    },
    sources: [
      {label: 'TikTok @github.signals', url: 'https://www.tiktok.com/@github.signals/video/1', published_at: '2026-10-30', quote: 'uv is insanely fast'},
    ],
  }

  it('prints the card: summary, facts, repo, links and sources', async () => {
    apiMock.get.mockResolvedValue(envelope(ENTRY))
    const {stdout} = await runCaptured(WikitechShow, ['entry-1'])
    expect(apiMock.get).toHaveBeenCalledWith('/cli/v1/wikitech/entries/entry-1')
    expect(stdout).toContain('name: uv')
    expect(stdout).toContain('Fast Python package manager written in Rust')
    expect(stdout).toContain('python, packaging')
    expect(stdout).toContain('Resolves dependencies 10x faster than pip')
    expect(stdout).toContain('astral-sh/uv')
    expect(stdout).toContain('pushed_at: 2026-10-30')
    expect(stdout).toContain('https://docs.astral.sh/uv')
    expect(stdout).toContain('TikTok @github.signals')
    expect(stdout).toContain('uv is insanely fast')
  })

  it('escapes the id in the path', async () => {
    apiMock.get.mockResolvedValue(envelope(ENTRY))
    await runCaptured(WikitechShow, ['a/b'])
    expect(apiMock.get).toHaveBeenCalledWith('/cli/v1/wikitech/entries/a%2Fb')
  })

  it('skips the empty sections of a sparse entry', async () => {
    apiMock.get.mockResolvedValue(envelope({id: 'entry-2', name: 'x', facts: [], links: [], repo: null, sources: []}))
    const {stdout} = await runCaptured(WikitechShow, ['entry-2'])
    expect(stdout).toContain('name: x')
    expect(stdout).not.toContain('Facts')
    expect(stdout).not.toContain('Repository')
    expect(stdout).not.toContain('Sources')
  })

  it('with --json returns the envelope', async () => {
    apiMock.get.mockResolvedValue(envelope(ENTRY))
    const {result, stdout} = await runCaptured(WikitechShow, ['entry-1', '--json'])
    expect(result).toEqual({data: ENTRY})
    expect(stdout).not.toContain('Facts')
  })

  it('exits non-zero when the entry does not exist', async () => {
    apiMock.get.mockRejectedValue(apiError(404, 'R404-WIKITECH-001', 'not found'))
    const {stderr} = await runExpectingExit(WikitechShow, ['missing'], 5)
    expect(stderr).toContain('R404-WIKITECH-001')
  })
})

describe('wikitech ask', () => {
  it('joins the variadic question, prints the answer and the cited entries', async () => {
    apiMock.post.mockResolvedValue(envelope({answer: 'Use uv: it is the fastest.', insufficient: false, entries: [SUMMARY]}))
    const {stdout} = await runCaptured(WikitechAsk, ['which', 'python', 'package', 'manager?'])
    expect(apiMock.post).toHaveBeenCalledWith('/cli/v1/wikitech/asks', {question: 'which python package manager?'})
    expect(stdout).toContain('Use uv: it is the fastest.')
    expect(stdout).toContain('Cited entries')
    expect(stdout).toContain('uv · entry-1')
    expect(stdout).not.toContain('not have enough')
  })

  it('says clearly when the answer is insufficient', async () => {
    apiMock.post.mockResolvedValue(envelope({answer: null, insufficient: true, entries: []}))
    const {stdout} = await runCaptured(WikitechAsk, ['what is foo?'])
    expect(stdout).toContain('Wikitech does not have enough to answer this.')
    expect(stdout).not.toContain('Cited entries')
  })

  it('requires a question (exit 2)', async () => {
    const {message} = await runExpectingExit(WikitechAsk, [], 2)
    expect(message).toContain('Provide a question')
    expect(apiMock.post).not.toHaveBeenCalled()
  })

  it('with --json returns the envelope and prints nothing else', async () => {
    const data = {answer: null, insufficient: true, entries: []}
    apiMock.post.mockResolvedValue(envelope(data))
    const {result, stdout} = await runCaptured(WikitechAsk, ['foo', '--json'])
    expect(result).toEqual({data})
    expect(stdout).not.toContain('Asking')
  })

  it('exits non-zero when the AI service is down', async () => {
    apiMock.post.mockRejectedValue(apiError(502, 'R502-AI-001', 'AI unavailable'))
    const {stderr} = await runExpectingExit(WikitechAsk, ['foo'])
    expect(stderr).toContain('R502-AI-001')
  })
})
