import {Args} from '@oclif/core'
import {BaseCommand} from '../../base'

export default class PersonalGet extends BaseCommand {
  static args = {
    name: Args.string({description: 'Secret name', required: true}),
  }

  static description = 'Print the value of a single personal secret (pipeable).'

  static examples = ['<%= config.bin %> personal get OPENAI_API_KEY']

  async run(): Promise<unknown> {
    const {args} = await this.parse(PersonalGet)
    const res = await this.api.get<Record<string, string>>('/cli/v1/personal_secrets/bundle')

    const map = res.data ?? {}
    const key = args.name.toUpperCase()
    if (!(key in map)) {
      this.error(`Personal secret not found: ${key}`, {exit: 1})
    }

    if (!this.jsonEnabled()) {
      this.log(map[key])
    }

    return {name: key, value: map[key]}
  }
}
