import {writePrivateFile} from '../../../lib/private-file'
import {Args, Flags} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../../base'

export default class SecretsAssetsDownload extends BaseCommand {
  static args = {id: Args.string({required: true})}
  static description = 'Download and decrypt a secret file to an explicit path with mode 0600'
  static flags = {...projectFlag, output: Flags.string({char: 'o', required: true}), version: Flags.integer(), force: Flags.boolean({default: false})}

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(SecretsAssetsDownload)
    const projectId = await this.resolveProjectId(flags.project)
    const query = flags.version ? `?version=${flags.version}` : ''
    const {data, filename} = await this.api.download(`/cli/v1/projects/${encodeURIComponent(projectId)}/secret_assets/${encodeURIComponent(args.id)}/download${query}`)
    await writePrivateFile(flags.output, data, flags.force).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'EEXIST') this.error(`Refusing to overwrite ${flags.output}; pass --force`, {exit: 2})
      throw error
    })
    if (!this.jsonEnabled()) this.log(`Saved ${data.byteLength} encrypted-vault bytes → ${flags.output}`)
    return {bytes: data.byteLength, filename, path: flags.output, mode: '0600'}
  }
}
