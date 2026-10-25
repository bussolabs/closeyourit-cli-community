import {Args, Flags} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../base'

export default class IdeasCaseDelete extends BaseCommand {
  static args = {
    idea: Args.string({description: 'Idea id', required: true}),
    case: Args.string({description: 'Case id', required: true}),
  }

  static description = 'Delete a case from an open idea (author always allowed, others need ideas.edit)'

  static examples = [
    '<%= config.bin %> ideas case-delete <idea-id> <case-id> --project acme-api --confirm',
  ]

  static flags = {
    ...projectFlag,
    confirm: Flags.boolean({description: 'Required: confirm the irreversible deletion'}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(IdeasCaseDelete)

    if (!flags.confirm) {
      this.error('Refusing to delete without --confirm (the action is irreversible).', {exit: 2})
    }

    const projectId = await this.resolveProjectId(flags.project)
    await this.api.delete(
      `/cli/v1/projects/${projectId}/ideas/${args.idea}/cases/${args.case}`,
    )

    if (!this.jsonEnabled()) this.log(`Deleted case ${args.case}`)

    return {deleted: args.case}
  }
}
