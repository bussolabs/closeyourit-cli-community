// OAuth 2.0 Device Authorization Grant against the CloseYourIt /cli backend.

import {deadline, DEVICE_CODE_FALLBACK_SECONDS, failureReason, REQUEST_TIMEOUT_MS} from './timeouts'

export interface DeviceAuthorization {
  device_code: string
  user_code: string
  verification_uri: string
  verification_uri_complete: string
  interval: number
  expires_in: number
}

export interface DeviceTokenResult {
  access_token: string
  token: {id: string; name: string; prefix: string}
}

export interface PollOptions {
  /** Seconds between polls (from the authorize response). */
  interval: number
  /** Lifetime of the device_code in seconds; not a number → DEVICE_CODE_FALLBACK_SECONDS. */
  expiresIn: number
  /** Called on each authorization_pending / slow_down tick, and on each transient failure retried. */
  onPending?: () => void
  /** Injectable for tests; defaults to setTimeout-based sleep. */
  sleep?: (ms: number) => Promise<void>
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

interface PostResult {
  ok: boolean
  status: number
  json: any
  /** False when the body was there but was not JSON: an answer nobody can read. */
  readable: boolean
}

/** A request that got no answer at all: unreachable server, dropped connection, time ceiling. */
class DeviceRequestError extends Error {}

async function postJson(url: string, body: unknown): Promise<PostResult> {
  // The same ceiling as every other call (CYCL-93): a connection that never answers must not hang
  // the login. It covers the body as well, which streams under the same signal.
  const limit = deadline(REQUEST_TIMEOUT_MS)
  let status = 0
  let ok = false
  let text: string
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {Accept: 'application/json', 'Content-Type': 'application/json'},
      body: JSON.stringify(body),
      signal: limit.signal,
    })
    status = res.status
    ok = res.ok
    text = await res.text()
  } catch (err) {
    throw new DeviceRequestError(`Request to ${url} failed: ${failureReason(err, limit)}`)
  } finally {
    limit.release()
  }
  let json: any = {}
  let readable = true
  if (text.length > 0) {
    try {
      json = JSON.parse(text)
    } catch {
      json = {}
      readable = false
    }
  }
  return {ok, status, json, readable}
}

function base(apiUrl: string): string {
  return apiUrl.replace(/\/+$/, '')
}

/**
 * A failed poll worth asking again: nothing came back, the server is overloaded or failing, or
 * its answer cannot be read. A readable refusal (access denied, expired code, any other 4xx) is
 * the server's last word and ends the login, as before (CYCL-93).
 */
function isTransient(result: PostResult): boolean {
  return result.status === 429 || result.status >= 500 || !result.readable
}

export async function startDeviceFlow(apiUrl: string, clientName: string): Promise<DeviceAuthorization> {
  let result: PostResult
  try {
    result = await postJson(`${base(apiUrl)}/cli/device/authorize`, {client_name: clientName})
  } catch (err) {
    throw new Error(`Device authorization failed: ${(err as Error).message}`)
  }
  const {ok, status, json} = result
  if (!ok) {
    throw new Error(json?.error?.message ?? `Device authorization failed (${status})`)
  }
  return json.data as DeviceAuthorization
}

export async function pollDeviceToken(
  apiUrl: string,
  deviceCode: string,
  opts: PollOptions,
): Promise<DeviceTokenResult> {
  const sleep = opts.sleep ?? defaultSleep
  let interval = opts.interval > 0 ? opts.interval : 5
  const expiresIn = Number.isFinite(opts.expiresIn) ? opts.expiresIn : DEVICE_CODE_FALLBACK_SECONDS
  const deadlineAt = Date.now() + expiresIn * 1000
  // The last transient failure, so an expiry reached while the server kept failing says why.
  let lastFailure: string | undefined

  const failIfExpired = () => {
    if (Date.now() > deadlineAt) {
      const cause = lastFailure ? ` Last error: ${lastFailure}` : ''
      throw new Error(`Device authorization expired. Run "closeyourit login" again.${cause}`)
    }
  }

  for (;;) {
    failIfExpired()
    await sleep(interval * 1000)
    // The wait (or a poll that hung to its ceiling) may have run past the code's lifetime: a poll
    // sent now could only be refused.
    failIfExpired()

    let result: PostResult
    try {
      result = await postJson(`${base(apiUrl)}/cli/device/token`, {device_code: deviceCode})
    } catch (err) {
      // Network down, connection dropped, ceiling reached: the code is still valid, ask again.
      lastFailure = (err as Error).message
      opts.onPending?.()
      continue
    }

    const {ok, status, json} = result
    if (ok && result.readable) {
      return json.data as DeviceTokenResult
    }

    const oauthError: string | undefined = json?.error?.details?.oauth_error
    if (oauthError === 'authorization_pending') {
      opts.onPending?.()
      continue
    }
    if (oauthError === 'slow_down') {
      interval += 5
      opts.onPending?.()
      continue
    }
    if (oauthError === undefined && isTransient(result)) {
      lastFailure = json?.error?.message ?? (result.readable ? `Request failed (${status})` : `Unreadable response (${status})`)
      opts.onPending?.()
      continue
    }

    throw new Error(json?.error?.message ?? 'Device authorization failed')
  }
}
