import {Args, Flags} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../../base'

export default class SecretsAssetsRollback extends BaseCommand {
  static args = {id: Args.string({required: true})}
  static flags = {...projectFlag, version: Flags.integer({required: true})}
  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(SecretsAssetsRollback)
    const projectId = await this.resolveProjectId(flags.project)
    const res = await this.api.post(`/cli/v1/projects/${encodeURIComponent(projectId)}/secret_assets/${encodeURIComponent(args.id)}/rollback`, {version: flags.version})
    if (!this.jsonEnabled()) this.log(`Restored version ${flags.version} as a new encrypted version`)
    return res
  }
}
