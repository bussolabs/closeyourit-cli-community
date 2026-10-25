import {readFile} from 'node:fs/promises'
import {Flags} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../base'
import {ErrorCodes} from '../../errors/error-codes'
import {ApiRequestError} from '../../lib/api'
import {LENGTH_LIMITS, tooLongMessage} from '../../lib/limits'
import {renderRecord} from '../../lib/output'

// Declared copy of `Knowledge::Page::PUBLICATION_KEY_FORMAT`: a malformed key is the only error
// that can be recognised without calling the server, and recognising it here avoids finding out
// halfway through a retry loop that every call was bound to a 422.
const PUBLICATION_KEY_RE = /^[A-Za-z0-9][A-Za-z0-9._~:-]{0,254}$/

// An error the backend actually worded: `error-codes.ts` reserves the R/G initials for application
// codes and propagates them untouched, while everything starting with C was coined by the CLI in
// front of a response that said nothing — a non-JSON body (`C000-NET-001`) or an envelope without
// a code (`C404-API-000`), which is how a nonexistent route shows up.
const BACKEND_CODE_RE = /^[RG]/

interface PublicationMeta extends Record<string, unknown> {
  adopted_legacy?: boolean
  operation?: string
}

export default class KbPublish extends BaseCommand {
  static description = `Idempotently create or update a Knowledge page by publication key.

Exactly one of --body or --body-file is required.`

  static usage =
    '-p <project> --publication-key <key> --title <title> [--kind <kind>] (--body <markdown> | --body-file <path>)'

  static examples = [
    '<%= config.bin %> kb publish --project CYCL --publication-key docs:release --title "Release guide" --body "Steps…"',
    '<%= config.bin %> kb publish -p CYCL --publication-key docs:release --title "Release guide" --kind guide --body-file ./release.md',
  ]

  static flags = {
    ...projectFlag,
    'publication-key': Flags.string({
      description: 'Stable publication key (1-255 URL-safe characters)',
      required: true,
    }),
    title: Flags.string({description: `Page title (max ${LENGTH_LIMITS.title} characters)`, required: true}),
    // No default here: the server sets `note` only when the page is born and otherwise keeps the
    // kind it already has. Sending `note` on every call would downgrade a guide to a note on the first
    // repeated publish without `--kind`, which is exactly what an idempotent source must not do.
    kind: Flags.string({description: 'Page kind: note|decision|guide (new page: note; existing: unchanged)'}),
    body: Flags.string({
      description: `Page body (markdown, max ${LENGTH_LIMITS.pageBody} characters); exactly one of --body or --body-file is required`,
      exactlyOne: ['body', 'body-file'],
    }),
    'body-file': Flags.string({
      description: `Read the page body (markdown, max ${LENGTH_LIMITS.pageBody} characters) from a local file; exactly one of --body or --body-file is required`,
    }),
  }

  async run(): Promise<unknown> {
    const {flags} = await this.parse(KbPublish)
    const publicationKey = flags['publication-key']

    if (!PUBLICATION_KEY_RE.test(publicationKey)) {
      this.error(
        'Invalid --publication-key: use 1-255 characters, start with a letter or number, then only letters, numbers, . _ ~ : -.',
        {exit: 2},
      )
    }

    let body: string
    let bodyFlag = '--body'
    if (flags.body === undefined) {
      bodyFlag = '--body-file'
      try {
        body = await readFile(flags['body-file']!, 'utf8')
      } catch {
        this.error(`File not found or unreadable: ${flags['body-file']}`, {exit: 2})
      }
    } else {
      body = flags.body
    }

    // Publish is an atomic upsert and does not re-read the page before writing: without a current
    // value to use as safeguard the cap applies in full, as on `kb create` (CYCL-32).
    const tooLong = tooLongMessage([
      {flag: '--title', value: flags.title, max: LENGTH_LIMITS.title},
      {flag: bodyFlag, value: body, max: LENGTH_LIMITS.pageBody},
    ])
    if (tooLong) this.error(tooLong, {exit: 2})

    const projectId = await this.resolveProjectId(flags.project)
    const path = `/cli/v1/projects/${projectId}/knowledge/publications/${encodeURIComponent(publicationKey)}`

    // `kind` leaves the payload when it was not passed: the server tells "you did not tell me"
    // (keeps what it has) from an explicit value, and a key present but empty is not the same thing.
    const payload = {title: flags.title, ...(flags.kind === undefined ? {} : {kind: flags.kind}), body}

    let res
    try {
      res = await this.api.put<Record<string, unknown>>(path, payload)
    } catch (error) {
      // A 404 the backend did not word is the route that is not there: on a server older than
      // atomic publishing the message says what to upgrade, instead of making the project look
      // gone. Every application 404 passes through untouched — R404-KNOWLEDGE-001 for the invisible
      // project and anything else the backend adds later, which must not be masked here.
      if (error instanceof ApiRequestError && error.status === 404 && !BACKEND_CODE_RE.test(error.code)) {
        throw new ApiRequestError(
          404,
          ErrorCodes.Knowledge.publishUnavailable,
          'Knowledge publish is not supported by this backend. Upgrade CloseYourIt and retry.',
        )
      }

      throw error
    }

    if (!this.jsonEnabled()) {
      const meta = (res.meta ?? {}) as PublicationMeta
      const operation = meta.operation === 'created' ? 'created' : 'updated'
      // The body was just written by whoever ran the command: reprinting it in full would bury
      // the only new thing, i.e. whether the page was born now or was updated.
      const {body: _body, ...page} = res.data ?? {}
      this.log(`Knowledge publication ${operation}:`)
      this.log(renderRecord({...page, operation: meta.operation, adopted_legacy: meta.adopted_legacy}))
    }

    return res
  }
}
