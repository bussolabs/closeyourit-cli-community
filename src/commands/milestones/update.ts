import {Args, Flags} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../base'
import {renderRecord} from '../../lib/output'

export default class MilestonesUpdate extends BaseCommand {
  static description = 'Update a milestone (send only the fields you want to change)'

  static examples = [
    '<%= config.bin %> milestones update <milestone-id> --project acme-api --label "Version 1.1"',
    '<%= config.bin %> milestones update <milestone-id> -p acme-api --due-on 2027-01-15 --no-active',
  ]

  static args = {
    id: Args.string({description: 'Milestone id', required: true}),
  }

  static flags = {
    ...projectFlag,
    code: Flags.string({description: 'Milestone code (short identifier)'}),
    label: Flags.string({description: 'Human-readable label'}),
    color: Flags.string({description: 'Color label'}),
    'due-on': Flags.string({description: 'Due date (YYYY-MM-DD)'}),
    active: Flags.boolean({allowNo: true, description: 'Whether the milestone is active'}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(MilestonesUpdate)
    const projectId = await this.resolveProjectId(flags.project)

    const body: Record<string, unknown> = {}
    if (flags.code !== undefined) body.code = flags.code
    if (flags.label !== undefined) body.label = flags.label
    if (flags.color !== undefined) body.color = flags.color
    if (flags['due-on'] !== undefined) body.due_on = flags['due-on']
    if (flags.active !== undefined) body.active = flags.active

    const res = await this.api.put<Record<string, unknown>>(
      `/cli/v1/projects/${encodeURIComponent(projectId)}/milestones/${encodeURIComponent(args.id)}`,
      body,
    )

    if (!this.jsonEnabled()) {
      this.log('Milestone updated:')
      this.log(renderRecord(res.data ?? {}))
    }

    return res
  }
}
