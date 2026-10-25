import {Args, Flags} from '@oclif/core'
import {BaseCommand, environmentFlag} from '../../base'

export default class SharedSet extends BaseCommand {
  static args = {
    assignment: Args.string({description: 'NAME=VALUE, or just NAME with --value', required: true}),
  }

  static description =
    'Set (create or update) an organization shared secret for one environment. Projects delegated on that environment read the new value.'

  static examples = [
    '<%= config.bin %> shared set -e production SENTRY_DSN=https://key@sentry.io/42',
    '<%= config.bin %> shared set -e staging API_KEY --value s3cr3t --description "Stripe key"',
  ]

  static flags = {
    // No --project on purpose: a shared variable belongs to the organization and reaches projects
    // through delegation, so scoping it to one project at write time would be a lie.
    ...environmentFlag,
    value: Flags.string({description: 'Secret value (use when the arg is just NAME)'}),
    description: Flags.string({description: 'Optional description'}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(SharedSet)

    const eq = args.assignment.indexOf('=')
    const name = eq === -1 ? args.assignment : args.assignment.slice(0, eq)
    const value = eq === -1 ? flags.value : args.assignment.slice(eq + 1)
    if (value === undefined) {
      this.error('Provide a value: use NAME=VALUE or pass --value', {exit: 1})
    }

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
