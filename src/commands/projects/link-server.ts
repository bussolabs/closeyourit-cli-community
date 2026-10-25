import {Flags} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../base'
import {renderRecord} from '../../lib/output'

export default class ProjectsLinkServer extends BaseCommand {
  static description = 'Link a server host to one of the project declared environments (uptime monitoring)'

  static examples = [
    '<%= config.bin %> projects link-server --project LBRA --host-id <host-uuid> --environment-id <env-uuid>',
  ]

  static flags = {
    ...projectFlag,
    'host-id': Flags.string({description: 'Server host id (UUID, org-scoped and active)', required: true}),
    'environment-id': Flags.string({
      description: 'Environment id (UUID) among those declared by the project',
      required: true,
    }),
  }

  async run(): Promise<unknown> {
    const {flags} = await this.parse(ProjectsLinkServer)
    const projectId = await this.resolveProjectId(flags.project)
    const res = await this.api.post<Record<string, unknown>>(`/cli/v1/projects/${projectId}/servers`, {
      host_id: flags['host-id'],
      environment_id: flags['environment-id'],
    })

    if (!this.jsonEnabled()) {
      this.log('Server linked:')
      this.log(renderRecord(res.data ?? {}))
    }

    return res
  }
}
