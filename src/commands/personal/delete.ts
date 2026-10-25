import {Args} from '@oclif/core'
import {BaseCommand} from '../../base'

export default class PersonalDelete extends BaseCommand {
  static args = {
    name: Args.string({description: 'Secret name', required: true}),
  }

  static description = 'Delete a personal secret from the current organization'

  static examples = ['<%= config.bin %> personal delete API_KEY']

  async run(): Promise<unknown> {
    const {args} = await this.parse(PersonalDelete)
    const name = args.name.toUpperCase()

    await this.api.delete(`/cli/v1/personal_secrets/${encodeURIComponent(name)}`)

    if (!this.jsonEnabled()) {
      this.log(`Personal secret ${name} deleted.`)
    }

    return {deleted: name}
  }
}
