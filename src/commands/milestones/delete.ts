import {Args, Flags} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../base'

export default class MilestonesDelete extends BaseCommand {
  static description = 'Delete a milestone (irreversible)'

  static examples = ['<%= config.bin %> milestones delete <milestone-id> --project acme-api --confirm']

  static args = {
    id: Args.string({description: 'Milestone id', required: true}),
  }

  static flags = {
    ...projectFlag,
    confirm: Flags.boolean({description: 'Required: confirm the deletion'}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(MilestonesDelete)

    if (!flags.confirm) {
      this.error('Refusing to delete without --confirm.', {exit: 2})
    }

    const projectId = await this.resolveProjectId(flags.project)
    await this.api.delete(
      `/cli/v1/projects/${encodeURIComponent(projectId)}/milestones/${encodeURIComponent(args.id)}`,
    )

    if (!this.jsonEnabled()) this.log(`Deleted milestone ${args.id}`)

    return {deleted: args.id}
  }
}
