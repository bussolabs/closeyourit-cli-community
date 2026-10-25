import {Args, Flags} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../base'
import {renderRecord} from '../../lib/output'

export default class IdeasComment extends BaseCommand {
  static args = {
    id: Args.string({description: 'Idea id', required: true}),
  }

  static description = 'Add a comment to an idea (only open ideas accept comments)'

  static examples = [
    '<%= config.bin %> ideas comment <idea-id> --project acme-api --body "Also needed on mobile"',
  ]

  static flags = {
    ...projectFlag,
    body: Flags.string({description: 'Comment body', required: true}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(IdeasComment)
    const projectId = await this.resolveProjectId(flags.project)
    const res = await this.api.post<Record<string, unknown>>(
      `/cli/v1/projects/${projectId}/ideas/${args.id}/comments`,
      {body: flags.body},
    )

    if (!this.jsonEnabled()) {
      this.log('Comment added:')
      this.log(renderRecord(res.data ?? {}))
    }

    return res
  }
}
