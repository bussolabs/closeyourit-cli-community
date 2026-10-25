import {Args, Flags, type Interfaces} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../base'
import {ApiRequestError} from '../../lib/api'
import {LENGTH_LIMITS} from '../../lib/limits'
import {renderRecord} from '../../lib/output'

// Server rejection of a comment over the limit: the message points "to the work report". The
// code stays the backend's, propagated as is (see errors/error-codes.ts) — what gets added is the
// command that actually writes that field (CYCL-31).
const COMMENT_TOO_LONG = 'R422-COMMENT-002'

export default class TicketsComment extends BaseCommand {
  static args = {
    id: Args.string({description: 'Ticket id', required: true}),
  }

  static description = 'Add a comment to a ticket'

  static examples = [
    '<%= config.bin %> tickets comment <ticket-id> --project acme-api --body "Reproduced on staging"',
  ]

  static flags = {
    ...projectFlag,
    // The cap is declared here and the measurement stays with the server: its rejection carries the
    // ready command to write the text that does not fit elsewhere (see `catch`), which a local check would remove.
    body: Flags.string({
      description: `Comment body (max ${LENGTH_LIMITS.comment} characters — longer text goes in the work report)`,
      required: true,
    }),
  }

  /** Ticket and project as the user wrote them: the hint on R422 repeats them as is. */
  private target?: {id: string; project: string}

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(TicketsComment)
    this.target = {id: args.id, project: flags.project}
    const projectId = await this.resolveProjectId(flags.project)
    const res = await this.api.post<Record<string, unknown>>(
      `/cli/v1/projects/${projectId}/tickets/${args.id}/comments`,
      {body: flags.body},
    )

    if (!this.jsonEnabled()) {
      this.log('Comment added:')
      this.log(renderRecord(res.data ?? {}))
    }

    return res
  }

  /**
   * The too-long comment must be written elsewhere, and the server message only says "use the work
   * report": before CYCL-31 that field did not exist from the terminal and the only way out was
   * opening the site. Now it exists, so the ready-to-run command is appended to the message, with
   * the ticket and project already in it. The server's code and text stay intact — in `--json` too,
   * where the hint travels at the end of `message` and `code` stays `R422-COMMENT-002`.
   */
  protected async catch(error: Interfaces.CommandError): Promise<unknown> {
    if (error instanceof ApiRequestError && error.code === COMMENT_TOO_LONG && this.target) {
      const hint = `Write it with: ${this.config.bin} tickets report ${this.target.id} --project ${this.target.project} --body-file <file>`
      return super.catch(new ApiRequestError(error.status, error.code, `${error.message} ${hint}`, error.details))
    }

    return super.catch(error)
  }
}
