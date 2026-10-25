import {Args, Flags} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../base'
import {renderRecord} from '../../lib/output'

export default class IdeasLink extends BaseCommand {
  // POST /cli/v1/projects/:p/ideas/:id/links maps to Ideas::LinkIdeas. `related` links two ideas as
  // peers (one row per pair, read from both sides); `evolution` makes <id> the evolution of <target>
  // (one level only: an evolution cannot evolve, a base cannot become an evolution). Same gate as
  // editing the idea (author, otherwise `ideas.edit`). Both ideas must belong to the same project.
  static args = {
    id: Args.string({description: 'Idea id', required: true}),
    target: Args.string({description: 'Other idea id (same project)', required: true}),
  }

  static description = 'Link an idea to another one of the same project (related peers, or as its evolution)'

  static examples = [
    '<%= config.bin %> ideas link <idea-id> <other-idea-id> --project acme-api',
    '<%= config.bin %> ideas link <idea-id> <base-idea-id> --project acme-api --kind evolution',
  ]

  static flags = {
    ...projectFlag,
    kind: Flags.string({
      description: 'related = peers · evolution = <id> evolves <target>',
      options: ['related', 'evolution'],
      default: 'related',
    }),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(IdeasLink)
    const projectId = await this.resolveProjectId(flags.project)
    const res = await this.api.post<Record<string, unknown>>(
      `/cli/v1/projects/${projectId}/ideas/${args.id}/links`,
      {target_id: args.target, kind: flags.kind},
    )

    if (!this.jsonEnabled()) {
      this.log(`Linked (${flags.kind}):`)
      const {problem, solution, monetization, risks, ...fields} = res.data ?? {}
      this.log(renderRecord(fields))
    }

    return res
  }
}
