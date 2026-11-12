/**
 * How long a single call to the server may take before the CLI gives up on it (CYCL-93).
 *
 * Without a ceiling, `fetch` waits as long as the OS lets it: a server that accepts the connection
 * and never answers keeps a command — or a login — stuck forever. The ceiling covers the whole call,
 * headers and body alike, and it is generous on purpose: a slow but regular answer must still get
 * through. File transfers move far more bytes, so they get a wider one.
 */
export const REQUEST_TIMEOUT_MS = 30_000
export const TRANSFER_TIMEOUT_MS = 5 * 60_000

/** Lifetime assumed for a device code when the server does not say how long it lasts. */
export const DEVICE_CODE_FALLBACK_SECONDS = 10 * 60

/**
 * The device code's lifetime as the server sent it, or the fallback when it sent none we can use
 * (missing, not a number, not positive): without one the login would wait with no end.
 */
export function deviceCodeLifetime(expiresIn: unknown): number {
  return typeof expiresIn === 'number' && Number.isFinite(expiresIn) && expiresIn > 0
    ? expiresIn
    : DEVICE_CODE_FALLBACK_SECONDS
}

/**
 * The signal one call runs under: the time ceiling, plus the caller's own abort when there is one
 * (the MCP shutdown, `kb context --timeout`). Whichever fires first stops the call; the caller's is
 * kept, never replaced.
 */
export interface Deadline {
  signal: AbortSignal
  ms: number
  /** True when it was the ceiling that stopped the call, not the caller: only then is it a timeout. */
  timedOut(): boolean
  /**
   * The call is over: stop the timer and detach from the caller's signal. The MCP server's signal
   * lives as long as the server, so a listener left on it by every call would pile up for good —
   * which is why the two are combined by hand here rather than with `AbortSignal.any`.
   */
  release(): void
}

export function deadline(ms: number, caller?: AbortSignal): Deadline {
  const controller = new AbortController()
  let expired = false
  const onCallerAbort = () => controller.abort(caller?.reason)
  // A plain timer rather than `AbortSignal.timeout`, so `release` can stop it as soon as the call is over.
  const timer = setTimeout(() => {
    if (controller.signal.aborted) return
    expired = true
    const reason = new Error(`The server did not respond within ${describeDuration(ms)}`)
    reason.name = 'TimeoutError'
    controller.abort(reason)
  }, ms)
  // Like `AbortSignal.timeout`, the ceiling alone never keeps the process alive.
  timer.unref()

  const release = () => {
    clearTimeout(timer)
    caller?.removeEventListener('abort', onCallerAbort)
  }

  if (caller?.aborted) {
    controller.abort(caller.reason)
    clearTimeout(timer)
  } else {
    caller?.addEventListener('abort', onCallerAbort, {once: true})
  }

  return {signal: controller.signal, ms, timedOut: () => expired, release}
}

/** "30 seconds", "5 minutes": how the ceiling reads in an error message. */
export function describeDuration(ms: number): string {
  const plural = (n: number, unit: string): string => `${n} ${unit}${n === 1 ? '' : 's'}`
  if (ms >= 60_000 && ms % 60_000 === 0) return plural(ms / 60_000, 'minute')
  if (ms >= 1000 && ms % 1000 === 0) return plural(ms / 1000, 'second')
  return `${ms} ms`
}

/** The reason a call failed, worded as a timeout when the ceiling is what stopped it. */
export function failureReason(err: unknown, limit: Deadline): string {
  if (limit.timedOut()) return `the server did not respond within ${describeDuration(limit.ms)}`
  return (err as Error).message
}
