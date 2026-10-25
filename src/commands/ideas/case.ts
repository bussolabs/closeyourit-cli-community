import {Args, Flags} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../base'
import {renderRecord} from '../../lib/output'

export default class IdeasCase extends BaseCommand {
  // POST /cli/v1/projects/:p/ideas/:id/cases maps to Ideas::AddCase. A case is an example/scenario
  // (title + description) — content of the idea, added one at a time like comments. Only open ideas
  // accept cases; same gate as editing the idea (author, otherwise `ideas.edit`).
  static args = {
    id: Args.string({description: 'Idea id', required: true}),
  }

  static description = 'Add a case (example/scenario) to an idea (only open ideas accept cases)'

  static examples = [
    '<%= config.bin %> ideas case <idea-id> --project acme-api --title "QR check-in" --description "Staff scans the QR at the door"',
  ]

  static flags = {
    ...projectFlag,
    title: Flags.string({description: 'Case title', required: true}),
    description: Flags.string({description: 'Case description (optional)'}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(IdeasCase)
    const projectId = await this.resolveProjectId(flags.project)
    const res = await this.api.post<Record<string, unknown>>(
      `/cli/v1/projects/${projectId}/ideas/${args.id}/cases`,
      {title: flags.title, description: flags.description},
    )

    if (!this.jsonEnabled()) {
      this.log('Case added:')
      this.log(renderRecord(res.data ?? {}))
    }

    return res
  }
}
