import {BaseCommand, pageFlag, paginationError, projectFlag} from '../../../base'
import {renderTable} from '../../../lib/output'
import {artifactFailure, artifactMetadata, artifactPath} from '../../../lib/source-map-artifacts'

export default class NativeSymbolsList extends BaseCommand {
  static description = 'List private native symbol metadata for a visible project'
  static flags = {...projectFlag, ...pageFlag}

  async run(): Promise<unknown> {
    const {flags} = await this.parse(NativeSymbolsList)
    const error = paginationError(flags)
    if (error) this.error(error, {exit: 2})
    try {
      const project = await this.resolveProjectId(flags.project)
      const res = await this.api.get<Array<Record<string, unknown>>>(`${artifactPath(project, undefined, 'native_symbols')}?page=${flags.page}`)
      const result = {...res, data: res.data.map(artifactMetadata)}
      if (!this.jsonEnabled()) this.log(renderTable(['ID', 'FORMAT', 'ARCH', 'DEBUG ID', 'BYTES'], result.data.map((row) =>
        ['id', 'format', 'architecture', 'debug_id', 'byte_size'].map((key) => String(row[key] ?? '')))))
      return result
    } catch (error) { artifactFailure(error, 'native symbol') }
  }
}
