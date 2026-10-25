import {Errors} from '@oclif/core'

/** oclif dims parts of a parse error with ANSI when the terminal has colors; machine output must not. */
const ANSI = /\x1B\[[\d;]*m/g
/** Every parse error ends with this hint, and multi-reason ones open with a header line. */
const HELP_HINT = 'See more help with --help'
const HEADER = /^The following errors? occurred:$/

/**
 * True for the failures oclif has already worded for whoever typed the command: a parse/validation
 * error (missing required flag or arg, nonexistent flag, value outside the allowed options) and the
 * `this.error(...)` guards inside a command (`--confirm` missing, nothing to update, file unreadable).
 *
 * Deliberately NOT input errors, although both extend `CLIError`:
 *  - `ExitError`, thrown by `this.exit(code)` — `cyi run` uses it to propagate the child exit code;
 *  - `ModuleLoadError`, which is a real internal failure and keeps the generic system code.
 */
export function isInputError(error: unknown): error is Error {
  if (!(error instanceof Errors.CLIError)) return false
  return !(error instanceof Errors.ExitError) && !(error instanceof Errors.ModuleLoadError)
}

/**
 * Flatten oclif's multi-line, ANSI-decorated message into the single line a JSON consumer reads:
 * `The following error occurred:\n  Missing required flag project\nSee more help with --help`
 * becomes `Missing required flag project` (CYCL-33).
 */
export function inputErrorMessage(error: Error): string {
  const plain = error.message.replace(ANSI, '')
  const lines = plain
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && line !== HELP_HINT && !HEADER.test(line))

  // Only noise (a bare hint, or an empty message): keep whatever the error carried rather than nothing.
  if (lines.length === 0) return plain.trim()

  // A line ending in `:` introduces the next one ("Missing 1 required arg:" + the arg itself);
  // anything else is a reason of its own ("Missing required flag environment" + "…flag project").
  return lines.reduce((acc, line) => (acc.endsWith(':') ? `${acc} ${line}` : `${acc}; ${line}`))
}
