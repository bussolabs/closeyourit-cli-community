import {Args, Flags} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../../base'

export default class ErrorsGroupingRulesDelete extends BaseCommand {
  static description = 'Delete a grouping rule (the groups it already made stay where they are)'

  static examples = ['<%= config.bin %> errors grouping-rules delete <rule-id> --project acme-api --confirm']

  static args = {
    id: Args.string({description: 'Grouping rule id', required: true}),
  }

  static flags = {
    ...projectFlag,
    confirm: Flags.boolean({description: 'Required: confirm the deletion'}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(ErrorsGroupingRulesDelete)

    if (!flags.confirm) {
      this.error('Refusing to delete without --confirm.', {exit: 2})
    }

    const projectId = await this.resolveProjectId(flags.project)
    await this.api.delete(
      `/cli/v1/projects/${encodeURIComponent(projectId)}/error_grouping_rules/${encodeURIComponent(args.id)}`,
    )

    if (!this.jsonEnabled()) this.log(`Deleted grouping rule ${args.id}.`)

    return {deleted: args.id}
  }
}
