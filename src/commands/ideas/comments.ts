import {Args} from '@oclif/core'

import {BaseCommand, projectFlag} from '../../base'
import {sanitize, sanitizeMultiline} from '../../lib/output'

export default class IdeasComments extends BaseCommand {
  static args = {
    id: Args.string({description: 'Idea id', required: true}),
  }

  static description = 'List all comments of an idea (oldest first)'

  static examples = [
    '<%= config.bin %> ideas comments <idea-id> --project acme-api',
    '<%= config.bin %> ideas comments <idea-id> -p acme-api --json',
  ]

  static flags = {...projectFlag}

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(IdeasComments)
    const projectId = await this.resolveProjectId(flags.project)
    const base = `/cli/v1/projects/${encodeURIComponent(projectId)}/ideas/${encodeURIComponent(args.id)}/comments`

    // Read every page so `comments` returns the full discussion, not just the first page.
    const all: Array<Record<string, unknown>> = []
    let page = 1
    let totalPages = 1
    do {
      // eslint-disable-next-line no-await-in-loop
      const res = await this.api.get<Array<Record<string, unknown>>>(`${base}?page=${page}&per=100`)
      all.push(...(res.data ?? []))
      totalPages = Number(res.meta?.total_pages ?? 1)
      page += 1
    } while (page <= totalPages)

    if (!this.jsonEnabled()) {
      if (all.length === 0) {
        this.log('(nessun commento)')
      } else {
        for (const comment of all) {
          this.log(
            `\n── ${sanitize(comment.author ?? '?')} · ${sanitize(comment.created_at ?? '')} · ${sanitize(comment.id ?? '')}`,
          )
          this.log(sanitizeMultiline(comment.body ?? ''))
        }
      }
    }

    return {data: all}
  }
}
