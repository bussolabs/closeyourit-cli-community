import {writeFile} from 'node:fs/promises'
import {basename, join} from 'node:path'

import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../base'

export default class KbAttachmentDownload extends BaseCommand {
  static args = {
    id: Args.string({description: 'Knowledge page id', required: true}),
    attachment: Args.string({description: 'Attachment id', required: true}),
  }

  // The server delivers the binary with a neutral type and attachment disposition: the file lands on
  // disk and that is it, no channel opens or runs it on behalf of whoever downloads it.
  static description = "Download a knowledge page's attachment to disk"

  static examples = [
    '<%= config.bin %> kb attachment-download <page-id> <attachment-id>',
    '<%= config.bin %> kb attachment-download <page-id> <attachment-id> --out ./downloads',
  ]

  static flags = {
    out: Flags.string({default: '.', description: 'Output directory'}),
    filename: Flags.string({description: 'Override the output filename'}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(KbAttachmentDownload)

    const {data, filename} = await this.api.download(
      `/cli/v1/knowledge/pages/${encodeURIComponent(args.id)}/attachments/${encodeURIComponent(args.attachment)}/download`,
    )

    // The name coming from the server is reduced to its last segment: a `filename` with separators
    // inside, read from Content-Disposition, would write outside --out instead of inside. Not so for
    // `--filename`: that one is written by whoever runs the command, who chooses where the file goes.
    const name = flags.filename ?? (filename === undefined ? args.attachment : basename(filename))
    const dest = join(flags.out, name)
    await writeFile(dest, data)

    if (!this.jsonEnabled()) {
      this.log(`Saved ${data.byteLength} bytes → ${dest}`)
    }

    return {bytes: data.byteLength, filename: name, path: dest}
  }
}
