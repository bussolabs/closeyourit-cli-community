import {Args, Flags} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../../base'
import {sanitize} from '../../../lib/output'
import {artifactFailure, artifactPath} from '../../../lib/source-map-artifacts'

export default class SourceMapsDelete extends BaseCommand {
  static description = 'Delete a source map artifact with explicit confirmation'
  static args = {id: Args.string({description: 'Source map artifact id', required: true})}
  static flags = {...projectFlag, confirm: Flags.boolean({description: 'Required: confirm the deletion'})}

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(SourceMapsDelete)
    if (!flags.confirm) this.error('Refusing to delete without --confirm.', {exit: 2})
    try {
      const project = await this.resolveProjectId(flags.project)
      await this.api.delete(artifactPath(project, args.id), {body: {confirm: true}})
      if (!this.jsonEnabled()) this.log(`Deleted source map ${sanitize(args.id)}.`)
      return {deleted: args.id}
    } catch (error) { artifactFailure(error) }
  }
}
