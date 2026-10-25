import {Args, Flags} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../../base'
import {GROUPING_RULE_FIELDS, GROUPING_RULE_OPERATORS, groupingRuleBody} from '../../../lib/grouping-rules'
import {renderRecord} from '../../../lib/output'

export default class ErrorsGroupingRulesUpdate extends BaseCommand {
  static description = 'Change a grouping rule: what it matches, where it sends, when it runs, or turn it off'

  static examples = [
    '<%= config.bin %> errors grouping-rules update <rule-id> -p acme-api --value "connection reset"',
    '<%= config.bin %> errors grouping-rules update <rule-id> -p acme-api --position 0',
    '<%= config.bin %> errors grouping-rules update <rule-id> -p acme-api --no-active',
  ]

  static args = {
    id: Args.string({description: 'Grouping rule id', required: true}),
  }

  static flags = {
    ...projectFlag,
    field: Flags.string({description: 'Occurrence field the rule looks at', options: [...GROUPING_RULE_FIELDS]}),
    operator: Flags.string({description: 'How the field is compared', options: [...GROUPING_RULE_OPERATORS]}),
    value: Flags.string({description: 'Text to compare the field against'}),
    'fingerprint-key': Flags.string({description: 'Grouping key the matching occurrences land on'}),
    position: Flags.integer({description: 'Order of application (lower runs first)'}),
    active: Flags.boolean({allowNo: true, description: 'Whether the rule applies at ingest'}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(ErrorsGroupingRulesUpdate)
    const body = groupingRuleBody(flags)

    // An empty PATCH would come back 200 with the rule untouched, and the command would announce an
    // update that never happened. Say it before the call instead.
    if (Object.keys(body).length === 0) {
      this.error(
        'Nothing to update: pass at least one of --field, --operator, --value, --fingerprint-key, --position, --active/--no-active.',
        {exit: 2},
      )
    }

    const projectId = await this.resolveProjectId(flags.project)
    const res = await this.api.put<Record<string, unknown>>(
      `/cli/v1/projects/${encodeURIComponent(projectId)}/error_grouping_rules/${encodeURIComponent(args.id)}`,
      body,
    )

    if (!this.jsonEnabled()) {
      this.log('Grouping rule updated:')
      this.log(renderRecord(res.data ?? {}))
    }

    return res
  }
}
