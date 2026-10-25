import {Flags} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../../base'
import {renderRecord} from '../../../lib/output'
import {artifactFailure, artifactMetadata, artifactPath} from '../../../lib/source-map-artifacts'
import {prepareSourceMap, readSourceMapFile, SourceMapInputError, sourceMapUploadBody} from '../../../lib/source-maps'

export default class SourceMapsUpload extends BaseCommand {
  static description = 'Upload a source map with original function ranges, without source contents'
  static flags = {
    ...projectFlag,
    file: Flags.string({description: 'Explicit local .map file (regular file, no symlinks)', required: true}),
    release: Flags.string({description: 'Exact application release', required: true}),
    'generated-file': Flags.string({description: 'Generated filename or URL from error frames', required: true}),
    dist: Flags.string({description: 'Exact distribution identifier'}),
    'debug-id': Flags.string({description: 'Optional source map debug UUID'}),
  }

  async run(): Promise<unknown> {
    const {flags} = await this.parse(SourceMapsUpload)
    try {
      const identity = {release: flags.release, generatedFile: flags['generated-file'], dist: flags.dist, debugId: flags['debug-id']}
      sourceMapUploadBody(identity, {version: 3, sources: [], names: [], mappings: ''})
      const sourceMap = await prepareSourceMap(await readSourceMapFile(flags.file))
      const body = sourceMapUploadBody(identity, sourceMap)
      const project = await this.resolveProjectId(flags.project)
      const res = await this.api.post<Record<string, unknown>>(artifactPath(project), body)
      const result = {...res, data: artifactMetadata(res.data)}
      if (!this.jsonEnabled()) this.log(renderRecord(result.data))
      return result
    } catch (error) {
      if (error instanceof SourceMapInputError) this.error(error.message, {exit: 2})
      artifactFailure(error)
    }
  }
}
