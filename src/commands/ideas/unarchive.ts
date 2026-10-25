import {Args} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../base'
import {renderRecord} from '../../lib/output'

export default class IdeasUnarchive extends BaseCommand {
  static args = {
    id: Args.string({description: 'Idea id', required: true}),
  }

  static description = 'Reopen an archived idea (archived → open; author always allowed, others need ideas.edit)'

  static examples = ['<%= config.bin %> ideas unarchive <idea-id> --project acme-api']

  static flags = {...projectFlag}

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(IdeasUnarchive)
    const projectId = await this.resolveProjectId(flags.project)
    const res = await this.api.delete<Record<string, unknown>>(
      `/cli/v1/projects/${projectId}/ideas/${args.id}/archive`,
    )

    if (!this.jsonEnabled()) {
      this.log(`Reopened idea ${args.id}:`)
      this.log(renderRecord(res.data ?? {}))
    }

    return res
  }
}
