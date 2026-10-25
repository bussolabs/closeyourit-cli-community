import {vi} from 'vitest'

/**
 * Singleton fake returned by the mocked `CliApi` constructor. Command tests drive
 * the HTTP layer through these spies — every method is reset to a fresh `vi.fn()`
 * per test via `resetApiMock()` (call it in `beforeEach`). Never hits the network.
 */
export const apiMock = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
  upload: vi.fn(),
  download: vi.fn(),
  /** What the real `CliApi` saves from the last envelope; `BaseCommand.finally` reads it for the
   * pagination footer. Set it in a test to exercise that hint; `resetApiMock()` clears it. */
  lastMeta: undefined as Record<string, unknown> | undefined,
  /** The abort signal the real `CliApi` puts on every request it sends (CYCL-56): the MCP server
   * sets it on the client, so a test can read it to check what happens when it fires. */
  signal: undefined as AbortSignal | undefined,
}

const METHODS = ['get', 'post', 'put', 'patch', 'delete', 'upload', 'download'] as const

export function resetApiMock(): void {
  for (const method of METHODS) apiMock[method] = vi.fn()
  apiMock.lastMeta = undefined
  apiMock.signal = undefined
}
