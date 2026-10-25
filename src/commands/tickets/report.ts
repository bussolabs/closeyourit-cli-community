import {readFile} from 'node:fs/promises'
import {Args, Flags} from '@oclif/core'

import {BaseCommand, projectFlag} from '../../base'
import {LENGTH_LIMITS, tooLongMessage} from '../../lib/limits'
import {renderReport} from '../../lib/ticket-report'

/**
 * Work report of a ticket (CYCL-31). It is the field the server points to when it rejects a
 * too-long comment, and until now it existed only in the web form: whoever closed a job from the
 * terminal had to open the site or give up writing the report.
 *
 * Every write ADDS a version, it does not overwrite the previous one: fixing a report means
 * writing a new one, and the history is read with `tickets report-versions`. Sending the exact same
 * text again does not create an extra version — the server recognises it, so a repeated command (a
 * script retry) does not clutter the history.
 */
export default class TicketsReport extends BaseCommand {
  static args = {
    id: Args.string({description: 'Ticket id or code (e.g. DRFL-3)', required: true}),
  }

  static description =
    'Write the work report of a ticket — the long text a comment cannot hold. Each write adds a version, it never overwrites the previous one'

  static examples = [
    '<%= config.bin %> tickets report <ticket-id> --project acme-api --body "Cosa ho fatto, come si verifica"',
    '<%= config.bin %> tickets report DRFL-3 -p acme-api --body-file ./report.md',
  ]

  static flags = {
    ...projectFlag,
    body: Flags.string({description: `Report body (markdown, max ${LENGTH_LIMITS.report} characters)`}),
    'body-file': Flags.string({
      description: `Read the report body (max ${LENGTH_LIMITS.report} characters) from a local file`,
    }),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(TicketsReport)

    // A version is immutable: if the two values diverge, picking one at random leaves the report
    // wrong forever. Better to stop before writing.
    if (flags.body !== undefined && flags['body-file'] !== undefined) {
      this.error('Pass the report body with --body or --body-file, not both.', {exit: 2})
    }

    let body = flags.body
    let bodyFlag = '--body'
    if (body === undefined && flags['body-file'] !== undefined) {
      bodyFlag = '--body-file'
      try {
        body = await readFile(flags['body-file'], 'utf8')
      } catch {
        this.error(`File not found or unreadable: ${flags['body-file']}`, {exit: 2})
      }
    }

    if (body === undefined) {
      this.error('Provide the report body via --body or --body-file.', {exit: 2})
    }

    // Every write is a new version, so the cap always applies in full: nothing to safeguard and no
    // reason to send a text the server would reject anyway (CYCL-32).
    const tooLong = tooLongMessage([{flag: bodyFlag, value: body, max: LENGTH_LIMITS.report, orthography: true}])
    if (tooLong) this.error(tooLong, {exit: 2})

    const projectId = await this.resolveProjectId(flags.project)
    const res = await this.api.post<Record<string, unknown>>(
      `/cli/v1/projects/${encodeURIComponent(projectId)}/tickets/${encodeURIComponent(args.id)}/report`,
      {body},
    )

    if (!this.jsonEnabled()) {
      this.log('Work report saved:')
      this.log(renderReport(res.data ?? {}))
    }

    return res
  }
}
