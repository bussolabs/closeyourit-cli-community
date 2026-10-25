import {Args, Flags} from '@oclif/core'
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

export default class VaultRequestsReject extends BaseCommand {
  static description =
    'Reject a pending secret change request with a reason. Nothing changes in the vault: the request freezes as rejected and the reason reaches whoever asked.'

  static examples = [
    '<%= config.bin %> vault requests reject <id> --reason "rotate it on staging first"',
    '<%= config.bin %> vault requests reject <id> -r "wrong key" --json',
  ]

  static args = {
    id: Args.string({description: 'Change request id (from "vault requests list")', required: true}),
  }

  static flags = {
    reason: Flags.string({
      char: 'r',
      description: 'Why the change is refused — recorded for the audit and sent to whoever asked',
      required: true,
    }),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(VaultRequestsReject)

    // A rejection freezes the request for good: it cannot be decided again, and the only thing left
    // to the person who asked is the reason. Whitespace would satisfy the required flag and be
    // refused by the server anyway (R422-CHANGEREQUEST-001), so it is refused here, before the call.
    const reason = flags.reason.trim()
    if (reason === '') {
      this.error('Refusing to reject with an empty --reason: say why, so whoever asked can fix it and ask again.', {
        exit: 2,
      })
    }

    let res: Envelope<Record<string, unknown>>
    try {
      res = await this.api.post<Record<string, unknown>>(
        `${CHANGE_REQUESTS_PATH}/${encodeURIComponent(args.id)}/reject`,
        {reason},
      )
    } catch (error) {
      throw describeDecisionError(error)
    }

    const decided = withoutValue(res.data ?? {})

    if (!this.jsonEnabled()) {
      const label = changeRequestLabel(decided)
      this.log(label ? `Change request rejected: ${label} is unchanged.` : 'Change request rejected: nothing changed.')
      const summary = changeRequestSummary(decided)
      if (Object.keys(summary).length > 0) this.log(renderRecord(summary))
    }

    return {...res, data: decided}
  }
}
