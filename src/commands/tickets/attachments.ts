import {Args} from '@oclif/core'

import {BaseCommand, projectFlag} from '../../base'
import {renderTable} from '../../lib/output'

export default class TicketsAttachments extends BaseCommand {
  static args = {
    id: Args.string({description: 'Ticket id', required: true}),
  }

  static description = "List a ticket's attachments"

  static examples = [
    '<%= config.bin %> tickets attachments <ticket-id> --project acme-api',
    '<%= config.bin %> tickets attachments <ticket-id> -p acme-api --json',
  ]

  static flags = {...projectFlag}

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(TicketsAttachments)
    const projectId = await this.resolveProjectId(flags.project)
    const res = await this.api.get<Array<Record<string, unknown>>>(
      `/cli/v1/projects/${encodeURIComponent(projectId)}/tickets/${encodeURIComponent(args.id)}/attachments?per=100`,
    )
    const attachments = res.data ?? []

    if (!this.jsonEnabled()) {
      this.log(
        renderTable(
          ['ID', 'FILENAME', 'CONTENT_TYPE', 'BYTE_SIZE', 'CREATED_AT'],
          attachments.map((attachment) => [
            String(attachment.id ?? ''),
            String(attachment.filename ?? ''),
            String(attachment.content_type ?? ''),
            String(attachment.byte_size ?? ''),
            String(attachment.created_at ?? ''),
          ]),
        ),
      )
    }

    return res
  }
}
