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

import KbBookAddPage from '../src/commands/kb/book/add-page'
import KbBookList from '../src/commands/kb/book/list'
import KbBookShow from '../src/commands/kb/book/show'

const BOOK = 'bk-1'
const PAGE = 'pg-1'

/** Book with its table of contents: the canonical response of `show` and `add-page`. */
function bookWithToc(pages: Array<Record<string, unknown>>): Record<string, unknown> {
  return {
    id: BOOK,
    title: 'Manuale deploy',
    description: 'Come si rilascia',
    author: 'Ada',
    projects: ['ACME'],
    groups: ['Piattaforma'],
    pages_count: pages.length,
    created_at: '2026-07-01',
    updated_at: '2026-07-02',
    pages,
  }
}

const TOC = [
  {id: PAGE, title: 'Rollback Kamal', position: 0, kind: 'guide', project: 'ACME'},
  {id: 'pg-2', title: 'Checklist rilascio', position: 1, kind: 'note', project: 'ACME'},
]

beforeEach(() => {
  resetApiMock()
})

describe('kb book list', () => {
  it('lists the visible books without filters', async () => {
    apiMock.get.mockResolvedValue(
      envelope([
        {
          id: BOOK,
          title: 'Manuale deploy',
          author: 'Ada',
          projects: ['ACME'],
          pages_count: 4,
          updated_at: '2026-07-02',
        },
      ]),
    )
    const {stdout} = await runCaptured(KbBookList, [])
    expect(apiMock.get).toHaveBeenCalledWith('/cli/v1/knowledge/books?page=1')
    expect(stdout).toContain('Manuale deploy')
    expect(stdout).toContain('Ada')
    // The id is the argument of `kb book show` and `add-page`: without it, the list forces --json.
    expect(stdout).toContain(BOOK)
    expect(stdout).toContain('4')
  })

  it('forwards project, q, per and page as query', async () => {
    apiMock.get.mockResolvedValue(envelope([]))
    await runCaptured(KbBookList, ['--project', 'acme-api', '--q', 'deploy', '--per', '50', '--page', '2'])
    expect(apiMock.get).toHaveBeenCalledWith('/cli/v1/knowledge/books?page=2&per=50&project=acme-api&q=deploy')
  })

  it('lists the book projects on a single line', async () => {
    apiMock.get.mockResolvedValue(envelope([{id: BOOK, title: 'Cross', projects: ['ACME', 'BETA'], pages_count: 0}]))
    const {stdout} = await runCaptured(KbBookList, [])
    expect(stdout).toContain('ACME, BETA')
  })

  it('truncates long titles keeping the table on one line', async () => {
    const longTitle = 'x'.repeat(120)
    apiMock.get.mockResolvedValue(envelope([{id: BOOK, title: longTitle}]))
    const {stdout} = await runCaptured(KbBookList, [])
    expect(stdout).toContain('…')
    expect(stdout).not.toContain(longTitle)
  })

  it('renders empty cells for a row without fields', async () => {
    apiMock.get.mockResolvedValue(envelope([{}]))
    const {result} = await runCaptured(KbBookList, [])
    expect((result as {data: unknown[]}).data).toHaveLength(1)
  })

  it("with --json returns the envelope and does not print the table", async () => {
    apiMock.get.mockResolvedValue(envelope([{id: BOOK, title: 'X'}], {total: 1}))
    const {result, stdout} = await runCaptured(KbBookList, ['--json'])
    expect((result as {data: unknown[]}).data).toHaveLength(1)
    expect(stdout).not.toContain('UPDATED')
  })

  it('says how to see the next page when not all books fit', async () => {
    apiMock.get.mockResolvedValue(envelope([{id: BOOK, title: 'X'}]))
    apiMock.lastMeta = {page: 1, per: 10, total: 42, total_pages: 5}
    const {stdout} = await runCaptured(KbBookList, [])
    expect(stdout).toContain('42')
    expect(stdout).toContain('--page 2')
  })

  it('rejects a page lower than 1 without calling the server', async () => {
    const {message} = await runExpectingExit(KbBookList, ['--page', '0'], 2)
    expect(message).toContain('--page')
    expect(apiMock.get).not.toHaveBeenCalled()
  })

  it('rejects a page size lower than 1 without calling the server', async () => {
    const {message} = await runExpectingExit(KbBookList, ['--per', '0'], 2)
    expect(message).toContain('--per')
    expect(apiMock.get).not.toHaveBeenCalled()
  })

  it('exits non-zero when the requested project is not visible', async () => {
    apiMock.get.mockRejectedValue(apiError(404, 'R404-KNOWLEDGE-001', 'Progetto non trovato'))
    const {stderr} = await runExpectingExit(KbBookList, ['--project', 'segreto'])
    expect(stderr).toContain('R404-KNOWLEDGE-001')
  })

  it('exits non-zero on an API error', async () => {
    apiMock.get.mockRejectedValue(apiError(500, 'R500-SYS-001', 'boom'))
    const {stderr} = await runExpectingExit(KbBookList, [])
    expect(stderr).toContain('R500-SYS-001')
  })
})

describe('kb book show', () => {
  it('prints the metadata and the table of contents in position order', async () => {
    apiMock.get.mockResolvedValue(envelope(bookWithToc(TOC)))
    const {stdout} = await runCaptured(KbBookShow, [BOOK])
    expect(apiMock.get).toHaveBeenCalledWith(`/cli/v1/knowledge/books/${BOOK}`)
    expect(stdout).toContain('title: Manuale deploy')
    expect(stdout).toContain('projects: ACME')
    expect(stdout).toContain('pages_count: 2')
    expect(stdout).toContain('Rollback Kamal')
    expect(stdout).toContain('Checklist rilascio')
    expect(stdout.indexOf('Rollback Kamal')).toBeLessThan(stdout.indexOf('Checklist rilascio'))
  })

  it('prints the position of every page, 0 included', async () => {
    apiMock.get.mockResolvedValue(envelope(bookWithToc(TOC)))
    const {stdout} = await runCaptured(KbBookShow, [BOOK])
    const first = stdout.split('\n').find((line) => line.includes('Rollback Kamal')) ?? ''
    expect(first.trimStart().startsWith('0')).toBe(true)
  })

  it('shows the empty table of contents of a book without pages', async () => {
    apiMock.get.mockResolvedValue(envelope(bookWithToc([])))
    const {stdout} = await runCaptured(KbBookShow, [BOOK])
    expect(stdout).toContain('(no results)')
  })

  it('handles a book without the pages field', async () => {
    apiMock.get.mockResolvedValue(envelope({id: BOOK, title: 'Senza sommario'}))
    const {stdout} = await runCaptured(KbBookShow, [BOOK])
    expect(stdout).toContain('title: Senza sommario')
    expect(stdout).toContain('(no results)')
  })

  it('handles a response without data', async () => {
    apiMock.get.mockResolvedValue({})
    const {stdout} = await runCaptured(KbBookShow, [BOOK])
    expect(stdout).toContain('(no results)')
  })

  it("encodes the id in the URL", async () => {
    apiMock.get.mockResolvedValue(envelope(bookWithToc([])))
    await runCaptured(KbBookShow, ['bk 1/2'])
    expect(apiMock.get).toHaveBeenCalledWith('/cli/v1/knowledge/books/bk%201%2F2')
  })

  it("with --json returns the raw envelope", async () => {
    apiMock.get.mockResolvedValue(envelope(bookWithToc(TOC)))
    const {result, stdout} = await runCaptured(KbBookShow, [BOOK, '--json'])
    expect((result as {data: {pages: unknown[]}}).data.pages).toHaveLength(2)
    expect(stdout).not.toContain('title: Manuale deploy')
  })

  it('exits non-zero when the book is not visible', async () => {
    apiMock.get.mockRejectedValue(apiError(404, 'R404-SYS-001', 'Risorsa non trovata'))
    const {stderr} = await runExpectingExit(KbBookShow, [BOOK])
    expect(stderr).toContain('R404-SYS-001')
  })

  it("without an id no call is made", async () => {
    await runExpectingExit(KbBookShow, [], 2)
    expect(apiMock.get).not.toHaveBeenCalled()
  })
})

describe('kb book add-page', () => {
  it('appends the page at the end and prints the updated table of contents', async () => {
    apiMock.post.mockResolvedValue(envelope(bookWithToc(TOC)))
    const {stdout} = await runCaptured(KbBookAddPage, [BOOK, '--page', PAGE])
    expect(apiMock.post).toHaveBeenCalledWith(`/cli/v1/knowledge/books/${BOOK}/pages`, {page_id: PAGE})
    expect(stdout).toContain('Rollback Kamal')
    expect(stdout).toContain('Checklist rilascio')
  })

  // It is the name the Automator already invokes (closeyourit-automator, lib/book.ts `assignPage`):
  // renaming it would make every assignment fail with an unknown flag.
  it("accepts the page id as --page, the name the Automator calls", async () => {
    apiMock.post.mockResolvedValue(envelope(bookWithToc(TOC)))
    await runCaptured(KbBookAddPage, [BOOK, '--page', PAGE, '--json'])
    expect(apiMock.post).toHaveBeenCalledWith(`/cli/v1/knowledge/books/${BOOK}/pages`, {page_id: PAGE})
  })

  it('also accepts --page-id, for whoever writes the command by hand', async () => {
    apiMock.post.mockResolvedValue(envelope(bookWithToc(TOC)))
    await runCaptured(KbBookAddPage, [BOOK, '--page-id', PAGE])
    expect(apiMock.post).toHaveBeenCalledWith(`/cli/v1/knowledge/books/${BOOK}/pages`, {page_id: PAGE})
  })

  it('forwards the requested position as is, without renumbering it', async () => {
    apiMock.post.mockResolvedValue(envelope(bookWithToc(TOC)))
    await runCaptured(KbBookAddPage, [BOOK, '--page', PAGE, '--position', '1'])
    expect(apiMock.post).toHaveBeenCalledWith(`/cli/v1/knowledge/books/${BOOK}/pages`, {page_id: PAGE, position: 1})
  })

  it('states in the help that the position starts from 0', () => {
    const flags = KbBookAddPage.flags as Record<string, {description?: string}>
    expect(flags.position.description).toContain('0 = top')
    expect(flags.page.description).toContain('--page-id')
  })

  it('forwards position 0, which means "at the top"', async () => {
    apiMock.post.mockResolvedValue(envelope(bookWithToc(TOC)))
    await runCaptured(KbBookAddPage, [BOOK, '--page', PAGE, '--position', '0'])
    expect(apiMock.post).toHaveBeenCalledWith(`/cli/v1/knowledge/books/${BOOK}/pages`, {page_id: PAGE, position: 0})
  })

  it('repeated on the same page does not duplicate it in the table of contents', async () => {
    apiMock.post.mockResolvedValue(envelope(bookWithToc(TOC)))
    await runCaptured(KbBookAddPage, [BOOK, '--page', PAGE])
    const {stdout} = await runCaptured(KbBookAddPage, [BOOK, '--page', PAGE])
    expect(apiMock.post).toHaveBeenNthCalledWith(2, `/cli/v1/knowledge/books/${BOOK}/pages`, {page_id: PAGE})
    expect(stdout.split('Rollback Kamal')).toHaveLength(2)
    expect(stdout).toContain('pages_count: 2')
  })

  it("encodes the ids in the URL and in the body", async () => {
    apiMock.post.mockResolvedValue(envelope(bookWithToc([])))
    await runCaptured(KbBookAddPage, ['bk 1/2', '--page', 'pg 1'])
    expect(apiMock.post).toHaveBeenCalledWith('/cli/v1/knowledge/books/bk%201%2F2/pages', {page_id: 'pg 1'})
  })

  it('rejects a negative position without calling the server', async () => {
    const {message} = await runExpectingExit(KbBookAddPage, [BOOK, '--page', PAGE, '--position', '-1'], 2)
    expect(message).toContain('--position')
    expect(apiMock.post).not.toHaveBeenCalled()
  })

  it('without --page-id no call is made', async () => {
    await runExpectingExit(KbBookAddPage, [BOOK], 2)
    expect(apiMock.post).not.toHaveBeenCalled()
  })

  it('propagates the server rejection when the page is already in another book', async () => {
    apiMock.post.mockRejectedValue(
      apiError(422, 'R422-KNOWLEDGE-007', 'Questa pagina appartiene già a un altro book.'),
    )
    const {message} = await runExpectingExit(KbBookAddPage, [BOOK, '--page', PAGE])
    expect(message).toContain('R422-KNOWLEDGE-007')
    expect(message).toContain('altro book')
  })

  it('propagates the server rejection when the page does not belong to the book projects', async () => {
    apiMock.post.mockRejectedValue(apiError(422, 'R422-KNOWLEDGE-006', 'La pagina non è nei progetti del book.'))
    const {message} = await runExpectingExit(KbBookAddPage, [BOOK, '--page', PAGE])
    expect(message).toContain('R422-KNOWLEDGE-006')
  })

  it('propagates the permission denied', async () => {
    apiMock.post.mockRejectedValue(apiError(403, 'R403-CLIAUTH-002', 'Permesso negato'))
    const {message} = await runExpectingExit(KbBookAddPage, [BOOK, '--page', PAGE])
    expect(message).toContain('R403-CLIAUTH-002')
  })

  it("with --json returns the envelope and does not print the table of contents", async () => {
    apiMock.post.mockResolvedValue(envelope(bookWithToc(TOC)))
    const {result, stdout} = await runCaptured(KbBookAddPage, [BOOK, '--page', PAGE, '--json'])
    expect((result as {data: {pages: unknown[]}}).data.pages).toHaveLength(2)
    expect(stdout).not.toContain('Book summary updated')
    expect(stdout).not.toContain('Contents')
  })

  it('handles a response without data', async () => {
    apiMock.post.mockResolvedValue({})
    const {stdout} = await runCaptured(KbBookAddPage, [BOOK, '--page', PAGE])
    expect(stdout).toContain('(no results)')
  })
})
