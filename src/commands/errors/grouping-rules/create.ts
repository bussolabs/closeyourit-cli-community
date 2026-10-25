import {Flags} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../../base'
import {GROUPING_RULE_FIELDS, GROUPING_RULE_OPERATORS, groupingRuleBody} from '../../../lib/grouping-rules'
import {renderRecord} from '../../../lib/output'

export default class ErrorsGroupingRulesCreate extends BaseCommand {
  static description = 'Add a grouping rule: occurrences that match it are grouped under one key'

  static examples = [
    '<%= config.bin %> errors grouping-rules create -p acme-api --field message --operator contains --value "timeout" --fingerprint-key net-timeout',
    '<%= config.bin %> errors grouping-rules create -p acme-api --field culprit --operator starts_with --value "app/jobs/" --fingerprint-key jobs --position 2',
  ]

  static flags = {
    ...projectFlag,
    field: Flags.string({
      description: 'Occurrence field the rule looks at',
      options: [...GROUPING_RULE_FIELDS],
      required: true,
    }),
    operator: Flags.string({
      description: 'How the field is compared (always case-insensitive)',
      options: [...GROUPING_RULE_OPERATORS],
      required: true,
    }),
    value: Flags.string({description: 'Text to compare the field against', required: true}),
    'fingerprint-key': Flags.string({
      description: 'Grouping key: rules sharing it send their occurrences to the same group',
      required: true,
    }),
    position: Flags.integer({description: 'Order of application (lower runs first)'}),
    active: Flags.boolean({allowNo: true, description: 'Whether the rule applies at ingest'}),
  }

  async run(): Promise<unknown> {
    const {flags} = await this.parse(ErrorsGroupingRulesCreate)
    const projectId = await this.resolveProjectId(flags.project)

    const res = await this.api.post<Record<string, unknown>>(
      `/cli/v1/projects/${encodeURIComponent(projectId)}/error_grouping_rules`,
      groupingRuleBody(flags),
    )

    if (!this.jsonEnabled()) {
      this.log('Grouping rule created:')
      this.log(renderRecord(res.data ?? {}))
    }

    return res
  }
}
