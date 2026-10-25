import {Args, Flags} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../base'
import {renderRecord} from '../../lib/output'

export default class IdeasUpdate extends BaseCommand {
  // PUT /cli/v1/projects/:p/ideas/:id maps to Ideas::UpdateIdea, a full replace of
  // title/problem/solution: fields you omit are cleared server-side (omitting problem or title → 422,
  // fail-safe). stakeholders are replaced only when provided (kept if omitted). Only open ideas can be
  // edited; the author edits their own, otherwise `ideas.edit` on the project is required.
  // monetization/risks behave like stakeholders: replaced only when provided, kept if omitted.
  static description = 'Update an idea (full replace of title/problem/solution — omitted fields are cleared)'

  static examples = [
    '<%= config.bin %> ideas update <idea-id> --project acme-api --title "Referral" --problem "Growth is paid-only" --solution "Tracked invites" --stakeholders "Growth" --stakeholders "Backend"',
  ]

  static args = {
    id: Args.string({description: 'Idea id', required: true}),
  }

  static flags = {
    ...projectFlag,
    title: Flags.string({description: 'Idea title'}),
    problem: Flags.string({description: 'Problem or need the idea solves'}),
    solution: Flags.string({description: 'Proposed solution (cleared if omitted)'}),
    monetization: Flags.string({description: 'How the idea pays off (replaced only when provided)'}),
    risks: Flags.string({description: 'Risks and constraints (replaced only when provided)'}),
    stakeholders: Flags.string({description: 'Who it helps — repeatable (replaced only when provided)', multiple: true}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(IdeasUpdate)
    const projectId = await this.resolveProjectId(flags.project)

    const body: Record<string, unknown> = {}
    if (flags.title !== undefined) body.title = flags.title
    if (flags.problem !== undefined) body.problem = flags.problem
    if (flags.solution !== undefined) body.solution = flags.solution
    if (flags.monetization !== undefined) body.monetization = flags.monetization
    if (flags.risks !== undefined) body.risks = flags.risks
    if (flags.stakeholders !== undefined) body.stakeholders = flags.stakeholders

    const res = await this.api.put<Record<string, unknown>>(
      `/cli/v1/projects/${projectId}/ideas/${args.id}`,
      body,
    )

    if (!this.jsonEnabled()) {
      this.log('Idea updated:')
      this.log(renderRecord(res.data ?? {}))
    }

    return res
  }
}
