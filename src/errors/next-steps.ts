import {ErrorCodes} from './error-codes'
import {CONFIRMATION_REQUIRED_CODE} from './exit-codes'

/** The command that failed: its oclif id (`tickets:delete`) and the arguments it was given. */
export interface CommandContext {
  command: string
  argv: string[]
}

/** Commands to try after a frequent error, by code. One list, so every command suggests the same. */
const BY_CODE: Record<string, string[]> = {
  [ErrorCodes.Auth.notLoggedIn]: ['cyi login'],
  [ErrorCodes.Project.notFound]: ['cyi projects list'],
  [ErrorCodes.Role.notFound]: ['cyi roles list'],
  [ErrorCodes.Group.notFound]: ['cyi groups list'],
  [ErrorCodes.Team.notFound]: ['cyi teams list'],
  [ErrorCodes.Member.notFound]: ['cyi members list'],
  [ErrorCodes.Ticket.notFound]: ['cyi tickets list --project <id|key>'],
}

/** Characters a POSIX shell leaves alone; anything else gets single quotes. */
const SHELL_SAFE = /^[\w@%+=:,./-]+$/

function shellQuote(arg: string): string {
  return SHELL_SAFE.test(arg) ? arg : `'${arg.replaceAll("'", String.raw`'\''`)}'`
}

/** A positional `NAME=value` is how `secrets set`, `personal set` and `shared set` take a secret. */
const ASSIGNMENT = /^([^-=][^=]*)=.+$/

/** The value of an assignment never goes back on screen: a repeated command may end up in a CI log. */
function maskSecret(arg: string): string {
  const match = ASSIGNMENT.exec(arg)
  return match ? `${match[1]}=<value>` : arg
}

function commandLine(ctx: CommandContext, extra: string[]): string {
  const args = [...ctx.argv.map((arg) => maskSecret(arg)), ...extra]
  return ['cyi', ...ctx.command.split(':'), ...args.map((arg) => shellQuote(arg))].join(' ')
}

/**
 * The commands to try after an error (CYCL-82). The server's own suggestions win and arrive unchanged,
 * so it can improve them without a CLI release. Without a command context (the MCP server) only the
 * suggestions that do not repeat the command are given.
 */
export function nextStepsFor(
  error: {status: number; code: string; nextSteps?: string[]},
  ctx?: CommandContext,
): string[] {
  if (error.nextSteps && error.nextSteps.length > 0) return error.nextSteps

  const known = BY_CODE[error.code]
  if (known) return known
  if (error.status === 401) return ['cyi login']
  if (!ctx) return []
  if (error.code === CONFIRMATION_REQUIRED_CODE) return [commandLine(ctx, ['--yes'])]
  if (error.code === ErrorCodes.Input.invalid) return [commandLine({...ctx, argv: []}, ['--help'])]
  return []
}
