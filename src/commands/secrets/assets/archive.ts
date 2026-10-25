import {Args, Flags} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../../base'

export default class SecretsAssetsArchive extends BaseCommand {
  static args = {id: Args.string({required: true})}
  static flags = {...projectFlag, confirm: Flags.boolean({required: true})}
  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(SecretsAssetsArchive)
    const projectId = await this.resolveProjectId(flags.project)
    await this.api.delete(`/cli/v1/projects/${encodeURIComponent(projectId)}/secret_assets/${encodeURIComponent(args.id)}`)
    if (!this.jsonEnabled()) this.log(`Archived secret asset ${args.id}`)
    return {archived: true, id: args.id}
  }
}
