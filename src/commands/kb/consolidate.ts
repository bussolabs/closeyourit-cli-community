import {Args, Flags} from '@oclif/core'
import {BaseCommand} from '../../base'
import {renderRecord} from '../../lib/output'

/**
 * Second step of the review flow: the accepted page has also been written as a versioned document
 * in the knowledge-base repo, so record where it lives. Accepting and discarding stay human gestures
 * on the web review page — this command only closes the loop the CLI can close by itself.
 */
export default class KbConsolidate extends BaseCommand {
  static args = {
    id: Args.string({description: 'Knowledge page id', required: true}),
  }

  static description = 'Mark an accepted page as written to the versioned docs, recording its path'

  static examples = [
    '<%= config.bin %> kb consolidate <page-id> --path troubleshooting/rails.md',
    '<%= config.bin %> kb consolidate <page-id> --path global/git.md --json',
  ]

  static flags = {
    path: Flags.string({description: 'Path of the document inside the knowledge-base repo', required: true}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(KbConsolidate)

    const res = await this.api.post<Record<string, unknown>>(
      `/cli/v1/knowledge/pages/${args.id}/consolidated`,
      {source_path: flags.path},
    )

    if (!this.jsonEnabled()) {
      this.log('Knowledge page filed:')
      this.log(renderRecord(res.data ?? {}))
    }

    return res
  }
}
