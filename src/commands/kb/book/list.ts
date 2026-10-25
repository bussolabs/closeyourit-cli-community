import {Flags} from '@oclif/core'
import {BaseCommand, pageFlag, paginationError} from '../../../base'
import {buildBooksQuery, renderBooksTable} from '../../../lib/knowledge'

export default class KbBookList extends BaseCommand {
  static description = 'List knowledge books (ordered collections of pages) across the projects you can see'

  static examples = [
    '<%= config.bin %> kb book list',
    '<%= config.bin %> kb book list --project acme-api',
    '<%= config.bin %> kb book list --q deploy --per 50',
    '<%= config.bin %> kb book list --json',
  ]

  static flags = {
    // Optional (the endpoint is cross-project): omit it to span every visible project.
    project: Flags.string({char: 'p', description: 'Filter by project (key or UUID)'}),
    q: Flags.string({description: 'Filter by title (substring, case-insensitive)'}),
    per: Flags.integer({description: 'Page size'}),
    ...pageFlag,
  }

  async run(): Promise<unknown> {
    const {flags} = await this.parse(KbBookList)

    const invalid = paginationError(flags)
    if (invalid) this.error(invalid, {exit: 2})

    const res = await this.api.get<Array<Record<string, unknown>>>(
      `/cli/v1/knowledge/books?${buildBooksQuery(flags)}`,
    )

    if (!this.jsonEnabled()) {
      this.log(renderBooksTable(res.data ?? []))
    }

    return res
  }
}
