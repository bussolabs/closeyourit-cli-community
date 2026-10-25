import {Args, Flags} from '@oclif/core'
import {BaseCommand} from '../../base'

export default class ServiceAccountsDelete extends BaseCommand {
  static args = {
    id: Args.string({description: 'Service account id', required: true}),
  }

  static description = 'Delete a service account (revokes its tokens + removes org access; the secrets audit trail is kept)'

  static examples = ['<%= config.bin %> service-accounts delete <id> --confirm']

  static flags = {
    confirm: Flags.boolean({description: 'Required: confirm the deletion'}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(ServiceAccountsDelete)

    if (!flags.confirm) {
      this.error('Refusing to delete without --confirm.', {exit: 2})
    }

    await this.api.delete(`/cli/v1/service/accounts/${encodeURIComponent(args.id)}`)

    if (!this.jsonEnabled()) this.log(`Deleted service account ${args.id}`)

    return {deleted: args.id}
  }
}
