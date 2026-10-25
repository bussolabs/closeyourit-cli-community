import {readFile} from 'node:fs/promises'
import {Args, Flags} from '@oclif/core'
import {BaseCommand} from '../../base'
import {cleanList, pageScopeLines} from '../../lib/knowledge'
import {LENGTH_LIMITS, tooLongMessage} from '../../lib/limits'
import {renderRecord} from '../../lib/output'

export default class KbUpdate extends BaseCommand {
  static description = 'Update a knowledge page (only the fields you pass; the others keep their current value)'

  static examples = [
    '<%= config.bin %> kb update <page-id> --title "New title"',
    '<%= config.bin %> kb update <page-id> --kind decision --body-file ./adr.md',
    '<%= config.bin %> kb update <page-id> --tech-spec-file ./tech.md',
    '<%= config.bin %> kb update <page-id> --project acme-api --project billing --group Piattaforma',
    '<%= config.bin %> kb update <page-id> --tag deploy --tag kamal',
  ]

  static args = {
    id: Args.string({description: 'Knowledge page id', required: true}),
  }

  static flags = {
    title: Flags.string({description: `New title (max ${LENGTH_LIMITS.title} characters)`}),
    // Scopes and tags: passing them REPLACES the list (that is how they work on the server), not
    // passing them leaves it intact. That is why they travel only when the command really gets them.
    project: Flags.string({
      char: 'p',
      description: 'Replace the projects the page belongs to: id (UUID) or key (repeatable)',
      multiple: true,
    }),
    group: Flags.string({
      description: 'Replace the groups the page belongs to: id (UUID) or name (repeatable)',
      multiple: true,
    }),
    tag: Flags.string({
      description: 'Replace the page tags (repeatable; `--tag ""` clears them)',
      multiple: true,
    }),
    'author-origin': Flags.string({
      description: 'Name of the assistant or skill that rewrote the text (only applies with a text change)',
    }),
    kind: Flags.string({description: 'New kind: note|decision|guide'}),
    body: Flags.string({description: `New body (markdown, max ${LENGTH_LIMITS.pageBody} characters)`}),
    'body-file': Flags.string({
      description: `Read the new body (markdown, max ${LENGTH_LIMITS.pageBody} characters) from a local file`,
    }),
    'tech-spec': Flags.string({
      description: `New technical section, kept separate from the simple body (max ${LENGTH_LIMITS.techSpec} characters)`,
    }),
    'tech-spec-file': Flags.string({
      description: `Read the new technical section (max ${LENGTH_LIMITS.techSpec} characters) from a local file`,
    }),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(KbUpdate)

    let body = flags.body
    let bodyFlag = '--body'
    if (body === undefined && flags['body-file'] !== undefined) {
      bodyFlag = '--body-file'
      try {
        body = await readFile(flags['body-file'], 'utf8')
      } catch {
        this.error(`File not found or unreadable: ${flags['body-file']}`, {exit: 2})
      }
    }

    let techSpec = flags['tech-spec']
    let techSpecFlag = '--tech-spec'
    if (techSpec === undefined && flags['tech-spec-file'] !== undefined) {
      techSpecFlag = '--tech-spec-file'
      try {
        techSpec = await readFile(flags['tech-spec-file'], 'utf8')
      } catch {
        this.error(`File not found or unreadable: ${flags['tech-spec-file']}`, {exit: 2})
      }
    }

    if (
      flags.title === undefined &&
      flags.kind === undefined &&
      body === undefined &&
      techSpec === undefined &&
      flags.project === undefined &&
      flags.group === undefined &&
      flags.tag === undefined
    ) {
      this.error(
        'Provide at least one of --title, --kind, --body, --body-file, --tech-spec, --tech-spec-file, --project, --group or --tag.',
        {exit: 2},
      )
    }

    // The backend expects the full title/body/kind/tech_spec on update → read the current page and
    // merge, so a partial edit (e.g. only --tech-spec) doesn't blank out the other fields.
    //
    // Only when the text really changes: an update of scopes or tags alone has nothing to merge,
    // and sending back the text just read would erase the edit of whoever wrote in the meantime
    // (CYCL-45). Without text fields there is nothing to measure either, so the read is skipped.
    const base = `/cli/v1/knowledge/pages/${encodeURIComponent(args.id)}`
    const editsText =
      flags.title !== undefined || flags.kind !== undefined || body !== undefined || techSpec !== undefined

    let text: Record<string, unknown> = {}
    if (editsText) {
      const current = await this.api.get<Record<string, unknown>>(base)
      const page = current.data ?? {}

      // Too-long fields are found here, all together, instead of one per rejection (CYCL-32). The
      // current value acts as safeguard: a page written before the cap existed can still be fixed
      // and shortened gradually, as on the server.
      const tooLong = tooLongMessage([
        {flag: '--title', value: flags.title, max: LENGTH_LIMITS.title, previous: page.title},
        {flag: bodyFlag, value: body, max: LENGTH_LIMITS.pageBody, previous: page.body},
        {flag: techSpecFlag, value: techSpec, max: LENGTH_LIMITS.techSpec, previous: page.tech_spec},
      ])
      if (tooLong) this.error(tooLong, {exit: 2})

      text = {
        title: flags.title ?? page.title,
        kind: flags.kind ?? page.kind,
        body: body ?? page.body,
        tech_spec: techSpec ?? page.tech_spec,
      }
    }

    // Scopes and tags: the key travels ONLY if the flag was passed, because the server updates
    // exactly what it receives — sending an empty list for "I am not touching them" would unlink the
    // page from projects and groups and erase its tags on every comma fix (CYCL-45).
    const scope: Record<string, unknown> = {}
    if (flags.project !== undefined) {
      scope.project_ids = await this.resolveAll(cleanList(flags.project), (ref) => this.resolveProjectId(ref))
    }

    if (flags.group !== undefined) {
      scope.group_ids = await this.resolveAll(cleanList(flags.group), (ref) => this.resolveGroupId(ref))
    }

    if (flags.tag !== undefined) scope.tags = cleanList(flags.tag)
    if (flags['author-origin'] !== undefined) scope.author_origin = flags['author-origin']

    const res = await this.api.put<Record<string, unknown>>(base, {...text, ...scope})

    if (!this.jsonEnabled()) {
      const updated = res.data ?? {}
      this.log('Knowledge page updated:')
      this.log(renderRecord({...updated, ...pageScopeLines(updated)}))
    }

    return res
  }
}
