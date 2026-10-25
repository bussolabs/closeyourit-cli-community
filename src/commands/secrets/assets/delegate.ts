import {Args, Flags} from '@oclif/core'
import {BaseCommand} from '../../../base'

export default class SecretsAssetsDelegate extends BaseCommand {
  static args = {id: Args.string({required: true})}
  static flags = {project: Flags.string({char: 'p', required: true})}
  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(SecretsAssetsDelegate)
    const projectId = await this.resolveProjectId(flags.project)
    const res = await this.api.post(`/cli/v1/shared_secret_assets/${encodeURIComponent(args.id)}/delegate`, {project_id: projectId})
    if (!this.jsonEnabled()) this.log(`Delegated shared asset to ${flags.project}`)
    return res
  }
}
