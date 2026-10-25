import {Args, Flags} from '@oclif/core'
import {BaseCommand} from '../../base'

export default class LogsUnlink extends BaseCommand {
  static args = {
    id: Args.string({description: 'Log entry id', required: true}),
    link: Args.string({description: 'Link id to remove', required: true}),
  }

  static description = 'Remove a manual log↔target link (irreversible)'

  static examples = ['<%= config.bin %> logs unlink <log-entry-id> <link-id> --confirm']

  static flags = {
    confirm: Flags.boolean({description: 'Required: confirm the irreversible deletion'}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(LogsUnlink)

    if (!flags.confirm) {
      this.error('Refusing to delete without --confirm (the action is irreversible).', {exit: 2})
    }

    await this.api.delete(`/cli/v1/log_entries/${args.id}/links/${args.link}`)

    if (!this.jsonEnabled()) this.log(`Removed link ${args.link} from log ${args.id}`)

    return {deleted: args.link}
  }
}
