import {BaseCommand, projectFlag} from '../../base'
import {renderGuidance} from '../../lib/guidance'

export default class GuidanceShow extends BaseCommand {
  static description =
    "Show a project's effective guidance: the references and procedures resolved by the backend (the CLI never recomposes inheritance)"

  static examples = [
    '<%= config.bin %> guidance show --project legalbloom-rails',
    '<%= config.bin %> guidance show -p LBRA',
    '<%= config.bin %> guidance show -p LBRA --json',
  ]

  static flags = {...projectFlag}

  async run(): Promise<unknown> {
    const {flags} = await this.parse(GuidanceShow)
    const projectId = await this.resolveProjectId(flags.project)
    // The backend hands back the already-resolved guidance ({references, procedures}); the CLI only
    // renders it. JSON stays the raw backend payload, so machine consumers get the full contract.
    const res = await this.api.get<Record<string, unknown>>(`/cli/v1/projects/${projectId}/guidance`)

    if (!this.jsonEnabled()) {
      const rendered = renderGuidance(res.data ?? {})
      this.log(rendered || 'No guidance configured for this project.')
    }

    return res
  }
}
