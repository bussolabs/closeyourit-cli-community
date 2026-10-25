import {Flags} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../base'
import {renderRecord} from '../../lib/output'

export default class MonitorsCreate extends BaseCommand {
  static description = 'Create an uptime monitor for a project (one per environment)'

  static examples = [
    '<%= config.bin %> monitors create --project acme-api --url https://acme.example.com/up',
    '<%= config.bin %> monitors create -p acme-api --url https://acme.example.com/up --environment <env-id> --interval-seconds 60 --expected-status 200',
  ]

  static flags = {
    ...projectFlag,
    url: Flags.string({description: 'URL to probe', required: true}),
    environment: Flags.string({description: 'Environment id (must be declared by the project)'}),
    'http-method': Flags.string({description: 'HTTP method (default GET)'}),
    'interval-seconds': Flags.integer({description: 'Seconds between checks'}),
    'expected-status': Flags.integer({description: 'Expected HTTP status code'}),
    'timeout-seconds': Flags.integer({description: 'Request timeout in seconds'}),
    'expected-body-keyword': Flags.string({description: 'Keyword expected in the response body (check fails without it; not with HEAD)'}),
    'ssl-expiry-warn-days': Flags.integer({description: 'Alert when the TLS certificate has at most N days left (empty = off)'}),
    'group-id': Flags.string({description: 'Uptime group id to attach the monitor to (org-level)'}),
  }

  async run(): Promise<unknown> {
    const {flags} = await this.parse(MonitorsCreate)
    const projectId = await this.resolveProjectId(flags.project)

    const body: Record<string, unknown> = {url: flags.url}
    if (flags.environment !== undefined) body.environment_id = flags.environment
    if (flags['http-method'] !== undefined) body.http_method = flags['http-method']
    if (flags['interval-seconds'] !== undefined) body.interval_seconds = flags['interval-seconds']
    if (flags['expected-status'] !== undefined) body.expected_status = flags['expected-status']
    if (flags['timeout-seconds'] !== undefined) body.timeout_seconds = flags['timeout-seconds']
    if (flags['expected-body-keyword'] !== undefined) body.expected_body_keyword = flags['expected-body-keyword']
    if (flags['ssl-expiry-warn-days'] !== undefined) body.ssl_expiry_warn_days = flags['ssl-expiry-warn-days']
    if (flags['group-id'] !== undefined) body.group_id = flags['group-id']

    const res = await this.api.post<Record<string, unknown>>(
      `/cli/v1/projects/${encodeURIComponent(projectId)}/monitors`,
      body,
    )

    if (!this.jsonEnabled()) {
      this.log('Monitor created:')
      this.log(renderRecord(res.data ?? {}))
    }

    return res
  }
}
