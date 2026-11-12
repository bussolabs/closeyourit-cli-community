import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {deadline, describeDuration, deviceCodeLifetime} from '../src/lib/timeouts'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('timeouts (CYCL-93)', () => {
  it('aborts at the ceiling, and says it was the ceiling', async () => {
    const limit = deadline(30_000)
    await vi.advanceTimersByTimeAsync(29_999)
    expect(limit.signal.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(limit.signal.aborted).toBe(true)
    expect(limit.timedOut()).toBe(true)
    expect((limit.signal.reason as Error).name).toBe('TimeoutError')
  })

  it('stops with the caller first, without calling it a timeout', async () => {
    const caller = new AbortController()
    const limit = deadline(10_000, caller.signal)
    caller.abort('shutdown')
    expect(limit.signal.aborted).toBe(true)
    expect(limit.signal.reason).toBe('shutdown')
    await vi.advanceTimersByTimeAsync(10_000)
    expect(limit.timedOut()).toBe(false)
  })

  it('is born aborted when the caller already is', () => {
    const limit = deadline(10_000, AbortSignal.abort('gone'))
    expect(limit.signal.aborted).toBe(true)
    expect(limit.signal.reason).toBe('gone')
    expect(limit.timedOut()).toBe(false)
  })

  it('leaves nothing behind on a long-lived caller signal once released', async () => {
    // The MCP server's signal lives as long as the server: each call must take its listener back.
    const controller = new AbortController()
    const add = vi.spyOn(controller.signal, 'addEventListener')
    const remove = vi.spyOn(controller.signal, 'removeEventListener')
    for (let i = 0; i < 50; i += 1) deadline(30_000, controller.signal).release()
    expect(add).toHaveBeenCalledTimes(50)
    expect(remove.mock.calls.map((call) => call[1])).toEqual(add.mock.calls.map((call) => call[1]))
    expect(vi.getTimerCount()).toBe(0)

    // A released ceiling never fires afterwards.
    const limit = deadline(1000, controller.signal)
    limit.release()
    await vi.advanceTimersByTimeAsync(5000)
    expect(limit.signal.aborted).toBe(false)
  })

  it('words the ceiling for a person', () => {
    expect(describeDuration(30_000)).toBe('30 seconds')
    expect(describeDuration(300_000)).toBe('5 minutes')
    expect(describeDuration(60_000)).toBe('1 minute')
    expect(describeDuration(1000)).toBe('1 second')
    expect(describeDuration(1500)).toBe('1500 ms')
  })

  it('falls back to 10 minutes when the server gives no usable device code lifetime', () => {
    expect(deviceCodeLifetime(900)).toBe(900)
    for (const value of [undefined, null, '600', Number.NaN, Number.POSITIVE_INFINITY, 0, -5]) {
      expect(deviceCodeLifetime(value)).toBe(600)
    }
  })
})
