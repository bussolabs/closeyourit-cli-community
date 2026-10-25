import {Flags} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../base'
import {renderRecord} from '../../lib/output'

export default class MilestonesCreate extends BaseCommand {
  static description = 'Create a milestone for a project'

  static examples = [
    '<%= config.bin %> milestones create --project acme-api --code v1 --label "Version 1.0"',
    '<%= config.bin %> milestones create -p acme-api --code v1 --label "Version 1.0" --due-on 2026-12-31',
  ]

  static flags = {
    ...projectFlag,
    code: Flags.string({description: 'Milestone code (short identifier)', required: true}),
    label: Flags.string({description: 'Human-readable label', required: true}),
    color: Flags.string({description: 'Color label'}),
    'due-on': Flags.string({description: 'Due date (YYYY-MM-DD)'}),
    active: Flags.boolean({allowNo: true, description: 'Whether the milestone is active'}),
  }

  async run(): Promise<unknown> {
    const {flags} = await this.parse(MilestonesCreate)
    const projectId = await this.resolveProjectId(flags.project)

    const body: Record<string, unknown> = {code: flags.code, label: flags.label}
    if (flags.color !== undefined) body.color = flags.color
    if (flags['due-on'] !== undefined) body.due_on = flags['due-on']
    if (flags.active !== undefined) body.active = flags.active

    const res = await this.api.post<Record<string, unknown>>(
      `/cli/v1/projects/${encodeURIComponent(projectId)}/milestones`,
      body,
    )

    if (!this.jsonEnabled()) {
      this.log('Milestone created:')
      this.log(renderRecord(res.data ?? {}))
    }

    return res
  }
}
