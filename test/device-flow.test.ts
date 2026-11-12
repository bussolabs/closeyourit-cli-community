import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {pollDeviceToken, startDeviceFlow} from '../src/lib/device-flow'

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function response(ok: boolean, status: number, body: unknown) {
  return {ok, status, statusText: '', text: async () => JSON.stringify(body)}
}

describe('device-flow', () => {
  it('startDeviceFlow posts client_name and returns the authorization data', async () => {
    const fetchMock = vi.fn(async () =>
      response(true, 200, {
        data: {
          device_code: 'dc',
          user_code: 'WXYZ-1234',
          verification_uri: 'https://x/device',
          verification_uri_complete: 'https://x/device?code=WXYZ-1234',
          interval: 5,
          expires_in: 600,
        },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const auth = await startDeviceFlow('https://api.test', 'cli/1 (test)')

    expect(auth.user_code).toBe('WXYZ-1234')
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.test/cli/device/authorize')
    expect(JSON.parse(init.body as string)).toEqual({client_name: 'cli/1 (test)'})
  })

  it('polls through pending, bumps the interval on slow_down, then returns the token', async () => {
    const sequence = [
      response(false, 400, {error: {message: 'pending', details: {oauth_error: 'authorization_pending'}}}),
      response(false, 400, {error: {message: 'slow down', details: {oauth_error: 'slow_down'}}}),
      response(true, 200, {data: {access_token: 'tok_live', token: {id: 't1', name: 'cli', prefix: 'cyi_abc'}}}),
    ]
    let call = 0
    vi.stubGlobal('fetch', vi.fn(async () => sequence[call++]))

    const slept: number[] = []
    let pendingTicks = 0

    const result = await pollDeviceToken('https://api.test', 'dc', {
      interval: 1,
      expiresIn: 600,
      onPending: () => {
        pendingTicks += 1
      },
      sleep: async (ms) => {
        slept.push(ms)
      },
    })

    expect(result.access_token).toBe('tok_live')
    expect(result.token.prefix).toBe('cyi_abc')
    // Two pending/slow_down ticks before success.
    expect(pendingTicks).toBe(2)
    // 1s, 1s, then 6s after slow_down bumped the interval by 5.
    expect(slept).toEqual([1000, 1000, 6000])
  })

  it('throws on a non-oauth error response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response(false, 400, {error: {message: 'access_denied'}})))

    await expect(
      pollDeviceToken('https://api.test', 'dc', {interval: 0, expiresIn: 600, sleep: async () => {}}),
    ).rejects.toThrow(/access_denied/)
  })

  it('throws (without polling) once the device_code has expired', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    // A past deadline (expiresIn < 0) trips the expiry guard on the first iteration, before any poll.
    await expect(
      pollDeviceToken('https://api.test', 'dc', {interval: 5, expiresIn: -1, sleep: async () => {}}),
    ).rejects.toThrow(/expired/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  describe('transient failures while waiting (CYCL-93)', () => {
    const pending = () =>
      response(false, 400, {error: {message: 'pending', details: {oauth_error: 'authorization_pending'}}})
    const granted = () =>
      response(true, 200, {data: {access_token: 'tok_live', token: {id: 't1', name: 'cli', prefix: 'cyi_abc'}}})
    const unreadable = (status: number) => ({ok: status < 400, status, statusText: '', text: async () => '<html>Bad gateway</html>'})

    // A fake clock drives the real waits, the real 30 second ceiling and Date.now: the poll runs as
    // in production, without waiting for any of it.
    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(0)
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    /** Run the poll to its end on the fake clock; the outcome is the token or the error. */
    async function settle<T>(polling: Promise<T>): Promise<T | Error> {
      const outcome = polling.catch((err: Error) => err)
      await vi.runAllTimersAsync()
      return outcome
    }

    /** The fake time of every poll request, to see how long the poll waited before each one. */
    function stubFetch(answer: (call: number, init: RequestInit) => unknown) {
      const at: number[] = []
      const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
        at.push(Date.now())
        return answer(at.length, init)
      })
      vi.stubGlobal('fetch', fetchMock)
      return {fetchMock, at}
    }

    it('asks again after a network failure, a 5xx, a 429 and an unreadable answer, then logs in', async () => {
      const sequence: Array<() => unknown> = [
        () => {
          throw new TypeError('fetch failed')
        },
        () => response(false, 503, {error: {message: 'Service unavailable'}}),
        () => response(false, 429, {error: {message: 'Too many requests'}}),
        () => unreadable(502),
        () => unreadable(200),
        pending,
        granted,
      ]
      const {fetchMock, at} = stubFetch((call) => sequence[call - 1]())
      let ticks = 0

      const result = await settle(
        pollDeviceToken('https://api.test', 'dc', {
          interval: 2,
          expiresIn: 600,
          onPending: () => {
            ticks += 1
          },
        }),
      )

      expect((result as {access_token: string}).access_token).toBe('tok_live')
      expect(fetchMock).toHaveBeenCalledTimes(7)
      expect(ticks).toBe(6)
      // Every retry waits the interval: no burst against a server that is already struggling.
      expect(at).toEqual([2000, 4000, 6000, 8000, 10_000, 12_000, 14_000])
    })

    it('keeps the slow_down interval after a transient failure', async () => {
      const sequence: Array<() => unknown> = [
        () => response(false, 400, {error: {message: 'slow down', details: {oauth_error: 'slow_down'}}}),
        () => response(false, 503, {error: {message: 'Service unavailable'}}),
        granted,
      ]
      const {at} = stubFetch((call) => sequence[call - 1]())

      await settle(pollDeviceToken('https://api.test', 'dc', {interval: 1, expiresIn: 600}))

      expect(at).toEqual([1000, 7000, 13_000])
    })

    it('asks again after a poll the server never answers', async () => {
      const {fetchMock} = stubFetch((call, init) => {
        if (call > 1) return granted()
        return new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(init.signal?.reason), {once: true})
        })
      })

      const polling = pollDeviceToken('https://api.test', 'dc', {interval: 1, expiresIn: 600})
      await vi.advanceTimersByTimeAsync(1000 + 29_999)
      expect(fetchMock).toHaveBeenCalledOnce()
      await vi.advanceTimersByTimeAsync(1)

      const result = await settle(polling)
      expect((result as {access_token: string}).access_token).toBe('tok_live')
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('stops at once on an explicit refusal', async () => {
      const {fetchMock} = stubFetch(() =>
        response(false, 400, {error: {message: 'Access denied', details: {oauth_error: 'access_denied'}}}),
      )

      const error = await settle(pollDeviceToken('https://api.test', 'dc', {interval: 1, expiresIn: 600}))
      expect((error as Error).message).toBe('Access denied')
      expect(fetchMock).toHaveBeenCalledOnce()
    })

    it('stops at once on a server error that names an oauth error', async () => {
      const {fetchMock} = stubFetch(() =>
        response(false, 500, {error: {message: 'Code expired', details: {oauth_error: 'expired_token'}}}),
      )

      const error = await settle(pollDeviceToken('https://api.test', 'dc', {interval: 1, expiresIn: 600}))
      expect((error as Error).message).toBe('Code expired')
      expect(fetchMock).toHaveBeenCalledOnce()
    })

    it('stops at once on a readable 4xx without an oauth error', async () => {
      const {fetchMock} = stubFetch(() => response(false, 403, {error: {message: 'Forbidden'}}))

      const error = await settle(pollDeviceToken('https://api.test', 'dc', {interval: 1, expiresIn: 600}))
      expect((error as Error).message).toBe('Forbidden')
      expect(fetchMock).toHaveBeenCalledOnce()
    })

    it('gives up when the code expires while the server keeps failing, and says why', async () => {
      stubFetch(() => response(false, 503, {error: {message: 'Service unavailable'}}))

      const error = await settle(pollDeviceToken('https://api.test', 'dc', {interval: 5, expiresIn: 30}))
      expect((error as Error).message).toMatch(
        /expired\. Run "closeyourit login" again\. Last error: Service unavailable/,
      )
      expect(Date.now()).toBeGreaterThan(30_000)
      expect(Date.now()).toBeLessThanOrEqual(35_000)
    })

    it('gives up when the code expires while every poll hangs to the ceiling', async () => {
      // Each wait is the interval plus a whole 30 second ceiling: the expiry still ends the login.
      stubFetch(
        (_call, init) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => reject(init.signal?.reason), {once: true})
          }),
      )

      const error = await settle(pollDeviceToken('https://api.test', 'dc', {interval: 5, expiresIn: 60}))
      expect((error as Error).message).toMatch(/expired\. .*did not respond within 30 seconds/)
      expect(Date.now()).toBeGreaterThan(60_000)
      expect(Date.now()).toBeLessThanOrEqual(60_000 + 5000 + 30_000)
    })

    it('sends no poll once the wait has run past the code lifetime', async () => {
      const {at} = stubFetch(() => pending())

      const error = await settle(pollDeviceToken('https://api.test', 'dc', {interval: 7, expiresIn: 10}))
      expect((error as Error).message).toMatch(/expired/)
      // 7s is within the lifetime; the next wait ends at 14s, past it, and nothing more goes out.
      expect(at).toEqual([7000])
      expect(Date.now()).toBe(14_000)
    })

    it('ends the wait after the 10 minute fallback when the code has no lifetime', async () => {
      stubFetch(() => pending())

      const error = await settle(pollDeviceToken('https://api.test', 'dc', {interval: 5, expiresIn: Number.NaN}))
      expect((error as Error).message).toMatch(/expired/)
      expect(Date.now()).toBeGreaterThan(600_000)
      expect(Date.now()).toBeLessThanOrEqual(605_000)
    })
  })

  it('startDeviceFlow stops when the server never answers', async () => {
    // A fake clock drives the real 30 second ceiling, without waiting for it.
    vi.useFakeTimers()
    try {
      vi.stubGlobal(
        'fetch',
        vi.fn(
          (_url: string, init: RequestInit) =>
            new Promise((_resolve, reject) => {
              init.signal?.addEventListener('abort', () => reject(init.signal?.reason), {once: true})
            }),
        ),
      )

      const started = startDeviceFlow('https://api.test', 'cli/1 (test)').catch((err: unknown) => err)
      await vi.advanceTimersByTimeAsync(29_999)
      expect(vi.getTimerCount()).toBe(1)
      await vi.advanceTimersByTimeAsync(1)
      expect(((await started) as Error).message).toMatch(
        /Device authorization failed: .*the server did not respond within 30 seconds/,
      )
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })
})
