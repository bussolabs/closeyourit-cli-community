import type {CliConfig} from './config'
import {ErrorCodes} from '../errors/error-codes'

/** Error carrying the HTTP status and the structured code from the backend envelope (R/G prefix) or a local C-prefix fallback. */
export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message)
    this.name = 'ApiRequestError'
  }
}

export interface RequestOptions {
  body?: unknown
  /** Defaults to true; set false for unauthenticated endpoints. */
  auth?: boolean
  /**
   * Abort the request when the caller cannot afford to wait (CYCL-55): `kb context` runs at the
   * start of every session, where a stalled connection would be paid on each one. Without it fetch
   * waits as long as the OS lets it. An aborted call surfaces as a network ApiRequestError, like
   * any other unreachable server.
   */
  signal?: AbortSignal
}

export interface Envelope<T = unknown> {
  data: T
  meta?: Record<string, unknown>
}

/** A single file part for a multipart upload. */
export interface UploadFile {
  /** Multipart field name (e.g. "files[]"). */
  field: string
  filename: string
  data: Blob
}

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

/** Error code the server answers when a dangerous write arrives without the confirm gesture (CYRA-728). */
export const CONFIRMATION_REQUIRED_CODE = 'R422-CONFIRM-001'

const READ_METHODS = new Set<HttpMethod>(['GET', 'HEAD', 'OPTIONS'] as HttpMethod[])

export class CliApi {
  /**
   * Meta of the most recent successful response envelope (`{page, per, total, total_pages}`, or
   * undefined for non-paginated responses). `BaseCommand.finally` reads it to print the "there are
   * more pages" footer once per command, instead of threading the envelope through all 30 list
   * commands (CYCL-11). The instance is per-command, so this is that command's last response.
   */
  lastMeta?: Record<string, unknown>

  /**
   * The user confirmed dangerous actions (`--yes`, CYCL-53). The server (CYRA-728) refuses any
   * write through a `dangerous` permission key without the `confirm` parameter and answers
   * `R422-CONFIRM-001`: not a permission problem, a missing gesture. `BaseCommand.parse` sets it;
   * `request()` then adds `confirm=1` to every writing call — in the query string, so DELETE
   * without a body is covered too. Reads never carry it: looking is not executing.
   */
  confirm = false

  /**
   * Aborts every request that starts from this client, when it is time to shut down (CYCL-56).
   *
   * It lives on the instance for the same reason as `confirm`: the MCP server must be able to drop
   * ALL the calls in flight — the tools' ones and those of the by-name lookups they carry along —
   * without threading a parameter through every signature in between. A `signal` passed to a
   * single request (`RequestOptions`) stays more specific and wins over this one.
   */
  signal?: AbortSignal

  constructor(private readonly config: CliConfig) {}

  async request<T = unknown>(method: HttpMethod, path: string, opts: RequestOptions = {}): Promise<Envelope<T>> {
    const headers = this.authHeaders(opts.auth !== false)
    headers['Content-Type'] = 'application/json'

    const url = this.resolveUrl(this.withConfirmation(method, path))

    let res: Response
    try {
      res = await fetch(url, {
        method,
        headers,
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
        signal: opts.signal ?? this.signal,
      })
    } catch (err) {
      throw new ApiRequestError(0, ErrorCodes.Network.requestFailed, `Request to ${url} failed: ${(err as Error).message}`)
    }

    return this.handleResponse<T>(res)
  }

  /**
   * Upload one or more files as multipart/form-data.
   * The boundary Content-Type is derived by fetch from the FormData body — never set it by hand.
   */
  async upload<T = unknown>(
    method: 'POST' | 'PUT',
    path: string,
    files: UploadFile[],
    opts: RequestOptions = {},
  ): Promise<Envelope<T>> {
    const headers = this.authHeaders(opts.auth !== false)

    const form = new FormData()
    for (const file of files) form.append(file.field, file.data, file.filename)
    if (opts.body && typeof opts.body === 'object') {
      for (const [key, value] of Object.entries(opts.body as Record<string, unknown>)) {
        if (value !== undefined && value !== null) form.append(key, String(value))
      }
    }

    const url = this.resolveUrl(path)

    let res: Response
    try {
      res = await fetch(url, {method, headers, body: form})
    } catch (err) {
      throw new ApiRequestError(0, ErrorCodes.Network.requestFailed, `Request to ${url} failed: ${(err as Error).message}`)
    }

    return this.handleResponse<T>(res)
  }

  /** Add `confirm=1` to a writing request when the user passed `--yes`; reads are left alone. */
  private withConfirmation(method: HttpMethod, path: string): string {
    if (!this.confirm || READ_METHODS.has(method)) return path
    return `${path}${path.includes('?') ? '&' : '?'}confirm=1`
  }

  private resolveUrl(path: string): string {
    return this.config.apiUrl.replace(/\/+$/, '') + path
  }

  /** Build the shared Accept + Authorization headers; throws (before any fetch) if an authed call has no token. */
  private authHeaders(auth: boolean): Record<string, string> {
    const headers: Record<string, string> = {Accept: 'application/json'}
    if (auth) {
      if (!this.config.token) {
        throw new ApiRequestError(401, ErrorCodes.Auth.notLoggedIn, 'Not logged in. Run "closeyourit login".')
      }
      headers.Authorization = `Bearer ${this.config.token}`
    }
    return headers
  }

  /** Parse the response body and map the error envelope to an ApiRequestError. Shared by request() and upload(). */
  private async handleResponse<T>(res: Response): Promise<Envelope<T>> {
    // The body can fail after the headers arrived: an abort that fires mid-read (RequestOptions.signal),
    // a connection that drops. That is the same network failure as one on the first byte, so it must
    // come out as an ApiRequestError — raw, it would escape every caller that maps failures by that
    // type, and a command counting on a quiet failure would crash instead.
    let text: string
    try {
      text = await res.text()
    } catch (err) {
      throw new ApiRequestError(
        0,
        ErrorCodes.Network.requestFailed,
        `Reading the response failed: ${(err as Error).message}`,
      )
    }

    let json: unknown = {}
    if (text.length > 0) {
      try {
        json = JSON.parse(text)
      } catch {
        if (!res.ok) {
          throw new ApiRequestError(res.status, ErrorCodes.Network.requestFailed, `Request failed (${res.status})`)
        }
        throw new ApiRequestError(res.status, ErrorCodes.Network.parseFailed, 'Failed to parse server response')
      }
    }

    if (!res.ok) {
      const envelope = (json ?? {}) as {error?: {code?: string; message?: string; details?: unknown}}
      const error = envelope.error ?? {}
      let message = error.message ?? res.statusText ?? `Request failed (${res.status})`
      // The server names the gesture it wants but not the flag that makes it: say it here, once.
      if (error.code === CONFIRMATION_REQUIRED_CODE && !message.includes('--yes')) {
        message = `${message} Re-run with --yes to confirm this dangerous action.`
      }

      throw new ApiRequestError(res.status, error.code ?? `C${res.status}-API-000`, message, error.details)
    }

    const envelope = (json ?? {}) as Envelope<T>
    this.lastMeta = envelope.meta
    return envelope
  }

  get<T = unknown>(path: string, opts?: RequestOptions): Promise<Envelope<T>> {
    return this.request<T>('GET', path, opts)
  }

  post<T = unknown>(path: string, body?: unknown, opts?: RequestOptions): Promise<Envelope<T>> {
    return this.request<T>('POST', path, {...opts, body})
  }

  put<T = unknown>(path: string, body?: unknown, opts?: RequestOptions): Promise<Envelope<T>> {
    return this.request<T>('PUT', path, {...opts, body})
  }

  /**
   * PATCH. Rails routes a resourceful `update` under both PUT and PATCH, so most commands here use
   * `put`; a custom member route declared with `patch` (error group assignment, CYCL-44) answers to
   * PATCH alone, and sending PUT to it is a plain 404.
   */
  patch<T = unknown>(path: string, body?: unknown, opts?: RequestOptions): Promise<Envelope<T>> {
    return this.request<T>('PATCH', path, {...opts, body})
  }

  delete<T = unknown>(path: string, opts?: RequestOptions): Promise<Envelope<T>> {
    return this.request<T>('DELETE', path, opts)
  }

  /**
   * Download a binary payload (e.g. a ticket attachment). The endpoint redirects to a signed
   * ActiveStorage blob URL; fetch follows the redirect (and drops the Authorization header on the
   * cross-origin hop to storage, as intended). Returns the bytes plus the filename parsed from
   * Content-Disposition when present. Error responses are JSON envelopes → mapped like every call.
   */
  async download(path: string): Promise<{contentType?: string; data: Uint8Array; filename?: string}> {
    const headers = this.authHeaders(true)
    headers.Accept = '*/*'
    const url = this.resolveUrl(path)

    let res: Response
    try {
      res = await fetch(url, {method: 'GET', headers, redirect: 'follow'})
    } catch (err) {
      throw new ApiRequestError(0, ErrorCodes.Network.requestFailed, `Request to ${url} failed: ${(err as Error).message}`)
    }

    if (!res.ok) {
      await this.handleResponse<unknown>(res) // always throws: maps the JSON error envelope
      throw new ApiRequestError(res.status, `C${res.status}-API-000`, `Download failed (${res.status})`)
    }

    // A binary payload is not a paginated collection; clear any meta a prior lookup (e.g.
    // resolveProjectId) left behind so it cannot leak into the pagination footer (CYCL-11). The
    // success path bypasses handleResponse, so this reset must be explicit.
    this.lastMeta = undefined
    const data = new Uint8Array(await res.arrayBuffer())
    const disposition = res.headers.get('content-disposition') ?? ''
    const match = /filename\*?=(?:UTF-8''|")?([^";]+)/i.exec(disposition)
    const filename = match ? decodeURIComponent(match[1].replace(/"$/, '')) : undefined
    return {contentType: res.headers.get('content-type') ?? undefined, data, filename}
  }
}
