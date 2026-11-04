import {Args, Flags} from '@oclif/core'
import {BaseCommand, environmentFlag} from '../../base'
import {readSecretValue} from '../../lib/secret-value'

export default class SharedSet extends BaseCommand {
  static args = {
    assignment: Args.string({description: 'NAME (value asked hidden, or read from stdin); NAME=VALUE also works but stays in shell history', required: true}),
  }

  static description =
    'Set (create or update) an organization shared secret for one environment. Projects delegated on that environment read the new value.'

  static examples = [
    '<%= config.bin %> shared set -e production SENTRY_DSN',
    'pbpaste | <%= config.bin %> shared set -e production SENTRY_DSN',
    '<%= config.bin %> shared set -e staging API_KEY --value s3cr3t --description "Stripe key"',
  ]

  static flags = {
    // No --project on purpose: a shared variable belongs to the organization and reaches projects
    // through delegation, so scoping it to one project at write time would be a lie.
    ...environmentFlag,
    value: Flags.string({description: 'Secret value (visible in shell history: prefer the prompt or stdin)'}),
    description: Flags.string({description: 'Optional description'}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(SharedSet)

    const eq = args.assignment.indexOf('=')
    const name = eq === -1 ? args.assignment : args.assignment.slice(0, eq)
    const value =
      (eq === -1 ? flags.value : args.assignment.slice(eq + 1)) ??
      (await readSecretValue(name).catch((error: Error) => this.error(`${error.message}: type it at the prompt or pipe it via stdin`, {exit: 1})))

    const res = await this.api.post<Record<string, unknown>>('/cli/v1/shared_secrets', {
      environment: flags.environment,
      name,
      value,
      description: flags.description,
    })

    if (!this.jsonEnabled()) {
      this.log(`Shared secret ${String(name).toUpperCase()} saved (${flags.environment}).`)
    }

    return res
  }
}
