import {Args, Flags} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../base'
import {renderRecord} from '../../lib/output'

export default class MonitorsUpdate extends BaseCommand {
  static description = 'Update an uptime monitor (URL, method, interval, expected status, timeout)'

  static examples = [
    '<%= config.bin %> monitors update <monitor-id> --project acme-api --interval-seconds 120',
    '<%= config.bin %> monitors update <monitor-id> -p acme-api --url https://acme.example.com/health --expected-status 204',
  ]

  static args = {
    id: Args.string({description: 'Monitor id', required: true}),
  }

  static flags = {
    ...projectFlag,
    url: Flags.string({description: 'URL to probe'}),
    'http-method': Flags.string({description: 'HTTP method'}),
    'interval-seconds': Flags.integer({description: 'Seconds between checks'}),
    'expected-status': Flags.integer({description: 'Expected HTTP status code'}),
    'timeout-seconds': Flags.integer({description: 'Request timeout in seconds'}),
    'expected-body-keyword': Flags.string({description: 'Keyword expected in the response body (check fails without it; not with HEAD)'}),
    'ssl-expiry-warn-days': Flags.integer({description: 'Alert when the TLS certificate has at most N days left (empty = off)'}),
    'group-id': Flags.string({description: 'Uptime group id to attach the monitor to (org-level)'}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(MonitorsUpdate)
    const projectId = await this.resolveProjectId(flags.project)

    const body: Record<string, unknown> = {}
    if (flags.url !== undefined) body.url = flags.url
    if (flags['http-method'] !== undefined) body.http_method = flags['http-method']
    if (flags['interval-seconds'] !== undefined) body.interval_seconds = flags['interval-seconds']
    if (flags['expected-status'] !== undefined) body.expected_status = flags['expected-status']
    if (flags['timeout-seconds'] !== undefined) body.timeout_seconds = flags['timeout-seconds']
    if (flags['expected-body-keyword'] !== undefined) body.expected_body_keyword = flags['expected-body-keyword']
    if (flags['ssl-expiry-warn-days'] !== undefined) body.ssl_expiry_warn_days = flags['ssl-expiry-warn-days']
    if (flags['group-id'] !== undefined) body.group_id = flags['group-id']

    const res = await this.api.put<Record<string, unknown>>(
      `/cli/v1/projects/${encodeURIComponent(projectId)}/monitors/${encodeURIComponent(args.id)}`,
      body,
    )

    if (!this.jsonEnabled()) {
      this.log('Monitor updated:')
      this.log(renderRecord(res.data ?? {}))
    }

    return res
  }
}
