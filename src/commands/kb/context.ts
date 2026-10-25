import {Flags} from '@oclif/core'
import {BaseCommand} from '../../base'
import {ApiRequestError, type Envelope, type RequestOptions} from '../../lib/api'
import {fetchKnowledgeContext, projectFromGitRemote} from '../../lib/knowledge-context'
import {capContextPages, contextPages, contextProjectLabel, renderKnowledgeContext} from '../../lib/knowledge'

/** Environment switch that turns the context off wherever it is invoked from, hook included. */
const DISABLE_ENV = 'KB_CONTEXT_DISABLE'

/** The answer when there is nothing to show: no project here, switched off, or service unreachable. */
function nothing(unavailable = false): Envelope<Record<string, unknown>> {
  return {data: {project: null, pages: [], ...(unavailable ? {unavailable: true} : {})}}
}

export default class KbContext extends BaseCommand {
  static description =
    'Print the knowledge context of the current project: the short list of pages whoever starts working here should already know'

  static examples = [
    '<%= config.bin %> kb context',
    '<%= config.bin %> kb context --project ACME --limit 5',
    '<%= config.bin %> kb context --quiet --timeout 3',
  ]

  static flags = {
    // Not the shared `projectFlag`: omitted, the project is resolved from the git remote of the
    // current directory, which is the whole point of a context that shows up on its own (CYCL-55).
    project: Flags.string({
      char: 'p',
      description: 'Project id (UUID) or key; omitted, it is resolved from the git remote of the current directory',
    }),
    limit: Flags.integer({description: 'How many pages to print at most', default: 10}),
    quiet: Flags.boolean({
      description:
        'Never fail: outside a project print nothing, on an unreachable service print one line — always exit 0 (for session-start hooks)',
    }),
    timeout: Flags.integer({description: 'Seconds to wait for the service before giving up (0 = no limit)', default: 5}),
  }

  async run(): Promise<unknown> {
    // Read before the command line is even parsed: switched off means switched off, not "off unless
    // the command line is also wrong". A hook written for a newer CLI would otherwise be refused by
    // an older one — loudly, at every session start, with the switch that should have silenced it
    // already set.
    if (process.env[DISABLE_ENV] === '1') {
      // Parsed anyway, failure and all: oclif warns about a command that never parsed its arguments,
      // and a warning on stderr is exactly the noise the switch was set to avoid.
      await this.parse(KbContext).catch(() => undefined)
      return nothing()
    }

    const {flags} = await this.parse(KbContext)
    if (flags.limit < 1) this.error(`Invalid --limit ${flags.limit}: ask for at least 1 page.`, {exit: 2})

    // One deadline for the whole command, not one per call: two requests with a timeout each would
    // let a slow server cost twice the wait the caller agreed to.
    const signal = flags.timeout > 0 ? AbortSignal.timeout(flags.timeout * 1000) : undefined
    const opts: RequestOptions = signal ? {signal} : {}

    try {
      const project =
        flags.project ?? (await projectFromGitRemote(this.api, process.cwd(), flags.timeout * 1000, opts))
      if (project === undefined) {
        // Scenario 2: a directory that is not a project is a normal state, not a failure.
        if (!flags.quiet && !this.jsonEnabled()) this.log('No CloseYourIt project matches this directory.')
        return nothing()
      }

      const answer = await fetchKnowledgeContext(this.api, project, flags.limit, opts)
      // The cap holds on both outputs — printed list and JSON envelope — so `--limit 5` means five
      // pages however the server chose to interpret `per`.
      const res = {...answer, data: capContextPages(answer.data, flags.limit)}
      if (!this.jsonEnabled()) {
        const pages = contextPages(res.data)
        if (pages.length === 0) {
          if (!flags.quiet) this.log('No knowledge pages for this project yet.')
        } else {
          this.log(renderKnowledgeContext(pages, contextProjectLabel(res.data, project)))
        }
      }

      return res
    } catch (error) {
      // Scenario 3: with --quiet an unreachable (or unauthenticated) service costs one line and a
      // zero exit — the session starts anyway. Anything that is not an API failure still surfaces.
      if (!flags.quiet || !(error instanceof ApiRequestError)) throw error
      if (this.jsonEnabled()) this.logJson(nothing(true))
      else this.log('Knowledge context unavailable.')

      // Exit instead of returning: a connection that never completes leaves its socket — and the
      // event loop — alive until the OS gives up (~10s measured), well past the abort that already
      // produced the line above. Returning would hand the caller exactly the wait the deadline was
      // there to prevent, only after the message instead of before it.
      return this.exit(0)
    }
  }
}
