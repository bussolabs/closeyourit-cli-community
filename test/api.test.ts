import {afterEach, describe, expect, it, vi} from 'vitest'
import {ApiRequestError, CliApi} from '../src/lib/api'

afterEach(() => {
  vi.unstubAllGlobals()
})

function response(init: {ok: boolean; status: number; statusText?: string; body: unknown}) {
  return {
    ok: init.ok,
    status: init.status,
    statusText: init.statusText ?? '',
    text: async () => JSON.stringify(init.body),
  }
}

function binaryResponse(init: {
  ok: boolean
  status: number
  bytes?: number[]
  contentDisposition?: string
  contentType?: string
  body?: unknown
}) {
  const headers = new Map<string, string>()
  if (init.contentDisposition) headers.set('content-disposition', init.contentDisposition)
  if (init.contentType) headers.set('content-type', init.contentType)
  return {
    ok: init.ok,
    status: init.status,
    statusText: '',
    headers: {get: (key: string) => headers.get(key.toLowerCase()) ?? null},
    arrayBuffer: async () => new Uint8Array(init.bytes ?? []).buffer,
    text: async () => JSON.stringify(init.body ?? {}),
  }
}

describe('CliApi', () => {
  it('puts the client abort signal on every request, when there is one', async () => {
    // CYCL-56 — the MCP server sets it only once: this way the abort also reaches the by-name
    // lookups a call carries along, without going through every signature in between.
    const fetchMock = vi.fn(async () => response({ok: true, status: 200, body: {data: {}}}))
    vi.stubGlobal('fetch', fetchMock)
    const api = new CliApi({apiUrl: 'https://api.test', token: 'tok'})
    const client = new AbortController()
    api.signal = client.signal

    await api.get('/cli/v1/whoami')
    expect(fetchMock.mock.calls[0][1].signal).toBe(client.signal)

    // The single request one is more specific and wins: `kb context` has its own deadline.
    const perRequest = new AbortController()
    await api.get('/cli/v1/whoami', {signal: perRequest.signal})
    expect(fetchMock.mock.calls[1][1].signal).toBe(perRequest.signal)
  })

  it('maps an abort while reading the body as a network failure, not as a raw exception', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        statusText: '',
        text: async () => {
          throw new DOMException('The operation was aborted.', 'AbortError')
        },
      })),
    )
    const api = new CliApi({apiUrl: 'https://api.test', token: 'tok'})
    const error = await api.get('/cli/v1/knowledge/context').catch((err: unknown) => err)
    expect(error).toBeInstanceOf(ApiRequestError)
    expect((error as ApiRequestError).code).toBe('C000-NET-001')
  })

  it('returns the parsed envelope on success', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response({ok: true, status: 200, body: {data: {id: '1'}, meta: {total: 1}}})))

    const api = new CliApi({apiUrl: 'https://api.test', token: 'tok'})
    const res = await api.get<{id: string}>('/cli/v1/projects')

    expect(res.data).toEqual({id: '1'})
    expect(res.meta).toEqual({total: 1})
  })

  it('remembers the meta of the last successful response so the footer can page (CYCL-11)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response({ok: true, status: 200, body: {data: [], meta: {page: 1, per: 10, total: 900, total_pages: 90}}})),
    )

    const api = new CliApi({apiUrl: 'https://api.test', token: 'tok'})
    await api.get('/cli/v1/projects/p/tickets?page=1')

    expect(api.lastMeta).toEqual({page: 1, per: 10, total: 900, total_pages: 90})
  })

  it('clears lastMeta when the latest response carries no meta, so a single-record call prints no footer', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ok: true, status: 200, body: {data: [], meta: {page: 1, per: 10, total: 50, total_pages: 5}}}))
      .mockResolvedValueOnce(response({ok: true, status: 200, body: {data: {id: '1'}}}))
    vi.stubGlobal('fetch', fetchMock)

    const api = new CliApi({apiUrl: 'https://api.test', token: 'tok'})
    await api.get('/cli/v1/list')
    expect(api.lastMeta).toEqual({page: 1, per: 10, total: 50, total_pages: 5})

    await api.get('/cli/v1/one')
    expect(api.lastMeta).toBeUndefined()
  })

  it('download clears lastMeta so a resolver lookup never leaks a stale footer (CYCL-11)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ok: true, status: 200, body: {data: [], meta: {page: 1, per: 100, total: 150, total_pages: 2}}}))
      .mockResolvedValueOnce(binaryResponse({ok: true, status: 200, bytes: [1, 2, 3]}))
    vi.stubGlobal('fetch', fetchMock)

    const api = new CliApi({apiUrl: 'https://api.test', token: 'tok'})
    // A resolver call (resolveProjectId walks /projects?page=1&per=100) leaves paginated meta behind…
    await api.get('/cli/v1/projects?page=1&per=100')
    expect(api.lastMeta).toEqual({page: 1, per: 100, total: 150, total_pages: 2})

    // …and download() bypasses handleResponse on success, so it must clear it itself.
    await api.download('/cli/v1/projects/p/tickets/t/attachments/a/download')
    expect(api.lastMeta).toBeUndefined()
  })

  it('builds the URL and sends the Bearer header and JSON body', async () => {
    const fetchMock = vi.fn(async () => response({ok: true, status: 201, body: {data: {}}}))
    vi.stubGlobal('fetch', fetchMock)

    const api = new CliApi({apiUrl: 'https://api.test/', token: 'tok_abc'})
    await api.post('/cli/v1/projects/p/tokens', {name: 'CI'})

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.test/cli/v1/projects/p/tokens')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok_abc')
    expect(JSON.parse(init.body as string)).toEqual({name: 'CI'})
  })

  // CYCL-44: assigning an error group answers only to PATCH (`patch :assign`), a verb the
  // client could not speak — with PUT the same route is a 404.
  it('sends a PATCH with its JSON body', async () => {
    const fetchMock = vi.fn(async () => response({ok: true, status: 200, body: {data: {}}}))
    vi.stubGlobal('fetch', fetchMock)

    const api = new CliApi({apiUrl: 'https://api.test', token: 'tok_abc'})
    await api.patch('/cli/v1/projects/p/error_groups/eg-1/assign', {assignee_id: 'acct-1'})

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.test/cli/v1/projects/p/error_groups/eg-1/assign')
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(init.body as string)).toEqual({assignee_id: 'acct-1'})
  })

  it('throws ApiRequestError carrying the envelope code on non-2xx', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        response({
          ok: false,
          status: 422,
          statusText: 'Unprocessable',
          body: {error: {code: 'R422-AUTH-001', message: 'Email invalid', details: {email: ['bad']}}},
        }),
      ),
    )

    const api = new CliApi({apiUrl: 'https://api.test', token: 'tok'})
    const error = await api.get('/x').catch((err) => err)

    expect(error).toBeInstanceOf(ApiRequestError)
    expect(error.status).toBe(422)
    expect(error.code).toBe('R422-AUTH-001')
    expect(error.message).toBe('Email invalid')
    expect(error.details).toEqual({email: ['bad']})
  })

  it('throws a clear "Not logged in" error and never calls fetch without a token', async () => {
    const fetchMock = vi.fn(() => {
      throw new Error('fetch should not be called')
    })
    vi.stubGlobal('fetch', fetchMock)

    const api = new CliApi({apiUrl: 'https://api.test'})
    await expect(api.get('/cli/v1/projects')).rejects.toThrow(/Not logged in/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('allows unauthenticated requests when auth is false', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response({ok: true, status: 200, body: {data: {ok: true}}})))

    const api = new CliApi({apiUrl: 'https://api.test'})
    const res = await api.get<{ok: boolean}>('/public', {auth: false})
    expect(res.data).toEqual({ok: true})
  })

  it('upload sends a FormData body, keeps the Bearer header and never forces Content-Type', async () => {
    const fetchMock = vi.fn(async () => response({ok: true, status: 201, body: {data: [{id: 'a1', filename: 'x.png'}]}}))
    vi.stubGlobal('fetch', fetchMock)

    const api = new CliApi({apiUrl: 'https://api.test/', token: 'tok_abc'})
    const res = await api.upload<Array<{id: string}>>('POST', '/cli/v1/projects/p/tickets/t/attachments', [
      {field: 'files[]', filename: 'x.png', data: new Blob(['hello'])},
    ])

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.test/cli/v1/projects/p/tickets/t/attachments')
    expect(init.method).toBe('POST')
    expect(init.body).toBeInstanceOf(FormData)
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer tok_abc')
    expect(headers['Content-Type']).toBeUndefined()
    expect(res.data).toEqual([{id: 'a1', filename: 'x.png'}])
  })

  it('upload maps the error envelope just like request', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        response({ok: false, status: 413, statusText: 'Too Large', body: {error: {code: 'R413-INGEST-001', message: 'File too large'}}}),
      ),
    )

    const api = new CliApi({apiUrl: 'https://api.test', token: 'tok'})
    const error = await api
      .upload('POST', '/x', [{field: 'files[]', filename: 'f', data: new Blob(['z'])}])
      .catch((err) => err)

    expect(error).toBeInstanceOf(ApiRequestError)
    expect(error.status).toBe(413)
    expect(error.code).toBe('R413-INGEST-001')
  })

  it('upload throws "Not logged in" without a token and never calls fetch', async () => {
    const fetchMock = vi.fn(() => {
      throw new Error('fetch should not be called')
    })
    vi.stubGlobal('fetch', fetchMock)

    const api = new CliApi({apiUrl: 'https://api.test'})
    await expect(
      api.upload('POST', '/x', [{field: 'files[]', filename: 'f', data: new Blob(['z'])}]),
    ).rejects.toThrow(/Not logged in/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('download returns the bytes, follows redirects and parses the filename from Content-Disposition', async () => {
    const fetchMock = vi.fn(async () =>
      binaryResponse({
        ok: true,
        status: 200,
        bytes: [1, 2, 3, 4],
        contentDisposition: 'attachment; filename="screenshot.png"',
        contentType: 'image/png',
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const api = new CliApi({apiUrl: 'https://api.test', token: 'tok'})
    const out = await api.download('/cli/v1/projects/p/tickets/t/attachments/a/download')

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.test/cli/v1/projects/p/tickets/t/attachments/a/download')
    expect(init.redirect).toBe('follow')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok')
    expect(Array.from(out.data)).toEqual([1, 2, 3, 4])
    expect(out.filename).toBe('screenshot.png')
    expect(out.contentType).toBe('image/png')
  })

  it('download maps the JSON error envelope on non-2xx', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => binaryResponse({ok: false, status: 404, body: {error: {code: 'R404-TICKET-001', message: 'Not found'}}})),
    )

    const api = new CliApi({apiUrl: 'https://api.test', token: 'tok'})
    const error = await api.download('/x').catch((err) => err)

    expect(error).toBeInstanceOf(ApiRequestError)
    expect(error.status).toBe(404)
    expect(error.code).toBe('R404-TICKET-001')
  })

  it('download throws "Not logged in" without a token and never calls fetch', async () => {
    const fetchMock = vi.fn(() => {
      throw new Error('fetch should not be called')
    })
    vi.stubGlobal('fetch', fetchMock)

    const api = new CliApi({apiUrl: 'https://api.test'})
    await expect(api.download('/x')).rejects.toThrow(/Not logged in/)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('CliApi — confirmation of dangerous actions (CYCL-53)', () => {
  function fetchSpy() {
    return vi.fn(async () => response({ok: true, status: 200, body: {data: {}}}))
  }

  it('without confirmation adds nothing to the request', async () => {
    const fetchMock = fetchSpy()
    vi.stubGlobal('fetch', fetchMock)
    const api = new CliApi({apiUrl: 'https://api.test', token: 'tok'})
    await api.post('/cli/v1/projects/p/secrets/import', {environment: 'production'})
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://api.test/cli/v1/projects/p/secrets/import')
  })

  it('with confirmation sends confirm=1 in the query of writing requests, even without a body', async () => {
    const fetchMock = fetchSpy()
    vi.stubGlobal('fetch', fetchMock)
    const api = new CliApi({apiUrl: 'https://api.test', token: 'tok'})
    api.confirm = true
    await api.post('/cli/v1/projects/p/secrets/import', {environment: 'production'})
    await api.delete('/cli/v1/projects/p/secrets/API_KEY?environment=production')
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://api.test/cli/v1/projects/p/secrets/import?confirm=1')
    expect(String(fetchMock.mock.calls[1][0])).toBe('https://api.test/cli/v1/projects/p/secrets/API_KEY?environment=production&confirm=1')
  })

  it('reading is not executing: GETs stay without confirmation', async () => {
    const fetchMock = fetchSpy()
    vi.stubGlobal('fetch', fetchMock)
    const api = new CliApi({apiUrl: 'https://api.test', token: 'tok'})
    api.confirm = true
    await api.get('/cli/v1/projects')
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://api.test/cli/v1/projects')
  })

  it('R422-CONFIRM-001 explains that --yes is needed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response({ok: false, status: 422, body: {error: {code: 'R422-CONFIRM-001', message: 'Azione pericolosa: ripeti il comando confermando (--yes)'}}})),
    )
    const api = new CliApi({apiUrl: 'https://api.test', token: 'tok'})
    await expect(api.post('/cli/v1/projects/p/secrets/import', {})).rejects.toMatchObject({
      code: 'R422-CONFIRM-001',
      message: expect.stringContaining('--yes'),
    })
  })
})

