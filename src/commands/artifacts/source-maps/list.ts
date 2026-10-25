import {BaseCommand, pageFlag, paginationError, projectFlag} from '../../../base'
import {renderTable} from '../../../lib/output'
import {artifactFailure, artifactMetadata, artifactPath} from '../../../lib/source-map-artifacts'

export default class SourceMapsList extends BaseCommand {
  static description = 'List source map metadata for a visible project'
  static flags = {...projectFlag, ...pageFlag}

  async run(): Promise<unknown> {
    const {flags} = await this.parse(SourceMapsList)
    const error = paginationError(flags)
    if (error) this.error(error, {exit: 2})
    try {
      const project = await this.resolveProjectId(flags.project)
      const res = await this.api.get<Array<Record<string, unknown>>>(`${artifactPath(project)}?page=${flags.page}`)
      const result = {...res, data: res.data.map(artifactMetadata)}
      if (!this.jsonEnabled()) this.log(renderTable(['ID', 'RELEASE', 'DIST', 'GENERATED FILE', 'BYTES'], result.data.map((row) =>
        ['id', 'release', 'dist', 'generated_file', 'byte_size'].map((key) => String(row[key] ?? '')))))
      return result
    } catch (error) { artifactFailure(error) }
  }
}
