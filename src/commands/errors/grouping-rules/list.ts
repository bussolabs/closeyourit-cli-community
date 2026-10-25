import {BaseCommand, pageFlag, projectFlag} from '../../../base'
import {renderTable, statusCell} from '../../../lib/output'

export default class ErrorsGroupingRulesList extends BaseCommand {
  static description = 'List the custom grouping rules of a project, in the order they are applied'

  static examples = ['<%= config.bin %> errors grouping-rules list --project acme-api']

  static flags = {...projectFlag, ...pageFlag}

  async run(): Promise<unknown> {
    const {flags} = await this.parse(ErrorsGroupingRulesList)
    const projectId = await this.resolveProjectId(flags.project)

    const res = await this.api.get<Array<Record<string, unknown>>>(
      `/cli/v1/projects/${encodeURIComponent(projectId)}/error_grouping_rules?page=${flags.page}`,
    )
    const rules = res.data ?? []

    if (!this.jsonEnabled()) {
      this.log(
        renderTable(
          ['POS', 'FIELD', 'OPERATOR', 'VALUE', 'GROUPS AS', 'ACTIVE', 'ID'],
          rules.map((rule) => [
            String(rule.position ?? ''),
            String(rule.field ?? ''),
            String(rule.operator ?? ''),
            String(rule.value ?? ''),
            String(rule.fingerprint_key ?? ''),
            statusCell(rule.active === true ? 'active' : 'paused'),
            String(rule.id ?? ''),
          ]),
        ),
      )
    }

    return res
  }
}
