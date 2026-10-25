import {Args, Flags} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../base'
import {renderRecord} from '../../lib/output'

export default class ErrorsSplit extends BaseCommand {
  static description = 'Split an error group: pull some occurrences out into a new one'

  static examples = [
    '<%= config.bin %> errors split <group-id> --project acme-api --event <event-a> --event <event-b>',
  ]

  static args = {
    id: Args.string({description: 'Error group to split', required: true}),
  }

  static flags = {
    ...projectFlag,
    event: Flags.string({description: 'Occurrence id to pull out (repeatable)', multiple: true, required: true}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(ErrorsSplit)
    const projectId = await this.resolveProjectId(flags.project)

    // Raw ids again: `Errors::Split` refuses the whole split if one occurrence is not in this group,
    // and that refusal is only possible while the list it receives is the list that was written.
    const res = await this.api.post<Record<string, unknown>>(
      `/cli/v1/projects/${encodeURIComponent(projectId)}/error_groups/${encodeURIComponent(args.id)}/split`,
      {event_ids: flags.event},
    )

    if (!this.jsonEnabled()) {
      // Counted off the group that was born, not off the flags that were typed: the server
      // deduplicates the ids it receives, so the same occurrence named twice moves once.
      const moved = Number(res.data?.events_count ?? flags.event.length)
      this.log(
        `Split ${moved} occurrence${moved === 1 ? '' : 's'} out of ${args.id} into a new error group:`,
      )
      this.log(renderRecord(res.data ?? {}))
    }

    return res
  }
}
