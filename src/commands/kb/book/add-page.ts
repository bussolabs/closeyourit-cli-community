import {Args, Flags} from '@oclif/core'
import {BaseCommand} from '../../../base'
import {renderBook} from '../../../lib/knowledge'

/**
 * Put one page in a book's summary. Idempotent server-side: repeating the same call leaves the
 * summary as it is (the page is moved, never added twice), which is what makes it safe for an
 * automation that cannot know whether the previous run got through.
 */
export default class KbBookAddPage extends BaseCommand {
  static description = 'Add a knowledge page to a book, optionally at a given position in the summary'

  static examples = [
    '<%= config.bin %> kb book add-page <book-id> --page <page-id>',
    '<%= config.bin %> kb book add-page <book-id> --page <page-id> --position 0',
    '<%= config.bin %> kb book add-page <book-id> --page <page-id> --json',
  ]

  static args = {
    id: Args.string({description: 'Knowledge book id', required: true}),
  }

  static flags = {
    // `--page` is the name the Automator already calls (closeyourit-automator, lib/book.ts
    // `assignPage`), and this command has no pagination, so there is nothing to collide with. It
    // still takes a page *id*, unlike the `--page` of every list command: `--page-id` is accepted
    // as an alias so a human can be explicit about that.
    page: Flags.string({
      aliases: ['page-id'],
      description: 'Id of the knowledge page to add (an id, not a page number; alias: --page-id)',
      required: true,
    }),
    // 0-based, like the server (Knowledge::Books::AddPage) and like the `position` the summary
    // shows back. A caller counting from 1 must subtract one: passing its own number would put the
    // page one slot too low, and the backend clamps instead of refusing.
    position: Flags.integer({description: 'Where to put it in the summary (0 = top; omit to append at the end)'}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(KbBookAddPage)

    if (flags.position !== undefined && flags.position < 0) {
      this.error(`Invalid --position ${flags.position}: the summary starts at 0 (the top).`, {exit: 2})
    }

    // `!== undefined`, not a truthiness test: position 0 is the top of the summary, not "unset".
    const body: Record<string, unknown> = {page_id: flags.page}
    if (flags.position !== undefined) body.position = flags.position

    const res = await this.api.post<Record<string, unknown>>(
      `/cli/v1/knowledge/books/${encodeURIComponent(args.id)}/pages`,
      body,
    )

    if (!this.jsonEnabled()) {
      // "updated", not "added": the call is idempotent, so on a repeat nothing was inserted — what
      // is worth showing either way is the resulting order.
      this.log('Book summary updated:')
      this.log(renderBook(res.data ?? {}))
    }

    return res
  }
}
