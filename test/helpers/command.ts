import {Config} from '@oclif/core'
import {fileURLToPath} from 'node:url'
import {expect, vi} from 'vitest'
import {ApiRequestError} from '../../src/lib/api'
import type {Envelope} from '../../src/lib/api'

const root = fileURLToPath(new URL('../..', import.meta.url))

/** Canonical UUIDs for args/flags — passing a UUID makes the base `resolve*` helpers
 * short-circuit (no extra lookup call), so tests control exactly how many api calls happen. */
export const PID = '11111111-1111-4111-8111-111111111111' // project
export const RID = '22222222-2222-4222-8222-222222222222' // role
export const GID = '33333333-3333-4333-8333-333333333333' // group
export const TID = '44444444-4444-4444-8444-444444444444' // team
export const MID = '55555555-5555-4555-8555-555555555555' // member / misc

let cached: Config | undefined

/** Load the real oclif Config once (reads package.json + dist/commands). Cached across tests. */
export async function testConfig(): Promise<Config> {
  cached ??= await Config.load(root)
  return cached
}

/** Success envelope helper: `envelope(data)` or `envelope(data, meta)`. */
export function envelope<T>(data: T, meta?: Record<string, unknown>): Envelope<T> {
  return meta ? {data, meta} : {data}
}

/** Build the ApiRequestError a command would receive from the mocked api layer. */
export function apiError(status: number, code: string, message = 'boom', details?: unknown): ApiRequestError {
  return new ApiRequestError(status, code, message, details)
}

export interface Captured {
  stdout: () => string
  stderr: () => string
  restore: () => void
}

/** Capture stdout/stderr while a command runs. oclif routes `log`/`logToStderr` through
 * `console.log`/`console.error` (via `ux.stdout`/`ux.stderr`), so we spy on those. */
export function capture(): Captured {
  const out: string[] = []
  const err: string[] = []
  const line = (args: unknown[]): string => args.map((a) => String(a)).join(' ')
  const outSpy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    out.push(line(args))
  })
  const errSpy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    err.push(line(args))
  })
  return {
    stdout: () => out.join('\n'),
    stderr: () => err.join('\n'),
    restore() {
      outSpy.mockRestore()
      errSpy.mockRestore()
    },
  }
}

type Runnable = {run(argv: string[], config: Config): Promise<unknown>}

/** Run a command class with argv against the shared Config; returns its resolved value. */
export async function run(command: Runnable, argv: string[] = []): Promise<unknown> {
  const config = await testConfig()
  return command.run(argv, config)
}

/** Run a command with stdout/stderr captured. Returns the resolved value + captured stdout. */
export async function runCaptured(
  command: Runnable,
  argv: string[] = [],
): Promise<{result: unknown; stdout: string}> {
  const cap = capture()
  try {
    const result = await run(command, argv)
    return {result, stdout: cap.stdout()}
  } finally {
    cap.restore()
  }
}

/**
 * Run a command expecting it to exit non-zero and assert its exit code.
 *
 * Two failure shapes reach here:
 *  - `ApiRequestError` → `base.catch` prints `code: message` to stderr, then `exit(1)`.
 *  - `this.error(msg, {exit})` (e.g. the `--confirm` guards) → oclif throws a CLIError with
 *    that exit code; the message lives on the error (`.message`), not on stderr in-process.
 * The returned `message` merges both so callers can assert on the text either way.
 */
export async function runExpectingExit(
  command: Runnable,
  argv: string[],
  expectedExit = 1,
): Promise<{error: unknown; message: string; stderr: string; stdout: string}> {
  const cap = capture()
  try {
    const error = await run(command, argv).then(
      () => {
        throw new Error('expected the command to exit non-zero, but it resolved')
      },
      (err: unknown) => err,
    )
    expect((error as {oclif?: {exit?: number}}).oclif?.exit).toBe(expectedExit)
    const stderr = cap.stderr()
    return {error, message: `${stderr}\n${(error as Error)?.message ?? ''}`, stderr, stdout: cap.stdout()}
  } finally {
    cap.restore()
  }
}
