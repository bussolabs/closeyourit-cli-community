import {Args} from '@oclif/core'

import {BaseCommand, projectFlag} from '../../../base'

export default class TicketsDependenciesRemove extends BaseCommand {
  static args = {
    id: Args.string({description: 'Ticket id or code (e.g. CYRA-132)', required: true}),
    blocker: Args.string({
      description: 'Prerequisite to remove: its ticket code (e.g. CYAU-83) or the dependency id',
      required: true,
    }),
  }

  static description = 'Remove a prerequisite from a ticket'

  static examples = [
    '<%= config.bin %> tickets dependencies remove CYRA-132 CYAU-83 --project closeyourit-rails',
  ]

  static flags = {...projectFlag}

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(TicketsDependenciesRemove)
    const projectId = await this.resolveProjectId(flags.project)
    const base = `/cli/v1/projects/${encodeURIComponent(projectId)}/tickets/${encodeURIComponent(args.id)}/dependencies`

    // The server wants the dependency UUID, which no command has ever shown you: the prerequisite's
    // CODE is accepted too — the one you wrote to add it — and it is resolved by reading the list.
    // No --confirm: the edge is recreated identically with one line, and retryability is the point of
    // all this work.
    // A HIDDEN prerequisite has `code: null`, which compared as a string counts as "". An empty
    // argument therefore becomes "" and would match the first redacted row: `remove <ticket> ""`
    // would silently delete a prerequisite the caller does not even have the right to see.
    if (args.blocker.trim() === '') {
      this.error('Il prerequisito da togliere va nominato: passa il suo codice (es. CYAU-83) o l\'id della dipendenza.', {exit: 2})
    }

    const dependencyId = await this.resolveDependencyId(base, args.blocker)
    if (!dependencyId) {
      // No blind DELETE: without having found the edge, sending it would mean asking the server to
      // delete an id we do not have, and reading its 404 as if it were our answer.
      this.error(`Nessun prerequisito «${args.blocker}» su ${args.id}: niente da togliere.`, {exit: 2})
    }

    await this.api.delete(`${base}/${encodeURIComponent(dependencyId)}`)
    if (!this.jsonEnabled()) this.log(`prerequisito rimosso: ${args.id} ← ${args.blocker}`)
    return {ticket: args.id, blocker: args.blocker, removed: dependencyId}
  }

  private async resolveDependencyId(base: string, blocker: string): Promise<string | null> {
    const res = await this.api.get<Array<{id?: unknown; code?: unknown; blocker_id?: unknown}>>(base)
    const rows = res.data ?? []
    const wanted = blocker.toLowerCase()

    // First by prerequisite code, then by dependency id: whoever already has the id (printed by
    // `dependencies list`) must not be forced to go through the code, which for a redacted
    // prerequisite does not even exist.
    // An ABSENT `code` never matches, with any argument: it is the redacted row, and the only way
    // to remove it is naming its id — which `dependencies list` prints for it too.
    const byCode = rows.find((row) => typeof row.code === 'string' && row.code.toLowerCase() === wanted)
    if (byCode?.id) return String(byCode.id)

    const byId = rows.find((row) => String(row.id ?? '') === blocker || String(row.blocker_id ?? '') === blocker)
    return byId?.id ? String(byId.id) : null
  }
}
