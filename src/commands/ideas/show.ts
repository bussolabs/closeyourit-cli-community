import {Args} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../base'
import {renderRecord, sanitize, sanitizeMultiline} from '../../lib/output'

export default class IdeasShow extends BaseCommand {
  static args = {
    id: Args.string({description: 'Idea id', required: true}),
  }

  static description = 'Show an idea (fields + problem, solution, monetization, risks, stakeholders, linked ideas)'

  static examples = ['<%= config.bin %> ideas show <idea-id> --project acme-api']

  static flags = {...projectFlag}

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(IdeasShow)
    const projectId = await this.resolveProjectId(flags.project)
    const res = await this.api.get<Record<string, unknown>>(
      `/cli/v1/projects/${projectId}/ideas/${args.id}`,
    )

    if (!this.jsonEnabled()) {
      const {problem, solution, monetization, risks, stakeholders, parent, evolutions, related_ideas, ...fields} =
        res.data ?? {}
      this.log(renderRecord(fields))
      if (parent && typeof parent === 'object') {
        const base = parent as Record<string, unknown>
        this.log(`\n🌱 Evolves from: ${sanitize(String(base.title))} (${sanitize(String(base.id))})`)
      }
      if (Array.isArray(stakeholders) && stakeholders.length > 0) {
        this.log(`\n👥 Stakeholders: ${stakeholders.join(', ')}`)
      }
      if (problem) {
        this.log('\n🎯 Problem:')
        this.log(sanitizeMultiline(String(problem)))
      }
      if (solution) {
        this.log('\n💡 Solution:')
        this.log(sanitizeMultiline(String(solution)))
      }
      if (monetization) {
        this.log('\n💰 Monetization:')
        this.log(sanitizeMultiline(String(monetization)))
      }
      if (risks) {
        this.log('\n⚠️ Risks and constraints:')
        this.log(sanitizeMultiline(String(risks)))
      }
      this.logLinked('🌿 Evolutions', evolutions)
      this.logLinked('🔗 Related ideas', related_ideas)
    }

    return res
  }

  // One line per linked idea: title, status and id (enough to `ideas show` it).
  private logLinked(label: string, ideas: unknown): void {
    if (!Array.isArray(ideas) || ideas.length === 0) return
    this.log(`\n${label}:`)
    for (const idea of ideas as Array<Record<string, unknown>>) {
      this.log(`- ${sanitize(String(idea.title))} · ${sanitize(String(idea.status))} · ${sanitize(String(idea.id))}`)
    }
  }
}
