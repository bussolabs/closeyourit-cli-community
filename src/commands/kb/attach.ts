import {readFile} from 'node:fs/promises'
import {basename} from 'node:path'
import {Args, Flags} from '@oclif/core'
import {BaseCommand} from '../../base'
import type {UploadFile} from '../../lib/api'
import {renderTable} from '../../lib/output'

export default class KbAttach extends BaseCommand {
  static description = 'Attach one or more local files to a knowledge page'

  static examples = [
    '<%= config.bin %> kb attach <page-id> --file ./rollback.sh',
    '<%= config.bin %> kb attach <page-id> --file ./diagram.png --file ./checklist.pdf',
  ]

  static args = {
    id: Args.string({description: 'Knowledge page id', required: true}),
  }

  static flags = {
    file: Flags.string({description: 'Path to a local file to upload (repeatable)', multiple: true, required: true}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(KbAttach)

    // All files are read BEFORE uploading any: the server rejects the whole batch if one file is not
    // allowed, and a wrong path must stop the command the same way — not halfway through.
    const files: UploadFile[] = []
    for (const path of flags.file) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const buf = await readFile(path)
        files.push({field: 'files[]', filename: basename(path), data: new Blob([buf])})
      } catch {
        this.error(`File not found or unreadable: ${path}`, {exit: 2})
      }
    }

    const res = await this.api.upload<Array<Record<string, unknown>>>(
      'POST',
      `/cli/v1/knowledge/pages/${encodeURIComponent(args.id)}/attachments`,
      files,
    )
    const attachments = res.data ?? []

    if (!this.jsonEnabled()) {
      this.log(`Attached ${files.length} file${files.length === 1 ? '' : 's'} to knowledge page ${args.id}:`)
      this.log(
        renderTable(
          ['ID', 'FILENAME', 'CONTENT_TYPE', 'BYTE_SIZE'],
          attachments.map((attachment) => [
            String(attachment.id ?? ''),
            String(attachment.filename ?? ''),
            String(attachment.content_type ?? ''),
            String(attachment.byte_size ?? ''),
          ]),
        ),
      )
    }

    return res
  }
}
