import {Args, Flags} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../base'

export default class IdeasDelete extends BaseCommand {
  static args = {
    id: Args.string({description: 'Idea id', required: true}),
  }

  static description = 'Delete an idea (author always allowed; others need ideas.delete)'

  static examples = ['<%= config.bin %> ideas delete <idea-id> --project acme-api --confirm']

  static flags = {
    ...projectFlag,
    confirm: Flags.boolean({description: 'Required: confirm the irreversible deletion'}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(IdeasDelete)

    if (!flags.confirm) {
      this.error('Refusing to delete without --confirm (the action is irreversible).', {exit: 2})
    }

    const projectId = await this.resolveProjectId(flags.project)
    await this.api.delete(`/cli/v1/projects/${projectId}/ideas/${args.id}`)

    if (!this.jsonEnabled()) this.log(`Deleted idea ${args.id}`)

    return {deleted: args.id}
  }
}
