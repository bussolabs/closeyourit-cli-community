import {setTimeout as delay} from 'node:timers/promises'
import {ApiRequestError} from './api'
import {ErrorCodes} from '../errors/error-codes'

/**
 * Wait for something the server is preparing elsewhere, asking again every so often (CYCL-43).
 *
 * Both AI flows the CLI exposes answer later than they reply: `assistant ask` gets a message that
 * is still being written, `tickets ask` an AI request that is still pending. The waiting is the
 * same in both, and it is the part that goes wrong in interesting ways — so it lives here once.
 *
 * Two guarantees the callers depend on: the pause grows between attempts (a slow answer must not
 * turn into hundreds of requests) and the wait always ends (`timeoutMs`), because a command that
 * hangs forever on a terminal is worse than one that gives up and says where the answer will be.
 *
 * `timeoutMs` bounds the pauses and the number of attempts, not a single request: one `fetch` that
 * never returns still hangs, because `CliApi` sends without an abort signal — a gap that belongs to
 * the HTTP layer and would have to be closed there, for every command at once.
 */
export interface PollOptions<T> {
  /** What the caller already holds (the POST response): already settled → no request at all. */
  initial?: T
  /** Hard ceiling on the whole wait. */
  timeoutMs: number
  /** First pause; each following one is `factor` times longer, capped at `maxDelayMs`. */
  firstDelayMs?: number
  maxDelayMs?: number
  factor?: number
  /** Body of the timeout error: says how to get the answer that is still coming. */
  timeoutMessage: string
  /** Injectable for tests; default sleeps for real. */
  sleep?: (ms: number) => Promise<void>
  /** Injectable for tests; default is the wall clock. */
  now?: () => number
}

const FIRST_DELAY_MS = 1000
const MAX_DELAY_MS = 5000
const FACTOR = 1.5

/**
 * Default `--timeout` of the commands that wait for an AI answer. Three minutes is long enough for
 * an assistant that reads several things before replying, and short enough that a terminal left
 * open never looks frozen.
 */
export const DEFAULT_TIMEOUT_SECONDS = 180

/**
 * Ask `fetch` again until `settled` says the value is final, then return it.
 *
 * Throws an `ApiRequestError` (status 408, `C408-ASK-001`) carrying `timeoutMessage` when the
 * budget runs out — the shape `BaseCommand.catch` already prints as `code: message` on stderr and
 * as an `{error:{code,message}}` envelope in `--json`, so a script can tell "still working" from
 * "the server refused".
 */
export async function pollUntil<T>(
  fetch: () => Promise<T>,
  settled: (value: T) => boolean,
  opts: PollOptions<T>,
): Promise<T> {
  if (opts.initial !== undefined && settled(opts.initial)) return opts.initial

  const now = opts.now ?? Date.now
  const sleep = opts.sleep ?? ((ms: number) => delay(ms))
  const maxDelay = opts.maxDelayMs ?? MAX_DELAY_MS
  const factor = opts.factor ?? FACTOR
  const deadline = now() + opts.timeoutMs
  let wait = Math.min(opts.firstDelayMs ?? FIRST_DELAY_MS, maxDelay)

  for (;;) {
    const remaining = deadline - now()
    if (remaining <= 0) {
      throw new ApiRequestError(408, ErrorCodes.Ask.timeout, opts.timeoutMessage)
    }

    // Never sleep past the deadline: the last attempt lands exactly on it, so the full budget is
    // used instead of being cut short by a pause that would have overshot it.
    // eslint-disable-next-line no-await-in-loop
    await sleep(Math.min(wait, remaining))
    // eslint-disable-next-line no-await-in-loop
    const value = await fetch()
    if (settled(value)) return value

    wait = Math.min(Math.round(wait * factor), maxDelay)
  }
}

/**
 * Message for a `--timeout` that cannot wait for anything, or undefined when it is usable.
 * Same shape as `paginationError`: the command line is refused before any call goes out.
 */
export function timeoutError(seconds: number): string | undefined {
  if (seconds < 1) return `Invalid --timeout ${seconds}: wait at least 1 second.`
  return undefined
}
