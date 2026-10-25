import {BaseCommand} from '../../../base'
import {renderTable} from '../../../lib/output'
import {aggregatedMeta, fetchAllPages} from '../../../lib/paginate'
import {CHANGE_REQUESTS_PATH, CHANGE_REQUEST_HEADERS, changeRequestRow, withoutValue} from '../../../lib/vault-requests'

export default class VaultRequestsList extends BaseCommand {
  // No --project on purpose: the queue is org-level, exactly like the web vault page — the backend
  // collects the pending requests across every visible project, and asking for one project would
  // hide the review you were about to do on another.
  static description =
    'List the secret changes waiting for a second approval, across every visible project. Shows the name and the intent, never the proposed value.'

  static examples = ['<%= config.bin %> vault requests list', '<%= config.bin %> vault requests list --json']

  async run(): Promise<unknown> {
    await this.parse(VaultRequestsList)
    const data = (await fetchAllPages(this.api, CHANGE_REQUESTS_PATH)).map((row) => withoutValue(row))

    if (!this.jsonEnabled()) {
      // An empty queue is good news, not an empty result set: renderTable's "(no results)" under a
      // header row reads like a failed search, and the reviewer needs the opposite reading.
      if (data.length === 0) {
        this.log('No secret change request is waiting for a decision.')
      } else {
        this.log(renderTable(CHANGE_REQUEST_HEADERS, data.map((row) => changeRequestRow(row))))
      }
    }

    return {data, meta: aggregatedMeta(data.length)}
  }
}
