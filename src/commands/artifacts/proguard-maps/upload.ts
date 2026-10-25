import {Flags} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../../base'
import {renderRecord} from '../../../lib/output'
import {artifactFailure, artifactMetadata, artifactPath} from '../../../lib/source-map-artifacts'
import {ProguardMapInputError, proguardMapUploadBody, readProguardMapFile, validateProguardMapIdentity} from '../../../lib/proguard-maps'

export default class ProguardMapsUpload extends BaseCommand {
  static description = 'Upload a private ProGuard/R8 mapping with exact release and Sentry debug UUID'
  static flags = {
    ...projectFlag,
    file: Flags.string({description: 'Explicit regular .txt or .map file, without symlinks', required: true}),
    release: Flags.string({description: 'Exact application release', required: true}),
    dist: Flags.string({description: 'Exact distribution identifier'}),
    'debug-id': Flags.string({description: 'Required Sentry ProGuard UUID (not an R8 map id)', required: true}),
  }

  async run(): Promise<unknown> {
    const {flags} = await this.parse(ProguardMapsUpload)
    try {
      const identity = {release: flags.release, dist: flags.dist, debugId: flags['debug-id']}
      validateProguardMapIdentity(identity)
      const body = proguardMapUploadBody(identity, await readProguardMapFile(flags.file))
      const project = await this.resolveProjectId(flags.project)
      const res = await this.api.post<Record<string, unknown>>(artifactPath(project, undefined, 'proguard_maps'), body)
      const result = {...res, data: artifactMetadata(res.data)}
      if (!this.jsonEnabled()) this.log(renderRecord(result.data))
      return result
    } catch (error) {
      if (error instanceof ProguardMapInputError) this.error(error.message, {exit: 2})
      artifactFailure(error, 'ProGuard map')
    }
  }
}
