import {createInterface} from 'node:readline/promises'
import {Flags} from '@oclif/core'
import {BaseCommand} from '../../base'
import {
  APPROVAL_STATES,
  type ReviewIo,
  fetchApprovals,
  isDeferred,
  reviewApprovals,
  summaryLine,
} from '../../lib/approvals'
import {openUrl} from '../../lib/browser'

export default class ApprovalsReview extends BaseCommand {
  // Interactive by nature: prompts on stdout would corrupt a JSON document.
  static enableJsonFlag = false

  static description =
    'Go through the waiting requests one at a time and decide each from the terminal: approve, reject, ask, reply, reassess, skip, defer to tomorrow, open in the browser or quit.'

  static examples = ['<%= config.bin %> approvals review', '<%= config.bin %> approvals review --state review --project CYRA']

  static flags = {
    state: Flags.string({description: 'Only one kind of wait', options: [...APPROVAL_STATES]}),
    project: Flags.string({char: 'p', description: 'Only one project (its key)'}),
  }

  async run(): Promise<unknown> {
    const {flags} = await this.parse(ApprovalsReview)
    if (!process.stdin.isTTY) {
      this.error(
        'approvals review needs a terminal. In scripts use "approvals list" and then approve, reject, ask, reply, reassess or defer.',
        {exit: 2},
      )
    }

    const res = await fetchApprovals(this.api, {state: flags.state, project: flags.project})
    const rows = (Array.isArray(res.data) ? res.data : []).filter((row) => !isDeferred(row))
    if (rows.length === 0) {
      this.log('Nothing is waiting for your decision.')
      return undefined
    }

    const rl = createInterface({input: process.stdin, output: process.stdout})
    const closed = new Promise<null>((resolve) => {
      rl.once('close', () => resolve(null))
    })
    const io: ReviewIo = {
      print: (line) => this.log(line),
      ask: (question) => Promise.race([rl.question(question), closed]).catch(() => null),
      open: openUrl,
    }

    try {
      const summary = await reviewApprovals(this.api, rows, {io, baseUrl: this.cfg.apiUrl})
      this.log(`\n${summaryLine(summary)}`)
      return {data: summary}
    } finally {
      rl.close()
    }
  }
}
