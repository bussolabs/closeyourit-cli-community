import {Args} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../base'
import {renderRecord} from '../../lib/output'

export default class ErrorsShow extends BaseCommand {
  static description = 'Show a single error group'

  static examples = ['<%= config.bin %> errors show <group-id> --project acme-api']

  static args = {
    id: Args.string({description: 'Error group id', required: true}),
  }

  static flags = {...projectFlag}

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(ErrorsShow)
    const projectId = await this.resolveProjectId(flags.project)
    const res = await this.api.get<Record<string, unknown>>(
      `/cli/v1/projects/${projectId}/error_groups/${args.id}`,
    )

    if (!this.jsonEnabled()) {
      this.log(renderRecord(res.data ?? {}))
    }

    return res
  }
}
