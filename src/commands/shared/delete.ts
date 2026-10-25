import {Args, Flags} from '@oclif/core'
import {BaseCommand, UUID_RE} from '../../base'

export default class SharedDelete extends BaseCommand {
  static args = {
    name: Args.string({description: 'Shared secret name, or its id', required: true}),
  }

  // The backend has no per-environment destroy: like the web matrix, it deletes the whole row.
  // Say so in the description, in the --confirm refusal and in the success line, so nobody reads
  // this as "removes the production cell" (CYCL-41).
  static description =
    'Delete an organization shared secret from EVERY environment at once (irreversible). There is no per-environment deletion.'

  static examples = ['<%= config.bin %> shared delete API_KEY --confirm']

  static flags = {
    confirm: Flags.boolean({description: 'Required: confirm the deletion across every environment'}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(SharedDelete)

    if (!flags.confirm) {
      this.error(
        `Refusing to delete without --confirm: this removes ${args.name} from every environment at once, not just one.`,
        {exit: 2},
      )
    }

    const ref = UUID_RE.test(args.name) ? args.name : args.name.toUpperCase()
    await this.api.delete(`/cli/v1/shared_secrets/${encodeURIComponent(ref)}`)

    if (!this.jsonEnabled()) {
      this.log(`Shared secret ${ref} deleted from every environment.`)
    }

    return {deleted: ref, environments: 'all'}
  }
}
