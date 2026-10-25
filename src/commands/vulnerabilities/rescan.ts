import {BaseCommand, projectFlag} from '../../base'

export default class VulnerabilitiesRescan extends BaseCommand {
  static aliases = ['vulns:rescan']

  static description = 'Rescan a project now, without waiting for the nightly run'

  static examples = ['<%= config.bin %> vulnerabilities rescan --project acme-api']

  // Required here, unlike the other subcommands: a scan always targets one project.
  static flags = {...projectFlag}

  async run(): Promise<unknown> {
    const {flags} = await this.parse(VulnerabilitiesRescan)
    const projectId = await this.resolveProjectId(flags.project)
    const res = await this.api.post('/cli/v1/vulnerabilities/rescan', {project_id: projectId})

    if (!this.jsonEnabled()) {
      this.log(`Scan queued for project ${flags.project}.`)
    }

    return res
  }
}
