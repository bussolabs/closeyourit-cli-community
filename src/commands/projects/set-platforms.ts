import {Flags} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../base'

export default class ProjectsSetPlatforms extends BaseCommand {
  static description = 'Declare the platforms of a project (replaces the current set)'

  static examples = [
    '<%= config.bin %> projects set-platforms --project legalbloom-rails --code web',
    '<%= config.bin %> projects set-platforms -p LBRA --code web --code ios',
  ]

  static flags = {
    ...projectFlag,
    code: Flags.string({
      description: 'Platform code, e.g. web (repeatable)',
      multiple: true,
      default: [],
    }),
    'platform-id': Flags.string({
      description: 'Platform id / UUID (repeatable)',
      multiple: true,
      default: [],
    }),
  }

  async run(): Promise<unknown> {
    const {flags} = await this.parse(ProjectsSetPlatforms)
    const projectId = await this.resolveProjectId(flags.project)

    const res = await this.api.put<Array<{code: string; label?: string}>>(
      `/cli/v1/projects/${projectId}/platforms`,
      {codes: flags.code, platform_ids: flags['platform-id']},
    )
    const platforms = res.data ?? []

    if (!this.jsonEnabled()) {
      if (platforms.length === 0) {
        this.log('Project now declares no platforms.')
      } else {
        this.log('Declared platforms:')
        for (const p of platforms) this.log(`  ${p.code}${p.label ? ` — ${p.label}` : ''}`)
      }
    }

    return res
  }
}
