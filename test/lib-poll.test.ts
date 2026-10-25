// CYCL-43 — the shared wait for an answer the server prepares elsewhere.
//
// Two commands use it (the question to the assistant and "ask the tickets") and neither of them may
// hang: the deadline exists, it is honoured, and when it fires it says how to retrieve the answer
// left behind instead of a generic "timeout".

import {describe, expect, it, vi} from 'vitest'
import {ApiRequestError} from '../src/lib/api'
import {pollUntil, timeoutError} from '../src/lib/poll'

/** Fake clock: it advances only as much as the polling sleeps, so the tests do not really wait. */
function clock() {
  let now = 0
  const slept: number[] = []
  return {
    now: () => now,
    slept,
    sleep: async (ms: number) => {
      slept.push(ms)
      now += ms
    },
  }
}

describe('pollUntil', () => {
  it('does not query the server if the starting value is already final', async () => {
    const {now, sleep, slept} = clock()
    const fetch = vi.fn()

    const result = await pollUntil(fetch, (value: {status: string}) => value.status === 'done', {
      initial: {status: 'done'},
      timeoutMs: 10_000,
      timeoutMessage: 'scaduta',
      now,
      sleep,
    })

    expect(result).toEqual({status: 'done'})
    expect(fetch).not.toHaveBeenCalled()
    expect(slept).toEqual([])
  })

  it('polls until the answer is ready and returns the last value', async () => {
    const {now, sleep} = clock()
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({status: 'pending'})
      .mockResolvedValueOnce({status: 'done', answer: 'ecco'})

    const result = await pollUntil(fetch, (value: {status: string}) => value.status !== 'pending', {
      initial: {status: 'pending'},
      timeoutMs: 60_000,
      timeoutMessage: 'scaduta',
      now,
      sleep,
    })

    expect(result).toEqual({status: 'done', answer: 'ecco'})
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('lengthens the wait on every round up to the cap, instead of hammering the server', async () => {
    const {now, sleep, slept} = clock()
    const fetch = vi.fn().mockResolvedValue({status: 'pending'})

    await expect(
      pollUntil(fetch, (value: {status: string}) => value.status !== 'pending', {
        timeoutMs: 60_000,
        firstDelayMs: 1000,
        factor: 2,
        maxDelayMs: 4000,
        timeoutMessage: 'scaduta',
        now,
        sleep,
      }),
    ).rejects.toBeInstanceOf(ApiRequestError)

    // 1s, 2s, 4s and then always 4s: it grows, but not beyond the cap.
    expect(slept.slice(0, 5)).toEqual([1000, 2000, 4000, 4000, 4000])
  })

  it('times out saying how to retrieve the answer, without waiting forever', async () => {
    const {now, sleep} = clock()
    const fetch = vi.fn().mockResolvedValue({status: 'pending'})

    const error = await pollUntil(fetch, (value: {status: string}) => value.status !== 'pending', {
      timeoutMs: 3000,
      firstDelayMs: 1000,
      factor: 1,
      maxDelayMs: 1000,
      timeoutMessage: 'Leggila con "closeyourit assistant conversations show c-1".',
      now,
      sleep,
    }).then(
      () => undefined,
      (err: unknown) => err as ApiRequestError,
    )

    expect(error).toBeInstanceOf(ApiRequestError)
    expect(error?.status).toBe(408)
    expect(error?.code).toBe('C408-ASK-001')
    expect(error?.message).toContain('assistant conversations show c-1')
    expect(fetch).toHaveBeenCalledTimes(3)
  })

  it('the last attempt falls on the deadline, not beyond', async () => {
    const {now, sleep, slept} = clock()
    const fetch = vi.fn().mockResolvedValue({status: 'pending'})

    await pollUntil(fetch, (value: {status: string}) => value.status !== 'pending', {
      timeoutMs: 2500,
      firstDelayMs: 2000,
      factor: 2,
      maxDelayMs: 8000,
      timeoutMessage: 'scaduta',
      now,
      sleep,
    }).catch(() => undefined)

    expect(slept).toEqual([2000, 500])
  })

  it('with the default values it really waits between rounds', async () => {
    const fetch = vi.fn().mockResolvedValue({status: 'done'})
    const start = Date.now()

    const result = await pollUntil(fetch, (value: {status: string}) => value.status === 'done', {
      timeoutMs: 5000,
      firstDelayMs: 5,
      timeoutMessage: 'scaduta',
    })

    expect(result).toEqual({status: 'done'})
    expect(Date.now() - start).toBeGreaterThanOrEqual(4)
  })
})

describe('timeoutError', () => {
  it('accepts a wait of at least one second', () => {
    expect(timeoutError(1)).toBeUndefined()
    expect(timeoutError(600)).toBeUndefined()
  })

  it('rejects zero and negatives explaining the minimum', () => {
    expect(timeoutError(0)).toContain('at least 1 second')
    expect(timeoutError(-30)).toContain('-30')
  })
})
