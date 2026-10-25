import {Flags} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../base'

export default class ProjectsDelete extends BaseCommand {
  static description = 'Delete a project (irreversible)'

  static examples = ['<%= config.bin %> projects delete --project LBRA --confirm']

  static flags = {
    ...projectFlag,
    confirm: Flags.boolean({description: 'Required: confirm the irreversible deletion'}),
  }

  async run(): Promise<unknown> {
    const {flags} = await this.parse(ProjectsDelete)

    if (!flags.confirm) {
      this.error('Refusing to delete without --confirm (the action is irreversible).', {exit: 2})
    }

    const projectId = await this.resolveProjectId(flags.project)
    await this.api.delete(`/cli/v1/projects/${projectId}`)

    if (!this.jsonEnabled()) this.log(`Deleted project ${flags.project}`)

    return {deleted: projectId}
  }
}
