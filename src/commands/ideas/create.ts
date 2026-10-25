import {Flags} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../base'
import {renderRecord} from '../../lib/output'

export default class IdeasCreate extends BaseCommand {
  static description = 'Propose an idea for a project'

  static examples = [
    '<%= config.bin %> ideas create --project acme-api --title "Dark mode" --problem "The dashboard blinds users at night" --solution "System dark theme" --stakeholders "Mobile team" --stakeholders "Enterprise customers"',
  ]

  static flags = {
    ...projectFlag,
    title: Flags.string({description: 'Idea title', required: true}),
    problem: Flags.string({description: 'Problem or need the idea solves', required: true}),
    solution: Flags.string({description: 'Proposed solution (optional)'}),
    monetization: Flags.string({description: 'How the idea pays off (optional, Markdown)'}),
    risks: Flags.string({description: 'Risks and constraints (optional, Markdown)'}),
    evolves: Flags.string({description: 'Id of the base idea this one evolves (same project; one level only)'}),
    stakeholders: Flags.string({description: 'Who it helps — repeatable (optional)', multiple: true}),
  }

  async run(): Promise<unknown> {
    const {flags} = await this.parse(IdeasCreate)
    const projectId = await this.resolveProjectId(flags.project)
    const res = await this.api.post<Record<string, unknown>>(
      `/cli/v1/projects/${projectId}/ideas`,
      {
        title: flags.title,
        problem: flags.problem,
        solution: flags.solution,
        monetization: flags.monetization,
        risks: flags.risks,
        evolves_id: flags.evolves,
        stakeholders: flags.stakeholders ?? [],
      },
    )

    if (!this.jsonEnabled()) {
      this.log('Idea created:')
      this.log(renderRecord(res.data ?? {}))
    }

    return res
  }
}
