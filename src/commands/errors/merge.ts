import {Args, Flags} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../base'
import {renderRecord} from '../../lib/output'

export default class ErrorsMerge extends BaseCommand {
  static description = 'Merge error groups into one: the occurrences move, the absorbed groups disappear (irreversible)'

  static examples = [
    '<%= config.bin %> errors merge <primary-id> --project acme-api --group <duplicate-a> --group <duplicate-b> --confirm',
  ]

  static args = {
    id: Args.string({description: 'Error group that keeps everything (the primary)', required: true}),
  }

  static flags = {
    ...projectFlag,
    group: Flags.string({description: 'Error group to absorb (repeatable)', multiple: true, required: true}),
    confirm: Flags.boolean({description: 'Required: confirm the irreversible merge'}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(ErrorsMerge)

    if (!flags.confirm) {
      this.error('Refusing to merge without --confirm (the action is irreversible).', {exit: 2})
    }

    const projectId = await this.resolveProjectId(flags.project)

    // The ids travel raw — not deduplicated, not filtered, not looked up first. All-or-nothing is
    // the server's to keep (`Errors::Merge#resolve_sources!`): one id it cannot find in the project
    // aborts the whole merge. Tidying the list here would hand it a set it can always resolve, so
    // the groups it did find would be merged and the rest silently forgotten — on an operation
    // nothing can undo.
    const res = await this.api.post<Record<string, unknown>>(
      `/cli/v1/projects/${encodeURIComponent(projectId)}/error_groups/${encodeURIComponent(args.id)}/merge`,
      {ids: flags.group},
    )

    if (!this.jsonEnabled()) {
      const merged = res.meta?.merged
      this.log(`Merged ${merged ?? flags.group.length} error groups into ${args.id}:`)
      this.log(renderRecord(res.data ?? {}))
    }

    return res
  }
}
