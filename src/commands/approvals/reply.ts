import {Flags} from '@oclif/core'
import {BaseCommand} from '../../base'
import {fetchApproval, parsePicks, refArg, resolveApproval, sendDecision} from '../../lib/approvals'

export default class ApprovalsReply extends BaseCommand {
  static description =
    'Answer the questions of the agent: pick proposed answers by number (--pick question=option), write your own (--text), or both.'

  static examples = [
    '<%= config.bin %> approvals reply CYRA-12 --pick 1=2 --pick 2=1',
    '<%= config.bin %> approvals reply CYRA-12 --text "use the staging bucket"',
  ]

  static args = refArg

  static flags = {
    text: Flags.string({char: 't', description: 'Your answer'}),
    pick: Flags.string({description: 'A proposed answer, as question=option (e.g. 1=2); repeatable', multiple: true}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(ApprovalsReply)
    const text = flags.text?.trim() ?? ''
    const picks = flags.pick ?? []
    if (text === '' && picks.length === 0) this.error('Nothing to send: pass --text, --pick, or both.', {exit: 2})

    const target = await resolveApproval(this.api, args.ref)
    let answers: Record<string, string> = {}
    if (picks.length > 0) {
      const parsed = parsePicks((await fetchApproval(this.api, target)).questions ?? [], picks)
      if ('error' in parsed) this.error(parsed.error, {exit: 2})
      answers = parsed.answers
    }

    const res = await sendDecision(this.api, target, {
      decision: 'reply',
      ...(text ? {text} : {}),
      ...(Object.keys(answers).length > 0 ? {answers} : {}),
    })
    if (!this.jsonEnabled()) this.log(`Answer sent: ${args.ref}.`)
    return res
  }
}
