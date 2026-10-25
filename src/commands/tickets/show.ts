import {Args} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../base'
import {renderGuidance} from '../../lib/guidance'
import {renderRecord, renderTable, sanitize, sanitizeMultiline, section} from '../../lib/output'

export default class TicketsShow extends BaseCommand {
  static description =
    'Show a single ticket in full: body (description + Given/When/Then/Expected), comments (with their files) and attachments'

  static examples = [
    '<%= config.bin %> tickets show <ticket-id> --project acme-api',
    '<%= config.bin %> tickets show DRFL-3 --project driverone-flutter',
    '<%= config.bin %> tickets show DRFL-3 -p driverone-flutter --json',
  ]

  static args = {
    id: Args.string({description: 'Ticket id or code (e.g. DRFL-3)', required: true}),
  }

  static flags = {...projectFlag}

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(TicketsShow)
    const projectId = await this.resolveProjectId(flags.project)
    const base = `/cli/v1/projects/${encodeURIComponent(projectId)}/tickets/${encodeURIComponent(args.id)}`

    // The show is the analysis entry point: always the WHOLE ticket in one command
    // (fields + full discussion + attachments), so nothing stays hidden behind extra calls.
    const res = await this.api.get<Record<string, unknown>>(base)
    const ticket = res.data ?? {}
    const comments = await this.fetchAllPages(`${base}/comments`)
    const attachments = await this.fetchAllPages(`${base}/attachments`)

    if (!this.jsonEnabled()) {
      this.renderTicket(ticket)
      this.renderComments(comments)
      this.renderAttachments(attachments)
    }

    return {data: {...ticket, comments, attachments}}
  }

  /** Read every page of a collection endpoint: the discussion must be complete, not just page 1. */
  private async fetchAllPages(path: string): Promise<Array<Record<string, unknown>>> {
    const all: Array<Record<string, unknown>> = []
    let page = 1
    let totalPages = 1
    do {
      // eslint-disable-next-line no-await-in-loop
      const res = await this.api.get<Array<Record<string, unknown>>>(`${path}?page=${page}&per=100`)
      all.push(...(Array.isArray(res.data) ? res.data : []))
      totalPages = Number(res.meta?.total_pages ?? 1)
      page += 1
    } while (page <= totalPages)

    return all
  }

  private renderAttachments(attachments: Array<Record<string, unknown>>): void {
    this.log(`\n📎 Attachments (${attachments.length})`)
    if (attachments.length === 0) return

    this.log(
      renderTable(
        ['ID', 'FILENAME', 'CONTENT_TYPE', 'BYTE_SIZE', 'CREATED_AT'],
        attachments.map((attachment) => [
          String(attachment.id ?? ''),
          String(attachment.filename ?? ''),
          String(attachment.content_type ?? ''),
          String(attachment.byte_size ?? ''),
          String(attachment.created_at ?? ''),
        ]),
      ),
    )
  }

  private renderComments(comments: Array<Record<string, unknown>>): void {
    this.log(`\n💬 Comments (${comments.length})`)
    for (const comment of comments) {
      this.log(
        `\n── ${sanitize(comment.author ?? '?')} · ${sanitize(comment.created_at ?? '')} · ${sanitize(comment.id ?? '')}`,
      )
      this.log(sanitizeMultiline(comment.body ?? ''))
      const files = Array.isArray(comment.files) ? (comment.files as Array<Record<string, unknown>>) : []
      for (const file of files) {
        this.log(
          `   [file] ${sanitize(file.id)} · ${sanitize(file.filename)} · ${sanitize(file.content_type)} · ${sanitize(file.byte_size)} bytes`,
        )
      }
    }
  }

  private renderTicket(ticket: Record<string, unknown>): void {
    const platforms = Array.isArray(ticket.platforms) ? ticket.platforms.map(String).join(', ') : null
    this.log(
      renderRecord({
        id: ticket.id,
        code: ticket.code,
        title: ticket.title,
        kind: ticket.kind,
        status: ticket.status,
        priority: ticket.priority,
        weight: ticket.weight,
        votes_count: ticket.votes_count,
        assignee: ticket.assignee,
        reporter: ticket.reporter,
        reviewer: ticket.reviewer,
        milestone: ticket.milestone,
        platforms: platforms || null,
        project_id: ticket.project_id,
        // Agent-eligibility gate: whether the autonomous agents may work this ticket, and why.
        // The reason is the part you act on — it is what tells you whether to override the verdict.
        agent_eligibility: ticket.agent_eligibility,
        agent_eligibility_source: ticket.agent_eligibility_source,
        agent_eligibility_reason: ticket.agent_eligibility_reason,
        created_at: ticket.created_at,
        updated_at: ticket.updated_at,
      }),
    )

    // Body: description + technical analysis (only if present).
    const scalarBlocks: Array<[string, string, unknown]> = [
      ['📝', 'Description', ticket.description],
      ['🔧', 'Technical analysis', ticket.technical_analysis],
    ]
    for (const [icon, label, value] of scalarBlocks) {
      if (value === null || value === undefined || String(value).trim() === '') continue
      this.log(section(label, icon))
      this.log(sanitizeMultiline(value))
    }

    this.renderScenarios(Array.isArray(ticket.scenarios) ? (ticket.scenarios as Array<Record<string, unknown>>) : [])
    this.renderConditions(Array.isArray(ticket.conditions) ? (ticket.conditions as Array<Record<string, unknown>>) : [])

    // Effective guidance (references/procedures) when the backend ships it. Absent on older servers:
    // renderGuidance returns '' and nothing prints, so no misleading empty section (CYCL-2).
    const guidance = renderGuidance(ticket.guidance)
    if (guidance) this.log(guidance)
  }

  // BDD scenarios: one block per scenario, only the steps present.
  private renderScenarios(scenarios: Array<Record<string, unknown>>): void {
    const steps: Array<[string, string]> = [
      ['Given', 'step_given'],
      ['When', 'step_when'],
      ['Then', 'step_then'],
      ['Expected', 'step_expected'],
    ]
    scenarios.forEach((scenario, index) => {
      const title = scenario.title ? `Scenario ${index + 1}: ${sanitize(scenario.title)}` : `Scenario ${index + 1}`
      this.log(section(title, '🧪'))
      for (const [label, key] of steps) {
        const value = scenario[key]
        if (value === null || value === undefined || String(value).trim() === '') continue
        this.log(`${label}: ${sanitizeMultiline(value)}`)
      }
    })
  }

  // Definition of Done: one bullet per condition.
  private renderConditions(conditions: Array<Record<string, unknown>>): void {
    if (conditions.length === 0) return
    this.log(section('Definition of Done', '✅'))
    for (const condition of conditions) this.log(`- ${sanitizeMultiline(condition.text ?? '')}`)
  }
}
