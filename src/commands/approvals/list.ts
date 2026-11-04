import {Flags} from '@oclif/core'
import {BaseCommand} from '../../base'
import {APPROVAL_STATES, fetchApprovals, isDeferred, renderApprovalTable} from '../../lib/approvals'

export default class ApprovalsList extends BaseCommand {
  static description =
    'List the requests waiting for your decision (plans, reviews, questions from the agent, secret changes), oldest first. Requests deferred to tomorrow are hidden unless --all.'

  static examples = [
    '<%= config.bin %> approvals list',
    '<%= config.bin %> approvals list --state review_blocked --project CYRA',
    '<%= config.bin %> approvals list --all --json',
  ]

  static flags = {
    state: Flags.string({description: 'Only one kind of wait', options: [...APPROVAL_STATES]}),
    project: Flags.string({char: 'p', description: 'Only one project (its key)'}),
    agent: Flags.string({description: 'Only the requests of one agent (its id)'}),
    all: Flags.boolean({description: 'Include the requests deferred to tomorrow', default: false}),
  }

  async run(): Promise<unknown> {
    const {flags} = await this.parse(ApprovalsList)
    const res = await fetchApprovals(this.api, {state: flags.state, project: flags.project, agent: flags.agent})
    const rows = Array.isArray(res.data) ? res.data : []
    const data = flags.all ? rows : rows.filter((row) => !isDeferred(row))

    if (!this.jsonEnabled()) {
      if (data.length === 0) this.log('Nothing is waiting for your decision.')
      else this.log(renderApprovalTable(data))
      const hidden = rows.length - data.length
      if (hidden > 0) this.log(`${hidden} deferred to tomorrow: --all shows them.`)
    }

    return res.meta ? {data, meta: res.meta} : {data}
  }
}
