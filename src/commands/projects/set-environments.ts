import {Flags} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../base'

export default class ProjectsSetEnvironments extends BaseCommand {
  static description = 'Declare the environments a project receives data from (replaces the current set)'

  static examples = [
    '<%= config.bin %> projects set-environments --project legalbloom-rails --code production',
    '<%= config.bin %> projects set-environments -p LBRA --code production --code staging',
  ]

  static flags = {
    ...projectFlag,
    code: Flags.string({
      description: 'Environment code, e.g. production (repeatable)',
      multiple: true,
      default: [],
    }),
    'environment-id': Flags.string({
      description: 'Environment id / UUID (repeatable)',
      multiple: true,
      default: [],
    }),
  }

  async run(): Promise<unknown> {
    const {flags} = await this.parse(ProjectsSetEnvironments)
    const projectId = await this.resolveProjectId(flags.project)

    const res = await this.api.put<Array<{code: string; label?: string}>>(
      `/cli/v1/projects/${projectId}/environments`,
      {codes: flags.code, environment_ids: flags['environment-id']},
    )
    const envs = res.data ?? []

    if (!this.jsonEnabled()) {
      if (envs.length === 0) {
        this.log('Project now declares no environments.')
      } else {
        this.log('Declared environments:')
        for (const e of envs) this.log(`  ${e.code}${e.label ? ` — ${e.label}` : ''}`)
      }
    }

    return res
  }
}
