import {Flags} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../base'
import {renderRecord} from '../../lib/output'

export default class ProjectsGithubUpdate extends BaseCommand {
  static description =
    'Update a project GitHub binding rules (environment mapping + sync/binding/autoclose flags); only the passed fields change'

  static examples = [
    '<%= config.bin %> projects github-update -p LBRA --production-environment-id <env-uuid>',
    '<%= config.bin %> projects github-update -p LBRA --no-tag-binding-enabled',
    '<%= config.bin %> projects github-update -p LBRA --default-branch main --autoclose-on-merge',
    '<%= config.bin %> projects github-update -p LBRA --sync-secrets',
  ]

  static flags = {
    ...projectFlag,
    'default-branch': Flags.string({description: 'Default base branch used to create branches/PRs'}),
    'production-environment-id': Flags.string({
      description: 'Environment id mapped to STABLE tags (production target)',
    }),
    'staging-environment-id': Flags.string({
      description: 'Environment id mapped to PRE-RELEASE tags (staging target)',
    }),
    'preview-environment-id': Flags.string({
      description: 'Environment id mapped to the preview secrets-sync slot (ephemeral per-PR environments)',
    }),
    'sync-enabled': Flags.boolean({allowNo: true, description: 'Enable/disable processing of webhook events'}),
    'tag-binding-enabled': Flags.boolean({allowNo: true, description: 'Enable/disable tag→release live binding'}),
    'autoclose-on-merge': Flags.boolean({
      allowNo: true,
      description: 'Enable/disable moving the ticket to done on PR merge',
    }),
    'sync-secrets': Flags.boolean({
      allowNo: true,
      description: 'Enable/disable pushing vault secrets to the GitHub Environment secrets (SECRETS_JSON)',
    }),
  }

  async run(): Promise<unknown> {
    const {flags} = await this.parse(ProjectsGithubUpdate)
    const projectId = await this.resolveProjectId(flags.project)

    const body: Record<string, unknown> = {}
    if (flags['default-branch'] !== undefined) body.default_branch = flags['default-branch']
    if (flags['production-environment-id'] !== undefined) body.production_environment_id = flags['production-environment-id']
    if (flags['staging-environment-id'] !== undefined) body.staging_environment_id = flags['staging-environment-id']
    if (flags['preview-environment-id'] !== undefined) body.preview_environment_id = flags['preview-environment-id']
    if (flags['sync-enabled'] !== undefined) body.sync_enabled = flags['sync-enabled']
    if (flags['tag-binding-enabled'] !== undefined) body.tag_binding_enabled = flags['tag-binding-enabled']
    if (flags['autoclose-on-merge'] !== undefined) body.autoclose_on_merge = flags['autoclose-on-merge']
    if (flags['sync-secrets'] !== undefined) body.sync_secrets = flags['sync-secrets']

    // The GitHub action responds to both PATCH and PUT (Rails singleton `resource` update); the CLI
    // transport speaks PUT — the backend applies only the keys present in the body either way.
    const res = await this.api.put<Record<string, unknown>>(`/cli/v1/projects/${encodeURIComponent(projectId)}/github`, body)

    if (!this.jsonEnabled()) {
      this.log('GitHub integration updated:')
      this.log(renderRecord(res.data ?? {}))
    }

    return res
  }
}
