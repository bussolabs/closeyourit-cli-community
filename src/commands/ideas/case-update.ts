import {Args, Flags} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../base'
import {renderRecord} from '../../lib/output'

export default class IdeasCaseUpdate extends BaseCommand {
  // PATCH /cli/v1/projects/:p/ideas/:idea_id/cases/:id maps to Ideas::UpdateCase (only open ideas;
  // same gate as editing the idea — author, otherwise `ideas.edit`). The CLI transport speaks PUT,
  // which the Rails `resources :cases` update action accepts just like PATCH; only the passed fields
  // are sent so the backend rewrites nothing you did not touch.
  static args = {
    idea: Args.string({description: 'Idea id', required: true}),
    case: Args.string({description: 'Case id', required: true}),
  }

  static description = 'Update a case (example/scenario) of an idea (title and/or description)'

  static examples = [
    '<%= config.bin %> ideas case-update <idea-id> <case-id> --project acme-api --title "QR check-in"',
    '<%= config.bin %> ideas case-update <idea-id> <case-id> -p acme-api --description "Staff scans the QR at the door"',
  ]

  static flags = {
    ...projectFlag,
    title: Flags.string({description: 'New case title'}),
    description: Flags.string({description: 'New case description'}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(IdeasCaseUpdate)
    const projectId = await this.resolveProjectId(flags.project)

    const body: Record<string, unknown> = {}
    if (flags.title !== undefined) body.title = flags.title
    if (flags.description !== undefined) body.description = flags.description

    const res = await this.api.put<Record<string, unknown>>(
      `/cli/v1/projects/${projectId}/ideas/${args.idea}/cases/${args.case}`,
      body,
    )

    if (!this.jsonEnabled()) {
      this.log('Case updated:')
      this.log(renderRecord(res.data ?? {}))
    }

    return res
  }
}
