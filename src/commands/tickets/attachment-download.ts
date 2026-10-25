import {writeFile} from 'node:fs/promises'
import {join} from 'node:path'

import {Args, Flags} from '@oclif/core'

import {BaseCommand, projectFlag} from '../../base'

export default class TicketsAttachmentDownload extends BaseCommand {
  static args = {
    id: Args.string({description: 'Ticket id or code (e.g. DRFL-3)', required: true}),
    attachment: Args.string({description: 'Attachment id (ticket attachment or comment file)', required: true}),
  }

  static description = 'Download a ticket binary to disk: works for ticket attachments AND files attached to its comments'

  static examples = [
    '<%= config.bin %> tickets attachment-download <ticket-id> <attachment-id> --project acme-api',
    '<%= config.bin %> tickets attachment-download <ticket-id> <attachment-id> -p acme-api --out ./downloads',
  ]

  static flags = {
    ...projectFlag,
    out: Flags.string({default: '.', description: 'Output directory'}),
    filename: Flags.string({description: 'Override the output filename'}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(TicketsAttachmentDownload)
    const projectId = await this.resolveProjectId(flags.project)

    const {data, filename} = await this.api.download(
      `/cli/v1/projects/${encodeURIComponent(projectId)}/tickets/${encodeURIComponent(args.id)}/attachments/${encodeURIComponent(args.attachment)}/download`,
    )

    const name = flags.filename ?? filename ?? args.attachment
    const dest = join(flags.out, name)
    await writeFile(dest, data)

    if (!this.jsonEnabled()) {
      this.log(`Saved ${data.byteLength} bytes → ${dest}`)
    }

    return {bytes: data.byteLength, filename: name, path: dest}
  }
}
