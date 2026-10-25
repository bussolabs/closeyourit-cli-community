import {Flags} from '@oclif/core'
import {BaseCommand, environmentFlag, projectFlag} from '../../base'
import {renderRecord} from '../../lib/output'

export default class ProjectsSetEnvironmentCapabilities extends BaseCommand {
  static description =
    'Override the servers/uptime/secrets capabilities of a project environment (inherit = follow the environment default)'

  static examples = [
    '<%= config.bin %> projects set-environment-capabilities -p LBRA -e production --uptime off',
    '<%= config.bin %> projects set-environment-capabilities -p legalbloom-rails -e staging --uptime off --secrets inherit',
  ]

  static flags = {
    ...projectFlag,
    ...environmentFlag,
    // inherit = clear the override (follow the environment default); on/off = force it for this project.
    servers: Flags.string({description: 'Servers capability', options: ['inherit', 'on', 'off']}),
    uptime: Flags.string({description: 'Uptime capability', options: ['inherit', 'on', 'off']}),
    secrets: Flags.string({description: 'Secrets capability', options: ['inherit', 'on', 'off']}),
  }

  async run(): Promise<unknown> {
    const {flags} = await this.parse(ProjectsSetEnvironmentCapabilities)
    const projectId = await this.resolveProjectId(flags.project)

    // Only the provided capabilities are sent — the others keep their current override.
    const body: Record<string, unknown> = {}
    if (flags.servers !== undefined) body.servers = flags.servers
    if (flags.uptime !== undefined) body.uptime = flags.uptime
    if (flags.secrets !== undefined) body.secrets = flags.secrets

    const res = await this.api.put<Record<string, unknown>>(
      `/cli/v1/projects/${projectId}/environments/${encodeURIComponent(flags.environment)}/capabilities`,
      body,
    )

    if (!this.jsonEnabled()) {
      this.log('Capabilities updated:')
      this.log(renderRecord(res.data ?? {}))
    }

    return res
  }
}
