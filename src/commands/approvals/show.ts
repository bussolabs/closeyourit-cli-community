import {BaseCommand} from '../../base'
import {fetchApproval, refArg, renderApprovalDetail, resolveApproval} from '../../lib/approvals'

export default class ApprovalsShow extends BaseCommand {
  static description =
    'Show one request in full: the ticket, the plan, report, questions or secret change to decide on, the decisions you can take and its web address.'

  static examples = [
    '<%= config.bin %> approvals show CYRA-12',
    '<%= config.bin %> approvals show agent_plan:<id> --json',
  ]

  static args = refArg

  async run(): Promise<unknown> {
    const {args} = await this.parse(ApprovalsShow)
    const detail = await fetchApproval(this.api, await resolveApproval(this.api, args.ref))
    if (!this.jsonEnabled()) this.log(renderApprovalDetail(detail, this.cfg.apiUrl))
    return {data: detail}
  }
}
