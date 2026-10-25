import {readFile} from 'node:fs/promises'
import {basename} from 'node:path'
import {Args, Flags} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../base'
import type {UploadFile} from '../../lib/api'
import {renderTable} from '../../lib/output'

export default class TicketsAttach extends BaseCommand {
  static description = 'Attach one or more local files to a ticket'

  static examples = [
    '<%= config.bin %> tickets attach <ticket-id> --project acme-api --file ./screenshot.png',
    '<%= config.bin %> tickets attach <ticket-id> -p acme-api --file ./log.txt --file ./trace.json',
  ]

  static args = {
    id: Args.string({description: 'Ticket id', required: true}),
  }

  static flags = {
    ...projectFlag,
    file: Flags.string({description: 'Path to a local file to upload (repeatable)', multiple: true, required: true}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(TicketsAttach)
    const projectId = await this.resolveProjectId(flags.project)

    const files: UploadFile[] = []
    for (const path of flags.file) {
      try {
        const buf = await readFile(path)
        files.push({field: 'files[]', filename: basename(path), data: new Blob([buf])})
      } catch {
        this.error(`File not found or unreadable: ${path}`, {exit: 2})
      }
    }

    const res = await this.api.upload<Array<Record<string, unknown>>>(
      'POST',
      `/cli/v1/projects/${encodeURIComponent(projectId)}/tickets/${encodeURIComponent(args.id)}/attachments`,
      files,
    )
    const attachments = res.data ?? []

    if (!this.jsonEnabled()) {
      this.log(`Attached ${files.length} file${files.length === 1 ? '' : 's'} to ticket ${args.id}:`)
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
