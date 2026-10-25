import {Args, Flags} from '@oclif/core'
import {BaseCommand} from '../../base'
import {ApiRequestError} from '../../lib/api'
import {renderRecord} from '../../lib/output'
import {fetchAllPages} from '../../lib/paginate'
import {
  accountSummary,
  assertBoundaryApplied,
  environmentsLine,
  normalizeEnvironmentCodes,
  unknownEnvironmentCodes,
  withoutSecret,
} from '../../lib/service-accounts'

export default class ServiceAccountsUpdate extends BaseCommand {
  // Only the secret boundary, on purpose: projects, groups and roles are three separate writes on
  // the backend, and a command that offered them here would have to change access one piece at a
  // time — a half-applied grant is worse than none. They stay on the access page until there is a
  // single atomic update (CYCL-46).
  static description =
    "Update a service account's secret access: the environments it may read secrets in (full replace)"

  static examples = [
    '<%= config.bin %> service-accounts update <id> --secret-environment staging --secret-environment production',
    '<%= config.bin %> service-accounts update <id> --all-environments',
  ]

  static args = {
    id: Args.string({description: 'Service account id', required: true}),
  }

  static flags = {
    'secret-environment': Flags.string({
      description: 'Environment code the account may read secrets in (repeatable; replaces the whole list)',
      multiple: true,
    }),
    'all-environments': Flags.boolean({
      description: 'Remove the restriction entirely: secrets readable in every environment',
      default: false,
    }),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(ServiceAccountsUpdate)
    const codes = normalizeEnvironmentCodes(flags['secret-environment'] ?? [])
    const openUp = flags['all-environments']

    // The two flags say opposite things about the same list. Guessing which one wins would either
    // widen the access silently or ignore the codes that were spelled out.
    if (openUp && codes.length > 0) {
      this.error(
        'Pass either --secret-environment (the codes to allow) or --all-environments (no restriction at all), not both.',
        {exit: 2},
      )
    }

    // No flag, or nothing but blanks: the body would carry an empty list, and on this endpoint an
    // empty list is not "leave it alone" — it is "every environment". An `update` that meant to
    // change nothing would hand out the production secrets.
    if (!openUp && codes.length === 0) {
      this.error(
        'Nothing to set: pass --secret-environment <code> (repeatable) to restrict the account, or ' +
          '--all-environments to remove the restriction. An empty list means every environment, so it has to be asked for.',
        {exit: 2},
      )
    }

    await this.refuseUnknownEnvironments(codes)

    const res = await this.api.put<Record<string, unknown>>(
      `/cli/v1/service/accounts/${encodeURIComponent(args.id)}`,
      {secret_environment_codes: codes},
    )
    const account = withoutSecret(res.data ?? {})
    const applied = normalizeEnvironmentCodes(
      Array.isArray(account.secret_environment_codes) ? (account.secret_environment_codes as unknown[]) : [],
    )

    if (!this.jsonEnabled()) {
      this.log('Service account updated:')
      this.log(renderRecord(accountSummary(account)))
      this.log(environmentsLine(applied))
    }

    // After printing: the boundary that is actually in force is what the reader needs most when the
    // server kept something else, and only then does the command refuse to call it a success.
    assertBoundaryApplied(codes, applied)

    return {...res, data: account}
  }

  /**
   * Refuse a code this organization does not declare, before the write goes out.
   *
   * The server would answer 200 to it: `SetSecretAccess` intersects the list with the real codes and
   * saves the remainder, so a single typo empties the allow-list — which grants EVERY environment
   * instead of restricting to one. Checked after the flag guards and never for `--all-environments`
   * (there is no code to check), so the extra read only happens when it can prevent something.
   */
  private async refuseUnknownEnvironments(codes: string[]): Promise<void> {
    if (codes.length === 0) return

    const known = await this.organizationEnvironmentCodes()
    if (known === undefined) return

    const unknown = unknownEnvironmentCodes(codes, known)
    if (unknown.length === 0) return

    this.error(
      `Unknown environment ${unknown.length === 1 ? 'code' : 'codes'}: ${unknown.join(', ')}. ` +
        `This organization declares: ${known.join(', ')}. ` +
        'Nothing was changed — a code that does not exist is dropped by the server, which would leave the ' +
        'account with no restriction at all (every environment).',
      {exit: 2},
    )
  }

  /**
   * The environment codes of the organization, or `undefined` when they cannot be read.
   *
   * Listing them needs `environments.view`, which managing service accounts does not imply: a 403
   * here says nothing about the update being legitimate, so it must not block it — the request/response
   * comparison after the write stays as the guard. An empty list is read the same way rather than as
   * "every code is invalid", so a lookup that changes shape can never refuse a correct command.
   */
  private async organizationEnvironmentCodes(): Promise<string[] | undefined> {
    try {
      const rows = await fetchAllPages<Record<string, unknown>>(this.api, '/cli/v1/environments')
      const codes = normalizeEnvironmentCodes(rows.map((row) => row.code))
      return codes.length > 0 ? codes : undefined
    } catch (error) {
      if (error instanceof ApiRequestError) return undefined
      throw error
    }
  }
}
