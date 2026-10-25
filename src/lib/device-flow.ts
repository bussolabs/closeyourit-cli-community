// OAuth 2.0 Device Authorization Grant against the CloseYourIt /cli backend.

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
  /** Lifetime of the device_code in seconds. */
  expiresIn: number
  /** Called on each authorization_pending / slow_down tick. */
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
}

async function postJson(url: string, body: unknown): Promise<PostResult> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {Accept: 'application/json', 'Content-Type': 'application/json'},
    body: JSON.stringify(body),
  })
  const text = await res.text()
  let json: any = {}
  if (text.length > 0) {
    try {
      json = JSON.parse(text)
    } catch {
      json = {}
    }
  }
  return {ok: res.ok, status: res.status, json}
}

function base(apiUrl: string): string {
  return apiUrl.replace(/\/+$/, '')
}

export async function startDeviceFlow(apiUrl: string, clientName: string): Promise<DeviceAuthorization> {
  const {ok, status, json} = await postJson(`${base(apiUrl)}/cli/device/authorize`, {client_name: clientName})
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
  const deadline = Date.now() + opts.expiresIn * 1000

  for (;;) {
    if (Date.now() > deadline) {
      throw new Error('Device authorization expired. Run "closeyourit login" again.')
    }

    await sleep(interval * 1000)

    const {ok, json} = await postJson(`${base(apiUrl)}/cli/device/token`, {device_code: deviceCode})
    if (ok) {
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

    throw new Error(json?.error?.message ?? 'Device authorization failed')
  }
}
