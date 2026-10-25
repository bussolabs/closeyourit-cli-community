import {Flags} from '@oclif/core'
import {BaseCommand, pageFlag} from '../../base'
import {buildPagesQuery, KNOWLEDGE_STATUSES, normalizeKinds, renderPagesTable} from '../../lib/knowledge'

export default class KbList extends BaseCommand {
  static description = 'List knowledge pages across the projects you can see'

  static examples = [
    '<%= config.bin %> kb list',
    '<%= config.bin %> kb list --project acme-api --kind decision',
    '<%= config.bin %> kb list --kind note,guide --per 50 --json',
    '<%= config.bin %> kb list --status in_review',
    '<%= config.bin %> kb list --awaiting-consolidation',
  ]

  static flags = {
    // Optional (the endpoint is cross-project): omit it to span every visible project.
    project: Flags.string({char: 'p', description: 'Filter by project (key or UUID)'}),
    kind: Flags.string({description: 'Filter by kind: note|decision|guide (repeatable or comma-separated)', multiple: true}),
    // Without it the server lists published pages only: proposals waiting for review never show up
    // in an ordinary listing.
    status: Flags.string({description: 'Filter by review state', options: [...KNOWLEDGE_STATUSES]}),
    'awaiting-consolidation': Flags.boolean({
      description: 'Only accepted pages not yet written to the versioned docs',
    }),
    per: Flags.integer({description: 'Page size'}),
    ...pageFlag,
  }

  async run(): Promise<unknown> {
    const {flags} = await this.parse(KbList)

    const query = buildPagesQuery({
      awaitingConsolidation: flags['awaiting-consolidation'],
      kinds: normalizeKinds(flags.kind),
      page: flags.page,
      per: flags.per,
      project: flags.project,
      status: flags.status,
    })
    const res = await this.api.get<Array<Record<string, unknown>>>(`/cli/v1/knowledge/pages?${query}`)

    if (!this.jsonEnabled()) {
      this.log(renderPagesTable(res.data ?? []))
    }

    return res
  }
}
