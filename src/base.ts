import {Command, Flags, type Interfaces} from '@oclif/core'
import type {ArgOutput, FlagOutput, Input, ParserOutput} from '@oclif/core/lib/interfaces/parser'
import {type CliConfig, loadConfig} from './lib/config'
import {ApiRequestError, CliApi} from './lib/api'
import {paginationFooter} from './lib/output'
import {ErrorCodes} from './errors/error-codes'
import {inputErrorMessage, isInputError} from './errors/input-error'
import {type TicketLookup, matchTicketLookup, ticketLookupErrorMessage} from './lib/ticket-lookup'
import {UUID_RE, fetchLookupRows, resolveNamedId, resolveProjectId} from './lib/lookup'
import {updateNotice} from './lib/update-check'

// Lookup by human-readable reference lives in `lib/lookup`: the commands use it from here and the
// MCP server uses it directly (CYCL-56). Re-exported because it is already the name the commands
// import from `base`.
export {UUID_RE} from './lib/lookup'

/** Shared `--project <id|key>` flag (required). */
export const projectFlag = {
  project: Flags.string({char: 'p', description: 'Project id (UUID) or key', required: true}),
}

/** Shared `--environment <code|id>` flag (required). The backend resolves it within the project. */
export const environmentFlag = {
  environment: Flags.string({char: 'e', description: 'Environment code (e.g. production) or id', required: true}),
}

/** Shared `--page` flag. */
export const pageFlag = {
  page: Flags.integer({description: 'Page number', default: 1}),
}

/**
 * Message for a `--page`/`--per` outside the sensible range, or undefined when both are fine.
 *
 * The backend silently clamps them (`Pagination`): `--per 0` quietly returns the default page size
 * and `--page 0` returns page 1, so a script that computed the wrong number gets plausible data
 * back instead of an error. Say it before the call, and exit 2 like any other rejected command line.
 */
export function paginationError(opts: {page?: number; per?: number}): string | undefined {
  if (opts.page !== undefined && opts.page < 1) return `Invalid --page ${opts.page}: the first page is 1.`
  if (opts.per !== undefined && opts.per < 1) return `Invalid --per ${opts.per}: ask for at least 1 row.`
  return undefined
}

/**
 * oclif's `this.exit(n)` throws an ExitError: it is recognised by the `EEXIT` code, not by the class —
 * importing the class would tie the base to an internal oclif path that changes between versions.
 */
function isExitError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as {code?: unknown}).code === 'EEXIT'
}

export abstract class BaseCommand extends Command {
  static enableJsonFlag = true

  /**
   * `--yes` on every command (CYCL-53): the server asks an explicit confirmation for writes that pass
   * through a dangerous permission key (`R422-CONFIRM-001`, CYRA-728). Which keys are dangerous is
   * the server's catalogue, not ours, so the flag is global instead of being sprinkled on the
   * commands we believe are risky today. Harmless elsewhere: the parameter is simply ignored.
   */
  static baseFlags = {
    yes: Flags.boolean({description: 'Confirm a dangerous action the server would otherwise refuse (R422-CONFIRM-001)', default: false}),
  }

  protected cfg!: CliConfig
  protected api!: CliApi

  public async init(): Promise<void> {
    await super.init()
    this.cfg = loadConfig()
    this.api = new CliApi(this.cfg)
    // stderr even in --json mode: stdout stays machine-readable, and an agent reading the output
    // still learns that its flags may be stale.
    const notice = await updateNotice(this.config.version, {cacheDir: this.config.cacheDir})
    if (notice) console.error(notice)
  }

  /** Parse as oclif does, then hand `--yes` to the api client before any request leaves. */
  protected async parse<F extends FlagOutput, B extends FlagOutput, A extends ArgOutput>(
    options?: Input<F, B, A>,
    argv?: string[],
  ): Promise<ParserOutput<F, B, A>> {
    const parsed = await super.parse<F, B, A>(options, argv)
    if (this.api) this.api.confirm = (parsed.flags as Record<string, unknown>).yes === true
    return parsed
  }

  /** Resolve a project reference (UUID passes through; otherwise matched by key, case-insensitive). */
  protected resolveProjectId(value: string): Promise<string> {
    return resolveProjectId(this.api, value)
  }

  /** Resolve a role reference (UUID passes through; otherwise matched by name, case-insensitive). */
  protected resolveRoleId(value: string): Promise<string> {
    return this.resolveByName('/cli/v1/roles', value, ErrorCodes.Role.notFound, 'Role')
  }

  /** Resolve a group reference (UUID passes through; otherwise matched by name). */
  protected resolveGroupId(value: string): Promise<string> {
    return this.resolveByName('/cli/v1/groups', value, ErrorCodes.Group.notFound, 'Group')
  }

  /** Resolve a team reference (UUID passes through; otherwise matched by name). */
  protected resolveTeamId(value: string): Promise<string> {
    return this.resolveByName('/cli/v1/teams', value, ErrorCodes.Team.notFound, 'Team')
  }

  /** Resolve a member reference (UUID account id passes through; otherwise matched by email). */
  protected async resolveMemberId(value: string): Promise<string> {
    if (UUID_RE.test(value)) return value
    const rows = await this.fetchLookupRows<{account_id: string; email?: string}>(
      '/cli/v1/members',
      'Listing the organization members needs the members.view permission — pass the account id instead of the email.',
    )
    const match = rows.find((m) => (m.email ?? '').toLowerCase() === value.toLowerCase())
    if (!match) {
      throw new ApiRequestError(404, ErrorCodes.Member.notFound, `Member not found: ${value}`)
    }

    return match.account_id
  }

  /**
   * Resolve a ticket reference: a UUID passes through, a human code ("DRFL-3", case-insensitive) is
   * looked up inside its own project — the same identifier `tickets show` prints, so linking a
   * ticket to a workload action never costs a UUID hunt first (CYCL-42).
   *
   * A reference that is neither is refused here instead of being sent: the workload endpoint drops
   * a ticket id it cannot see (anti-BOLA) and stores "no ticket" without a word, so an unusable
   * reference must fail loudly on this side.
   */
  protected async resolveTicketId(value: string): Promise<string> {
    const ref = value.trim()
    if (UUID_RE.test(ref)) return ref

    // Same shape the server accepts as a code: project key (max 4) + number.
    const match = /^([a-z\d]{1,4})-\d+$/i.exec(ref)
    if (!match) {
      throw new ApiRequestError(
        404,
        ErrorCodes.Ticket.notFound,
        `Ticket not found: ${value}. Pass a ticket id or its code (e.g. DRFL-3).`,
      )
    }

    const projectId = await this.resolveProjectId(match[1])
    const res = await this.api.get<{id?: string}>(
      `/cli/v1/projects/${encodeURIComponent(projectId)}/tickets/${encodeURIComponent(ref)}`,
    )
    const id = res.data?.id
    if (typeof id !== 'string' || id === '') {
      throw new ApiRequestError(404, ErrorCodes.Ticket.notFound, `Ticket not found: ${value}`)
    }

    return id
  }

  /**
   * Resolve a ticket status/priority reference: a UUID passes through, anything else is matched
   * against the organization lookup by code first, then by label (case-insensitive).
   *
   * `undefined` means the flag was not passed, so the lookup's own default applies (`open`,
   * `medium`): the server demands both fields on a new ticket while the help gave them as optional,
   * and getting through used to take two id hunts (`tickets statuses`, `tickets priorities`) and a
   * pair of UUIDs pasted by hand (CYCL-34).
   */
  protected async resolveTicketLookupId(lookup: TicketLookup, value?: string): Promise<string> {
    const wanted = value ?? lookup.fallback
    if (UUID_RE.test(wanted)) return wanted

    const rows = (await this.api.get<Array<Record<string, unknown>>>(lookup.path)).data
    const matches = matchTicketLookup(rows, wanted)
    if (matches.length === 1) return matches[0].id

    throw new ApiRequestError(
      404,
      lookup.errorCode,
      ticketLookupErrorMessage(lookup, wanted, rows, {matched: matches.length, isDefault: value === undefined}),
    )
  }

  /** Resolve each value of a list to an id, preserving order. */
  protected resolveAll(values: string[], resolve: (value: string) => Promise<string>): Promise<string[]> {
    return Promise.all(values.map((value) => resolve(value)))
  }

  /** Resolve an `{id, name}` reference by name (UUID passes through). */
  private resolveByName(path: string, value: string, code: string, label: string): Promise<string> {
    return resolveNamedId(this.api, path, value, code, label)
  }

  /** Every row of an organization lookup (teams, roles, groups, members) — all its pages. */
  private fetchLookupRows<T>(path: string, hint: string): Promise<T[]> {
    return fetchLookupRows<T>(this.api, path, hint)
  }

  /**
   * Surface API errors, then exit non-zero. In `--json` mode `logToStderr` is a no-op, so emit the
   * structured `{ error: { code, message } }` envelope on stdout instead — otherwise the failure is
   * swallowed (empty stdout, exit looks like a silent success) for machine consumers (CYCL-1).
   */
  protected async catch(error: Interfaces.CommandError): Promise<unknown> {
    // CYCL-52 — `this.exit(n)` is a decision the command made, not a failure to report: whoever
    // called it has already had their say on the exit. Without this line the ExitError lands down here
    // and the generic branch emits a SECOND envelope, so a reader in data mode finds two JSON
    // objects on the same output and cannot tell which one is the answer.
    if (isExitError(error)) throw error

    if (error instanceof ApiRequestError) {
      if (this.jsonEnabled()) {
        this.logJson({error: {code: error.code, message: error.message, ...(error.details === undefined ? {} : {details: error.details})}})
      } else {
        this.logToStderr(`${error.code}: ${error.message}`)
        for (const line of reviewVerdictLines(error)) this.logToStderr(line)
      }
      return this.exit(1)
    }

    // A rejected command line is not a server failure: oclif refuses it before the command body runs
    // (missing required flag/arg, nonexistent flag, value outside the options) and the `this.error(...)`
    // guards refuse it inside. Both used to collapse into the generic C500-SYS-001 "Command failed" in
    // --json, so a script could not tell a forgotten flag from an outage. Emit the same message the
    // human mode prints, under a dedicated code (CYCL-33). Human mode is untouched: oclif keeps
    // rendering its own error plus the usage help.
    if (isInputError(error) && this.jsonEnabled()) {
      this.logJson({error: {code: ErrorCodes.Input.invalid, message: inputErrorMessage(error)}})
      return this.exit(1)
    }

    // Oclif's default JSON formatter serializes the complete CommandError. That object references
    // the command instance and therefore cfg/api.config, including the bearer token. Never pass an
    // unknown error to that formatter in JSON mode: emit a deliberately small allow-listed envelope.
    if (this.jsonEnabled()) {
      this.logJson({error: {code: ErrorCodes.System.unexpected, message: 'Command failed'}})
      return this.exit(1)
    }

    return super.catch(error)
  }

  /**
   * After a successful human-mode command, print the pagination footer once. Every list command
   * renders a single backend page; reading `this.api.lastMeta` (saved by CliApi on the last response)
   * here keeps the "there are more pages" hint in one place instead of in all 30 of them (CYCL-11).
   *
   * Gated on the command actually exposing `--page`: on a download, a lookup, or a `statuses`/`tokens`
   * list without that flag, `lastMeta` may be stale (e.g. left by `resolveProjectId`) or from a
   * collection the reader cannot page, and "Use --page N" would point at a flag that does not exist.
   * Also suppressed on error and in `--json` mode, so machine output stays exact.
   */
  protected async finally(err: Error | undefined): Promise<unknown> {
    if (!err && !this.jsonEnabled() && 'page' in (this.ctor.flags ?? {})) {
      const footer = paginationFooter(this.api?.lastMeta)
      if (footer) this.log(footer)
    }

    return super.finally(err)
  }
}

/**
 * The automatic reviewer of knowledge pages (R422-KNOWLEDGE-013, CYRA-764) answers with the whole
 * verdict in `details`: every rule violated, the format it recognised, a suggested title, the page it
 * looks like a duplicate of. The message carries only the first three rules, so a human reading the
 * terminal would otherwise have to open the site to learn what to fix.
 */
function reviewVerdictLines(error: ApiRequestError): string[] {
  if (error.code !== 'R422-KNOWLEDGE-013' || typeof error.details !== 'object' || error.details === null) return []

  const details = error.details as {
    format?: string
    violations?: Array<{code?: string; message?: string; blocking?: boolean}>
    suggested_title?: string | null
    split_suggestion?: string[]
    duplicate_of?: string | null
  }
  const lines: string[] = []
  const violations = Array.isArray(details.violations) ? details.violations : []
  if (violations.length > 0) {
    lines.push('Rules violated:')
    for (const v of violations) lines.push(`  ${v.code ?? '?'}${v.blocking === false ? ' (warning)' : ''}: ${v.message ?? ''}`)
  }

  if (details.format && details.format !== 'unknown') lines.push(`Format recognised: ${details.format}`)
  if (details.suggested_title) lines.push(`Suggested title: ${details.suggested_title}`)
  if (details.duplicate_of) lines.push(`Looks like a duplicate of: ${details.duplicate_of}`)
  if (Array.isArray(details.split_suggestion) && details.split_suggestion.length > 0) {
    lines.push(`Split into: ${details.split_suggestion.join(' · ')}`)
  }

  return lines
}

