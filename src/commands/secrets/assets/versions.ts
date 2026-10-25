import {Args} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../../base'
import {renderTable} from '../../../lib/output'

export default class SecretsAssetsVersions extends BaseCommand {
  static args = {id: Args.string({required: true})}
  static flags = {...projectFlag}
  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(SecretsAssetsVersions)
    const projectId = await this.resolveProjectId(flags.project)
    const res = await this.api.get<Array<Record<string, unknown>>>(`/cli/v1/projects/${encodeURIComponent(projectId)}/secret_assets/${encodeURIComponent(args.id)}/versions`)
    if (!this.jsonEnabled()) this.log(renderTable(['VERSION', 'FILENAME', 'BYTES', 'CREATED'], (res.data ?? []).map((v) => [String(v.number ?? ''), String(v.filename ?? ''), String(v.byte_size ?? ''), String(v.created_at ?? '')])))
    return res
  }
}
