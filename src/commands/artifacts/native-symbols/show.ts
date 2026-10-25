import {Args} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../../base'
import {renderRecord} from '../../../lib/output'
import {artifactFailure, artifactMetadata, artifactPath} from '../../../lib/source-map-artifacts'

export default class NativeSymbolsShow extends BaseCommand {
  static description = 'Show native symbol artifact metadata without downloading the binary'
  static args = {id: Args.string({description: 'Native symbol artifact id', required: true})}
  static flags = {...projectFlag}

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(NativeSymbolsShow)
    try {
      const project = await this.resolveProjectId(flags.project)
      const res = await this.api.get<Record<string, unknown>>(artifactPath(project, args.id, 'native_symbols'))
      const result = {...res, data: artifactMetadata(res.data)}
      if (!this.jsonEnabled()) this.log(renderRecord(result.data))
      return result
    } catch (error) { artifactFailure(error, 'native symbol') }
  }
}
