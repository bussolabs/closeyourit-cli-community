import {Args, Flags} from '@oclif/core'
import {BaseCommand} from '../../base'
import {readSecretValue} from '../../lib/secret-value'

export default class PersonalSet extends BaseCommand {
  static args = {
    assignment: Args.string({description: 'NAME (value asked hidden, or read from stdin); NAME=VALUE also works but stays in shell history', required: true}),
  }

  static description = 'Set (create or update) a personal secret for the current organization'

  static examples = [
    '<%= config.bin %> personal set OPENAI_API_KEY',
    'pbpaste | <%= config.bin %> personal set OPENAI_API_KEY',
    '<%= config.bin %> personal set API_KEY --value s3cr3t --description "Stripe key"',
  ]

  static flags = {
    value: Flags.string({description: 'Secret value (visible in shell history: prefer the prompt or stdin)'}),
    description: Flags.string({description: 'Optional description'}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(PersonalSet)

    const eq = args.assignment.indexOf('=')
    const name = eq === -1 ? args.assignment : args.assignment.slice(0, eq)
    const value =
      (eq === -1 ? flags.value : args.assignment.slice(eq + 1)) ??
      (await readSecretValue(name).catch((error: Error) => this.error(`${error.message}: type it at the prompt or pipe it via stdin`, {exit: 1})))

    const res = await this.api.post<Record<string, unknown>>('/cli/v1/personal_secrets', {
      name,
      value,
      description: flags.description,
    })

    if (!this.jsonEnabled()) {
      this.log(`Personal secret ${String(name).toUpperCase()} saved.`)
    }

    return res
  }
}
