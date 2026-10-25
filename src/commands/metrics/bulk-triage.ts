import {Flags} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../base'
import {ErrorCodes} from '../../errors/error-codes'
import {TRIAGE_ACTIONS, assertNothingDropped, triagedLine, uniqueIds} from '../../lib/bulk-triage'
import {renderTable, statusCell} from '../../lib/output'

export default class MetricsBulkTriage extends BaseCommand {
  static description = 'Resolve, ignore or reopen several metric groups in one call'

  static examples = [
    '<%= config.bin %> metrics bulk-triage -p acme-api --action resolve --group <id-a> --group <id-b>',
    '<%= config.bin %> metrics bulk-triage -p acme-api --action ignore --group <id-a> --json',
  ]

  static flags = {
    ...projectFlag,
    action: Flags.string({description: 'What to do with them', options: [...TRIAGE_ACTIONS], required: true}),
    group: Flags.string({description: 'Metric group id (repeatable)', multiple: true, required: true}),
  }

  async run(): Promise<unknown> {
    const {flags} = await this.parse(MetricsBulkTriage)
    const projectId = await this.resolveProjectId(flags.project)
    const ids = uniqueIds(flags.group)

    const res = await this.api.post<Array<Record<string, unknown>>>(
      `/cli/v1/projects/${encodeURIComponent(projectId)}/metric_groups/bulk_triage`,
      {bulk_action: flags.action, ids},
    )
    const groups = res.data ?? []

    if (!this.jsonEnabled()) {
      this.log(triagedLine(groups.length, 'metric group', flags.action))
      this.log(
        renderTable(
          ['ID', 'KIND', 'NAME', 'STATUS'],
          groups.map((group) => [
            String(group.id ?? ''),
            String(group.kind ?? ''),
            String(group.name ?? group.title ?? ''),
            statusCell(group.status),
          ]),
        ),
      )
    }

    assertNothingDropped({
      action: flags.action,
      code: ErrorCodes.MetricGroup.notFound,
      noun: 'metric group',
      requested: ids,
      rows: groups,
    })

    return res
  }
}
