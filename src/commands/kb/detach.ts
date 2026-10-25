import {Args, Flags} from '@oclif/core'
import {BaseCommand} from '../../base'

export default class KbDetach extends BaseCommand {
  static description = 'Remove an attachment from a knowledge page (irreversible)'

  static examples = ['<%= config.bin %> kb detach <page-id> --attachment <attachment-id> --confirm']

  static args = {
    id: Args.string({description: 'Knowledge page id', required: true}),
  }

  static flags = {
    attachment: Flags.string({description: 'Attachment id to remove', required: true}),
    confirm: Flags.boolean({description: 'Required: confirm the irreversible deletion'}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(KbDetach)

    if (!flags.confirm) {
      this.error('Refusing to delete without --confirm (the action is irreversible).', {exit: 2})
    }

    await this.api.delete(
      `/cli/v1/knowledge/pages/${encodeURIComponent(args.id)}/attachments/${encodeURIComponent(flags.attachment)}`,
    )

    if (!this.jsonEnabled()) this.log(`Removed attachment ${flags.attachment} from knowledge page ${args.id}`)

    return {detached: flags.attachment, page: args.id}
  }
}
