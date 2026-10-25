import {Args, Flags} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../../base'

export default class AnalyticsGoalsDelete extends BaseCommand {
  static description = 'Delete a conversion goal (irreversible)'

  static examples = ['<%= config.bin %> analytics goals delete <goal-id> --project acme-web --confirm']

  static args = {
    id: Args.string({description: 'Goal id', required: true}),
  }

  static flags = {
    ...projectFlag,
    confirm: Flags.boolean({description: 'Required: confirm the irreversible deletion'}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(AnalyticsGoalsDelete)

    if (!flags.confirm) {
      this.error('Refusing to delete without --confirm (the action is irreversible).', {exit: 2})
    }

    const projectId = await this.resolveProjectId(flags.project)
    await this.api.delete(`/cli/v1/projects/${projectId}/analytics/goals/${args.id}`)

    if (!this.jsonEnabled()) this.log(`Deleted goal ${args.id}`)

    return {deleted: args.id}
  }
}
