import {Args, Flags} from '@oclif/core'
import {BaseCommand} from '../../base'
import {ALERT_EVENT_TYPES} from '../../lib/alert-events'
import {renderRecord} from '../../lib/output'

export default class AlertsUpdate extends BaseCommand {
  static args = {
    id: Args.string({description: 'Alert rule id', required: true}),
  }

  static description =
    'Update an alert rule. Only the flags you pass are sent; everything else is left untouched.'

  static examples = [
    '<%= config.bin %> alerts update <rule-id> --name "Critical errors"',
    '<%= config.bin %> alerts update <rule-id> --no-enabled',
    '<%= config.bin %> alerts update <rule-id> --project ""   # clear the project scope',
  ]

  static flags = {
    name: Flags.string({description: 'Rule name'}),
    'event-type': Flags.string({description: 'Event that triggers the rule', options: ALERT_EVENT_TYPES}),
    'min-level': Flags.string({description: 'Minimum error level that triggers the rule'}),
    'threshold-ms': Flags.integer({description: 'Duration threshold in milliseconds (metric rules)'}),
    threshold: Flags.integer({description: 'Server threshold: percent for cpu/mem/disk, °C for temp'}),
    channel: Flags.string({description: 'External channel id to deliver to (repeatable; REPLACES the set)', multiple: true}),
    'throttle-minutes': Flags.integer({description: 'Minimum minutes between notifications'}),
    enabled: Flags.boolean({allowNo: true, description: 'Whether the rule is enabled'}),
    project: Flags.string({description: 'Scope the rule to a project id (UUID)'}),
    environment: Flags.string({description: 'Scope the rule to an environment id (UUID)'}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(AlertsUpdate)

    // Only the flags actually passed go into the body: the backend leaves out what it does not receive,
    // so a partial update never clears scope, level or threshold (CYCL-62). An empty value clears a field.
    const body: Record<string, unknown> = {}
    if (flags.name !== undefined) body.name = flags.name
    if (flags['event-type'] !== undefined) body.event_type = flags['event-type']
    if (flags['min-level'] !== undefined) body.min_level = flags['min-level']
    if (flags['threshold-ms'] !== undefined) body.threshold_ms = flags['threshold-ms']
    if (flags.threshold !== undefined) body.threshold = flags.threshold
    if (flags.channel !== undefined) body.channel_ids = flags.channel
    if (flags['throttle-minutes'] !== undefined) body.throttle_minutes = flags['throttle-minutes']
    if (flags.enabled !== undefined) body.enabled = flags.enabled
    if (flags.project !== undefined) body.project_id = flags.project
    if (flags.environment !== undefined) body.environment_id = flags.environment

    const res = await this.api.put<Record<string, unknown>>(
      `/cli/v1/alert_rules/${encodeURIComponent(args.id)}`,
      body,
    )

    if (!this.jsonEnabled()) {
      this.log('Alert rule updated:')
      this.log(renderRecord(res.data ?? {}))
    }

    return res
  }
}
