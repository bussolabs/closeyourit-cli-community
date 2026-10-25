import {Args} from '@oclif/core'

import {BaseCommand} from '../../base'
import {renderTable} from '../../lib/output'
import {aggregatedMeta, fetchAllPages} from '../../lib/paginate'

export default class KbAttachments extends BaseCommand {
  static args = {
    id: Args.string({description: 'Knowledge page id', required: true}),
  }

  static description = "List a knowledge page's attachments"

  static examples = [
    '<%= config.bin %> kb attachments <page-id>',
    '<%= config.bin %> kb attachments <page-id> --json',
  ]

  async run(): Promise<unknown> {
    const {args} = await this.parse(KbAttachments)
    // Full list, not just the first page: the command has no --page, so stopping at a hundred
    // attachments would hide the rest with no way to ask for them.
    const attachments = await fetchAllPages(
      this.api,
      `/cli/v1/knowledge/pages/${encodeURIComponent(args.id)}/attachments`,
    )

    if (!this.jsonEnabled()) {
      this.log(
        renderTable(
          ['ID', 'FILENAME', 'CONTENT_TYPE', 'BYTE_SIZE', 'SCRIPT', 'CREATED_AT'],
          attachments.map((attachment) => [
            String(attachment.id ?? ''),
            String(attachment.filename ?? ''),
            String(attachment.content_type ?? ''),
            String(attachment.byte_size ?? ''),
            // The server declares whether the file is a script: knowing you are downloading something
            // executable is the only thing the list can say before the file is on disk.
            attachment.script === undefined ? '' : (attachment.script ? 'yes' : 'no'),
            String(attachment.created_at ?? ''),
          ]),
        ),
      )
    }

    return {data: attachments, meta: aggregatedMeta(attachments.length)}
  }
}
