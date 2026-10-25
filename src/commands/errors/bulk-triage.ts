import {Flags} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../base'
import {ErrorCodes} from '../../errors/error-codes'
import {TRIAGE_ACTIONS, assertNothingDropped, triagedLine, uniqueIds} from '../../lib/bulk-triage'
import {renderTable, statusCell} from '../../lib/output'

export default class ErrorsBulkTriage extends BaseCommand {
  static description = 'Resolve, ignore or reopen several error groups in one call'

  static examples = [
    '<%= config.bin %> errors bulk-triage -p acme-api --action resolve --group <id-a> --group <id-b>',
    '<%= config.bin %> errors bulk-triage -p acme-api --action ignore --group <id-a> --json',
  ]

  static flags = {
    ...projectFlag,
    action: Flags.string({description: 'What to do with them', options: [...TRIAGE_ACTIONS], required: true}),
    group: Flags.string({description: 'Error group id (repeatable)', multiple: true, required: true}),
  }

  async run(): Promise<unknown> {
    const {flags} = await this.parse(ErrorsBulkTriage)
    const projectId = await this.resolveProjectId(flags.project)
    const ids = uniqueIds(flags.group)

    const res = await this.api.post<Array<Record<string, unknown>>>(
      `/cli/v1/projects/${encodeURIComponent(projectId)}/error_groups/bulk_triage`,
      {bulk_action: flags.action, ids},
    )
    const groups = res.data ?? []

    if (!this.jsonEnabled()) {
      this.log(triagedLine(groups.length, 'error group', flags.action))
      this.log(
        renderTable(
          ['ID', 'TITLE', 'STATUS'],
          groups.map((group) => [String(group.id ?? ''), String(group.title ?? ''), statusCell(group.status)]),
        ),
      )
    }

    // After printing: the groups that did change are worth showing even when the selection was not
    // whole, and only then does the command refuse to call it a success.
    assertNothingDropped({
      action: flags.action,
      code: ErrorCodes.ErrorGroup.notFound,
      noun: 'error group',
      requested: ids,
      rows: groups,
    })

    return res
  }
}
