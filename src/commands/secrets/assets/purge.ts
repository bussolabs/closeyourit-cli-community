import {Args, Flags} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../../base'

export default class SecretsAssetsPurge extends BaseCommand {
  static args = {id: Args.string({required: true})}
  static description = 'Permanently delete an archived secret asset and all versions (owner only)'
  static flags = {...projectFlag, 'confirm-name': Flags.string({description: 'Exact asset name confirmation', required: true})}
  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(SecretsAssetsPurge)
    const projectId = await this.resolveProjectId(flags.project)
    const list = await this.api.get<Array<{id: string; name: string}>>(`/cli/v1/projects/${encodeURIComponent(projectId)}/secret_assets?per=100`)
    const asset = (list.data ?? []).find((row) => row.id === args.id)
    if (!asset || asset.name !== flags['confirm-name']) this.error('Confirmation name does not match the asset', {exit: 2})
    await this.api.delete(`/cli/v1/projects/${encodeURIComponent(projectId)}/secret_assets/${encodeURIComponent(args.id)}/purge`)
    if (!this.jsonEnabled()) this.log(`Permanently purged ${asset.name}`)
    return {purged: true, id: args.id}
  }
}
