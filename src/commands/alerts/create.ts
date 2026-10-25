import {Args, Flags} from '@oclif/core'
import {BaseCommand} from '../../base'
import {ALERT_EVENT_TYPES} from '../../lib/alert-events'
import {renderRecord} from '../../lib/output'

export default class AlertsCreate extends BaseCommand {
  static args = {
    name: Args.string({description: 'Rule name', required: true}),
  }

  static description = 'Create an alert rule in your organization'

  static examples = [
    '<%= config.bin %> alerts create "New errors" --event-type error_new',
    '<%= config.bin %> alerts create "API down" --event-type uptime_down --project acme-api --throttle-minutes 30',
  ]

  static flags = {
    'event-type': Flags.string({description: 'Event that triggers the rule', options: ALERT_EVENT_TYPES, required: true}),
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
    const {args, flags} = await this.parse(AlertsCreate)

    const body: Record<string, unknown> = {name: args.name, event_type: flags['event-type']}
    if (flags['min-level'] !== undefined) body.min_level = flags['min-level']
    if (flags['threshold-ms'] !== undefined) body.threshold_ms = flags['threshold-ms']
    if (flags.threshold !== undefined) body.threshold = flags.threshold
    if (flags.channel !== undefined) body.channel_ids = flags.channel
    if (flags['throttle-minutes'] !== undefined) body.throttle_minutes = flags['throttle-minutes']
    if (flags.enabled !== undefined) body.enabled = flags.enabled
    if (flags.project !== undefined) body.project_id = flags.project
    if (flags.environment !== undefined) body.environment_id = flags.environment

    const res = await this.api.post<Record<string, unknown>>('/cli/v1/alert_rules', body)

    if (!this.jsonEnabled()) {
      this.log('Alert rule created:')
      this.log(renderRecord(res.data ?? {}))
    }

    return res
  }
}
