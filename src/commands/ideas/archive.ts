import {Args} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../base'
import {renderRecord} from '../../lib/output'

export default class IdeasArchive extends BaseCommand {
  static args = {
    id: Args.string({description: 'Idea id', required: true}),
  }

  static description = 'Archive an idea (open → archived; author always allowed, others need ideas.edit)'

  static examples = ['<%= config.bin %> ideas archive <idea-id> --project acme-api']

  static flags = {...projectFlag}

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(IdeasArchive)
    const projectId = await this.resolveProjectId(flags.project)
    const res = await this.api.put<Record<string, unknown>>(
      `/cli/v1/projects/${projectId}/ideas/${args.id}/archive`,
    )

    if (!this.jsonEnabled()) {
      this.log(`Archived idea ${args.id}:`)
      this.log(renderRecord(res.data ?? {}))
    }

    return res
  }
}
