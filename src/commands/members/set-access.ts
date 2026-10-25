import {Args, Flags} from '@oclif/core'
import {BaseCommand} from '../../base'
import {renderRecord} from '../../lib/output'

export default class MembersSetAccess extends BaseCommand {
  // Scope (groups/projects): FULL REPLACE — the ids you pass become the member's complete access set;
  // omit --group / --project to clear that dimension (an empty array is always sent).
  // Roles/overrides: applied ONLY when their flag is passed (a client sending just --group/--project
  // never clears roles or overrides). --role-id is a full-replace of the direct roles; --override is a
  // full-replace of the personal allow/deny overrides ("inherit" removes the override for that key).
  static description = "Set a member's access: group/project scope, direct roles, and permission overrides"

  static examples = [
    '<%= config.bin %> members set-access <membership-id> --project acme-api --project acme-web',
    '<%= config.bin %> members set-access <membership-id> --group DriverOne --role-id Maintainer',
    '<%= config.bin %> members set-access <membership-id> --override tickets.edit=allow --override errors.triage=deny',
    '<%= config.bin %> members set-access <membership-id>',
  ]

  static args = {
    id: Args.string({description: 'Membership id', required: true}),
  }

  static flags = {
    group: Flags.string({
      description: 'Group id or name to grant access to (repeatable; omit to clear group access)',
      multiple: true,
      default: [],
    }),
    project: Flags.string({
      description: 'Project id or key to grant access to (repeatable; omit to clear project access)',
      multiple: true,
      default: [],
    }),
    'role-id': Flags.string({
      description: 'Direct role id or name (repeatable; when passed, replaces the direct roles set)',
      multiple: true,
    }),
    override: Flags.string({
      description: 'Permission override "permission.key=allow|deny|inherit" (repeatable; when passed, replaces the overrides)',
      multiple: true,
    }),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(MembersSetAccess)

    // Scope is always sent (full-replace / clear). Roles & overrides only when their flag is present,
    // so this mirrors the backend `params.key?`-gated apply and never clears what the caller omitted.
    const body: Record<string, unknown> = {
      group_ids: await this.resolveAll(flags.group, (v) => this.resolveGroupId(v)),
      project_ids: await this.resolveAll(flags.project, (v) => this.resolveProjectId(v)),
    }

    if (flags['role-id'] !== undefined) {
      body.role_ids = await this.resolveAll(flags['role-id'], (v) => this.resolveRoleId(v))
    }
    if (flags.override !== undefined) {
      body.overrides = this.parseOverrides(flags.override)
    }

    const res = await this.api.put<Record<string, unknown>>(
      `/cli/v1/members/${encodeURIComponent(args.id)}/access`,
      body,
    )

    if (!this.jsonEnabled()) {
      this.log('Member access updated:')
      this.log(renderRecord(res.data ?? {}))
    }

    return res
  }

  /** Parse repeated `key=allow|deny|inherit` entries into a `{key: value}` map; usage error on a bad entry. */
  private parseOverrides(entries: string[]): Record<string, string> {
    const out: Record<string, string> = {}
    for (const entry of entries) {
      const eq = entry.indexOf('=')
      const key = eq === -1 ? '' : entry.slice(0, eq).trim()
      const value = eq === -1 ? '' : entry.slice(eq + 1).trim()
      if (!key || !['allow', 'deny', 'inherit'].includes(value)) {
        this.error(`Invalid --override "${entry}". Use "permission.key=allow|deny|inherit".`, {exit: 2})
      }
      out[key] = value
    }
    return out
  }
}
