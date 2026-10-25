import {afterEach, describe, expect, it, vi} from 'vitest'
import {pollDeviceToken, startDeviceFlow} from '../src/lib/device-flow'

afterEach(() => {
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
})
