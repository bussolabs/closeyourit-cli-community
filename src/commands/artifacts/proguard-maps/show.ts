import {Args} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../../base'
import {renderRecord} from '../../../lib/output'
import {artifactFailure, artifactMetadata, artifactPath} from '../../../lib/source-map-artifacts'

export default class ProguardMapsShow extends BaseCommand {
  static description = 'Show ProGuard/R8 artifact metadata without downloading the mapping'
  static args = {id: Args.string({description: 'ProGuard artifact id', required: true})}
  static flags = {...projectFlag}

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(ProguardMapsShow)
    try {
      const project = await this.resolveProjectId(flags.project)
      const res = await this.api.get<Record<string, unknown>>(artifactPath(project, args.id, 'proguard_maps'))
      const result = {...res, data: artifactMetadata(res.data)}
      if (!this.jsonEnabled()) this.log(renderRecord(result.data))
      return result
    } catch (error) { artifactFailure(error, 'ProGuard map') }
  }
}
