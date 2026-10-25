import {Args} from '@oclif/core'
import {BaseCommand} from '../../base'
import {renderRecord, renderTable} from '../../lib/output'

export default class ProjectsShow extends BaseCommand {
  static description = 'Show a single project by id or key, with its declared environments and their capabilities'

  static examples = ['<%= config.bin %> projects show acme-api', '<%= config.bin %> projects show <uuid> --json']

  static args = {
    id: Args.string({description: 'Project id (UUID) or key', required: true}),
  }

  async run(): Promise<unknown> {
    const {args} = await this.parse(ProjectsShow)
    const projectId = await this.resolveProjectId(args.id)
    const res = await this.api.get<Record<string, unknown>>(`/cli/v1/projects/${projectId}`)

    if (!this.jsonEnabled()) {
      const data = res.data ?? {}
      // renderRecord prints only scalar fields, so the `environments` array is skipped here and
      // rendered as its own table below — the project record stays exactly as before.
      this.log(renderRecord(data))
      this.renderEnvironments(data.environments)
    }

    return res
  }

  /**
   * The declared environments and the capabilities (servers/uptime/secrets) active on each, so the
   * current set can be read before `set-environments` replaces it wholesale (CYCL-4). An absent
   * `environments` field (older backend that doesn't ship it) prints nothing, leaving `projects
   * show` output unchanged; an empty array prints the explicit "none declared" line.
   */
  private renderEnvironments(value: unknown): void {
    if (!Array.isArray(value)) return
    this.log('')
    if (value.length === 0) {
      this.log('Environments: none declared')
      return
    }

    this.log('Environments:')
    this.log(
      renderTable(
        ['CODE', 'LABEL', 'SERVERS', 'UPTIME', 'SECRETS'],
        (value as Array<Record<string, unknown>>).map((env) => [
          String(env.code ?? ''),
          String(env.label ?? ''),
          capability(env.servers_enabled),
          capability(env.uptime_enabled),
          capability(env.secrets_enabled),
        ]),
      ),
    )
  }
}

/** A capability cell: `on`/`off` for a known boolean, `-` when the backend omits the flag. */
function capability(enabled: unknown): string {
  if (enabled === true) return 'on'
  if (enabled === false) return 'off'
  return '-'
}
