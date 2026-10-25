import {afterEach, describe, expect, it, vi} from 'vitest'
import {PID, capture, run} from './helpers/command'

/**
 * CYCL-11 end-to-end: only `loadConfig` is faked. The real `CliApi` runs, so the whole chain is
 * exercised — `handleResponse` saves `lastMeta`, then `BaseCommand.finally` prints the footer once.
 * Driving through the actual command (`tickets list`, `secrets list`) proves the hint reaches every
 * list without touching any of the 30 command files.
 */
vi.mock('../src/lib/config', async (io) => {
  const actual = await io<typeof import('../src/lib/config')>()
  return {...actual, loadConfig: vi.fn(() => ({apiUrl: 'https://api.test', token: 'tok_test'}))}
})

import SecretsList from '../src/commands/secrets/list'
import TicketsList from '../src/commands/tickets/list'
import TokensList from '../src/commands/tokens/list'

function ok(body: unknown) {
  return {ok: true, status: 200, statusText: 'OK', text: async () => JSON.stringify(body)}
}

afterEach(() => vi.unstubAllGlobals())

describe('pagination footer (CYCL-11)', () => {
  it('tells the reader how many exist in total and how to see the next page', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ok({data: [{code: 'T-1', title: 'Primo', status: 'open'}], meta: {page: 1, per: 10, total: 900, total_pages: 90}})),
    )
    const cap = capture()
    try {
      await run(TicketsList, ['--project', PID])
      const out = cap.stdout()
      expect(out).toContain('900') // how many in total
      expect(out).toContain('--page 2') // how to see the next ones
    } finally {
      cap.restore()
    }
  })

  it('stays silent when the whole collection already fits on one page', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ok({data: [{code: 'T-1'}], meta: {page: 1, per: 10, total: 1, total_pages: 1}})))
    const cap = capture()
    try {
      await run(TicketsList, ['--project', PID])
      expect(cap.stdout()).not.toContain('--page')
    } finally {
      cap.restore()
    }
  })

  it('never prints the footer in --json mode, so machine output stays exact', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ok({data: [{code: 'T-1'}], meta: {page: 1, per: 10, total: 900, total_pages: 90}})),
    )
    const cap = capture()
    try {
      const res = (await run(TicketsList, ['--project', PID, '--json'])) as {meta: unknown}
      expect(res.meta).toEqual({page: 1, per: 10, total: 900, total_pages: 90})
      expect(cap.stdout()).not.toContain('--page')
    } finally {
      cap.restore()
    }
  })

  it('never suggests --page on a command that does not expose it (tokens list has no --page)', async () => {
    // Same paginated meta as the tickets case, but tokens list has no `--page` flag: the hint would
    // point at a flag that does not exist, so BaseCommand must stay silent here (CYCL-11 review).
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ok({data: [{id: 'tok-1', name: 'CI', status: 'active'}], meta: {page: 1, per: 10, total: 50, total_pages: 5}})),
    )
    const cap = capture()
    try {
      await run(TokensList, ['--project', PID])
      expect(cap.stdout()).not.toContain('--page')
      expect(cap.stdout()).not.toContain('Showing page')
    } finally {
      cap.restore()
    }
  })

  it('does not nag when a command already aggregated every page (secrets list / fetchAllPages)', async () => {
    // fetchAllPages walks page 1..N; the last saved meta has page === total_pages → no footer.
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(ok({data: [{name: 'A'}], meta: {page: 1, per: 100, total: 150, total_pages: 2}}))
      .mockResolvedValueOnce(ok({data: [{name: 'B'}], meta: {page: 2, per: 100, total: 150, total_pages: 2}}))
    vi.stubGlobal('fetch', fetchMock)
    const cap = capture()
    try {
      await run(SecretsList, ['--project', PID])
      expect(cap.stdout()).not.toContain('--page')
    } finally {
      cap.restore()
    }
  })
})
