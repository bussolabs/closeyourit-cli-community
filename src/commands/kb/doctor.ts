import {statSync} from 'node:fs'
import {Flags} from '@oclif/core'
import {BaseCommand} from '../../base'
import {
  type DoctorReport,
  doctorTotals,
  fetchDoctorPages,
  renderDoctorReport,
  runDoctorChecks,
} from '../../lib/knowledge-doctor'

/**
 * The knowledge health check (CYCL-57): it tells which pages nobody will ever find, which links
 * were left dangling and which queues have been stuck for weeks.
 *
 * Read-only. Every check carries the command that would fix it, but does not run it: repairing
 * stays an explicit choice of whoever reads the report.
 */
export default class KbDoctor extends BaseCommand {
  static description =
    'Check the health of the knowledge base: unfindable pages, dangling links, queues nobody moved. Reads only — exits 1 when a check fails'

  static examples = [
    '<%= config.bin %> kb doctor',
    '<%= config.bin %> kb doctor --project acme-api',
    '<%= config.bin %> kb doctor --docs-root ~/knowledge-base',
    '<%= config.bin %> kb doctor --stale-days 14 --json',
  ]

  static flags = {
    // Optional as on `kb list`: without it, the check looks at every visible project.
    project: Flags.string({char: 'p', description: 'Only the pages of this project (key or UUID)'}),
    'stale-days': Flags.integer({description: 'Days after which a queue counts as stuck', default: 30}),
    'docs-root': Flags.string({
      description: 'Path of the knowledge-base repository, to check that the filed documents are really there',
    }),
    // The cap applies to EACH of the two reads (the list and the archiving queue), not to their
    // total: stated here, so whoever raises it knows how much they are really asking for.
    limit: Flags.integer({description: 'How many pages to read at most, per listing', default: 500}),
  }

  async run(): Promise<unknown> {
    const {flags} = await this.parse(KbDoctor)
    if (flags.limit < 1) this.error(`Invalid --limit ${flags.limit}: examine at least 1 page.`, {exit: 2})
    if (flags['stale-days'] < 1) this.error(`Invalid --stale-days ${flags['stale-days']}: use at least 1 day.`, {exit: 2})

    // 6 — The archived document is a FILE. `existsSync` would say yes for a folder too, and a page
    // pointing to a directory would pass the check that exists precisely to catch it.
    const isFile = (path: string): boolean => {
      try {
        return statSync(path).isFile()
      } catch {
        return false
      }
    }

    // A wrong root must not produce a report: without this check, a mistyped path would flag EVERY
    // document in the fleet as missing, which is the biggest made-up alarm this command could
    // raise.
    const docsRoot = flags['docs-root']
    if (docsRoot !== undefined && !this.isDirectory(docsRoot)) {
      this.error(`Invalid --docs-root ${docsRoot}: it is not a directory that exists here.`, {exit: 2})
    }

    const scan = await fetchDoctorPages(this.api, {limit: flags.limit, project: flags.project})
    // The service is the only one that knows which pages really AWAIT archiving: the queue excludes
    // those written by hand on the web, which never asked anybody for anything. Deriving it here
    // from an empty `consolidated_at` would have started the list with dozens of innocent rows.
    const awaiting = await fetchDoctorPages(this.api, {
      awaitingConsolidation: true,
      limit: flags.limit,
      project: flags.project,
    })

    const checks = runDoctorChecks({
      awaitingConsolidation: awaiting.pages,
      docsRoot,
      fileExists: docsRoot === undefined ? undefined : isFile,
      now: new Date(),
      pages: scan.pages,
      scopedToProject: flags.project !== undefined,
      staleDays: flags['stale-days'],
    })

    const report: DoctorReport = {
      scanned: scan.pages.length,
      truncated: scan.truncated || awaiting.truncated,
      stale_days: flags['stale-days'],
      checks,
    }
    const totals = doctorTotals(checks)
    const envelope = {data: report, meta: totals}

    if (!this.jsonEnabled()) this.log(renderDoctorReport(report))

    // Exits non-zero when a check failed — like the audit script this command brings into the
    // product — so a pipeline can stop on broken knowledge. A warning is not enough: it flags a
    // stuck queue, not an unreachable page.
    if (totals.failures > 0) {
      // In data mode the envelope must be emitted by hand: `this.exit` discards the return value,
      // and exiting silently would give a program reader an empty output indistinguishable from a
      // failure.
      if (this.jsonEnabled()) this.logJson(envelope)
      return this.exit(1)
    }

    return envelope
  }

  /** Is the path a folder that exists here? An unreadable path counts as nonexistent. */
  private isDirectory(path: string): boolean {
    try {
      return statSync(path).isDirectory()
    } catch {
      return false
    }
  }
}
