import {Args} from '@oclif/core'
import {BaseCommand} from '../../../base'
import type {Envelope} from '../../../lib/api'
import {renderRecord} from '../../../lib/output'
import {
  CHANGE_REQUESTS_PATH,
  changeRequestLabel,
  changeRequestSummary,
  describeDecisionError,
  withoutValue,
} from '../../../lib/vault-requests'

export default class VaultRequestsApprove extends BaseCommand {
  // No --confirm here, unlike the destructive deletions of this CLI: "approve" IS the confirmation —
  // the command exists to say yes, and asking twice would only push the reviewer back to the website
  // this command replaces. The success line names what was applied and where, so an approval on the
  // wrong id is visible at once.
  static description =
    'Approve a pending secret change request: the change it carries is applied to the vault. Whoever asked for it cannot approve it (four-eyes), and a service account never can.'

  static examples = [
    '<%= config.bin %> vault requests approve <id>',
    '<%= config.bin %> vault requests approve <id> --json',
  ]

  static args = {
    id: Args.string({description: 'Change request id (from "vault requests list")', required: true}),
  }

  async run(): Promise<unknown> {
    const {args} = await this.parse(VaultRequestsApprove)

    let res: Envelope<Record<string, unknown>>
    try {
      res = await this.api.post<Record<string, unknown>>(`${CHANGE_REQUESTS_PATH}/${encodeURIComponent(args.id)}/approve`)
    } catch (error) {
      throw describeDecisionError(error)
    }

    const decided = withoutValue(res.data ?? {})

    if (!this.jsonEnabled()) {
      const label = changeRequestLabel(decided)
      this.log(label ? `Change request approved: ${label} is applied.` : 'Change request approved.')
      const summary = changeRequestSummary(decided)
      if (Object.keys(summary).length > 0) this.log(renderRecord(summary))
    }

    return {...res, data: decided}
  }
}
