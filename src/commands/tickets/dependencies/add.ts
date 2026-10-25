import {Args} from '@oclif/core'

import {BaseCommand, projectFlag} from '../../../base'
import {ApiRequestError} from '../../../lib/api'

/** The server answers like this when the edge being created is not allowed — duplicates included. */
const NOT_ALLOWED = 'R422-TICKET-017'

export default class TicketsDependenciesAdd extends BaseCommand {
  static args = {
    id: Args.string({description: 'Ticket id or code (e.g. CYRA-132)', required: true}),
    blocker: Args.string({description: 'Prerequisite ticket id or code — may live in another project', required: true}),
  }

  static description =
    'Add a prerequisite to a ticket: the blocker has to be finished before this ticket can start'

  static examples = [
    '<%= config.bin %> tickets dependencies add CYRA-132 CYAU-83 --project closeyourit-rails',
    'while read -r a b; do <%= config.bin %> tickets dependencies add "$a" "$b" -p closeyourit-rails; done < ordine.txt',
  ]

  static flags = {...projectFlag}

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(TicketsDependenciesAdd)
    const projectId = await this.resolveProjectId(flags.project)
    const base = `/cli/v1/projects/${encodeURIComponent(projectId)}/tickets/${encodeURIComponent(args.id)}/dependencies`

    // Twin of the guard in `remove`: with an empty argument the re-read would match a redacted row
    // (`code: null` counts as "") and this command would say "already present" exiting 0 — a real
    // error passing for work done, right inside the file that gets re-run.
    if (args.blocker.trim() === '') {
      this.error('Il prerequisito va nominato: passa il suo codice, anche di un altro prodotto (es. CYAU-83).', {exit: 2})
    }

    try {
      const res = await this.api.post<Record<string, unknown>>(base, {blocker: args.blocker})
      if (!this.jsonEnabled()) this.log(`prerequisito aggiunto: ${args.id} ← ${args.blocker}`)
      return res.data
    } catch (error) {
      // Re-running the whole file must be safe: a link already written is not an error, it is work
      // already done. But `R422-TICKET-017` does not only mean "already there" — it is the answer to
      // every edge not allowed, and treating it as "fine" wholesale would pass off as successful the
      // rows rejected for another reason too. So the list is re-read: if the edge really is there
      // exit 0, otherwise the error propagates.
      //
      // The cycle (R422-TICKET-013) and the nonexistent prerequisite (R404-TICKET-015) always
      // propagate: there the row is wrong and must be seen, not swallowed.
      if (!(error instanceof ApiRequestError) || error.code !== NOT_ALLOWED) throw error

      const alreadyPresent = await this.dependencyExists(base, args.blocker)
      if (!alreadyPresent) throw error

      if (!this.jsonEnabled()) this.log(`prerequisito già presente: ${args.id} ← ${args.blocker}`)
      return {ticket: args.id, blocker: args.blocker, alreadyPresent: true}
    }
  }

  /** The blocker is named by its code; the list exposes it on `code`, unless it is redacted. */
  private async dependencyExists(base: string, blocker: string): Promise<boolean> {
    const res = await this.api.get<Array<{code?: unknown; blocker_id?: unknown}>>(base)
    const wanted = blocker.toLowerCase()
    return (res.data ?? []).some(
      (row) =>
        (typeof row.code === 'string' && row.code.toLowerCase() === wanted) ||
        (typeof row.blocker_id === 'string' && row.blocker_id === blocker),
    )
  }
}
