import {readFile} from 'node:fs/promises'
import {Flags} from '@oclif/core'
import {BaseCommand} from '../../base'
import {cleanList, pageScopeLines} from '../../lib/knowledge'
import {LENGTH_LIMITS, tooLongMessage} from '../../lib/limits'
import {renderRecord} from '../../lib/output'

export default class KbCreate extends BaseCommand {
  static description = 'Create a knowledge page in one or more projects (and groups)'

  static examples = [
    '<%= config.bin %> kb create --project acme-api --title "Kamal rollback" --body "Steps…"',
    '<%= config.bin %> kb create -p acme-api --title "ADR: queue backend" --kind decision --body-file ./adr.md',
    '<%= config.bin %> kb create -p acme-api --title "Deploy" --body-file ./body.md --tech-spec-file ./tech.md',
    '<%= config.bin %> kb create -p acme-api --title "Worktree trap" --body-file ./note.md --in-review --review-note "Hit it today, not obvious from the code"',
    '<%= config.bin %> kb create -p acme-api -p billing --group Piattaforma --tag deploy --tag kamal --title "Rollback" --body-file ./note.md',
  ]

  static flags = {
    // Repeatable: a page belongs to every project you name (plus every project of the groups).
    // The first one goes out as `project` (key or UUID, resolved server-side, no extra lookup);
    // the others are resolved here because `project_ids` only takes ids.
    //
    // Not `required`: a page can live on groups alone (a procedure that follows a whole
    // macro-project, including the projects it will gain later). What a page cannot do is belong
    // nowhere — the guard in `run` asks for one of the two.
    project: Flags.string({
      char: 'p',
      description: 'Project id (UUID) or key the page belongs to (repeatable)',
      multiple: true,
    }),
    group: Flags.string({description: 'Group id (UUID) or name the page belongs to (repeatable)', multiple: true}),
    tag: Flags.string({description: 'Tag for the page (repeatable; the server lowercases and dedupes them)', multiple: true}),
    title: Flags.string({description: `Page title (max ${LENGTH_LIMITS.title} characters)`, required: true}),
    kind: Flags.string({description: 'Page kind: note|decision|guide', default: 'note'}),
    body: Flags.string({description: `Page body (markdown, max ${LENGTH_LIMITS.pageBody} characters)`}),
    'body-file': Flags.string({
      description: `Read the body (markdown, max ${LENGTH_LIMITS.pageBody} characters) from a local file`,
    }),
    'tech-spec': Flags.string({
      description: `Technical section, kept separate from the simple body (max ${LENGTH_LIMITS.techSpec} characters)`,
    }),
    'tech-spec-file': Flags.string({
      description: `Read the technical section (max ${LENGTH_LIMITS.techSpec} characters) from a local file`,
    }),
    // Propose instead of publish: the page waits for a human in the review queue and stays out of
    // search, answers and related panels until it is accepted (see `kb list --status in_review`).
    'in-review': Flags.boolean({description: 'Create the page in review instead of publishing it'}),
    'review-note': Flags.string({
      description: `One line explaining why the page is worth keeping (review queue, max ${LENGTH_LIMITS.reviewNote} characters)`,
    }),
    // Who actually wrote the text, which is NOT the token owner: the name of the assistant or the
    // skill. Without it, a proposal under review stays attributed to the channel.
    'author-origin': Flags.string({
      description: 'Name of the assistant or skill that wrote the text (declares an automatic author)',
    }),
  }

  async run(): Promise<unknown> {
    const {flags} = await this.parse(KbCreate)

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

    if (body === undefined) {
      this.error('Provide the page body via --body or --body-file.', {exit: 2})
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

    if (flags['review-note'] !== undefined && !flags['in-review']) {
      this.error('--review-note only applies to a page created with --in-review.', {exit: 2})
    }

    // A new page has nothing to safeguard: the cap applies in full on every field, and too-long
    // fields are all reported in this single rejection instead of one per attempt (CYCL-32).
    const tooLong = tooLongMessage([
      {flag: '--title', value: flags.title, max: LENGTH_LIMITS.title},
      {flag: bodyFlag, value: body, max: LENGTH_LIMITS.pageBody},
      {flag: techSpecFlag, value: techSpec, max: LENGTH_LIMITS.techSpec},
      {flag: '--review-note', value: flags['review-note'], max: LENGTH_LIMITS.reviewNote},
    ])
    if (tooLong) this.error(tooLong, {exit: 2})

    const [primary, ...extraProjects] = cleanList(flags.project)
    const groupRefs = cleanList(flags.group)
    // A page must belong to something: without scope the server would create it org-wide, visible
    // only to those with full access — i.e. invisible to whoever just wrote it.
    if (primary === undefined && groupRefs.length === 0) {
      this.error('Provide at least one --project or one --group: a knowledge page has to belong somewhere.', {exit: 2})
    }

    const projectIds = await this.resolveAll(extraProjects, (ref) => this.resolveProjectId(ref))
    const groupIds = await this.resolveAll(groupRefs, (ref) => this.resolveGroupId(ref))
    const tags = cleanList(flags.tag)

    const res = await this.api.post<Record<string, unknown>>('/cli/v1/knowledge/pages', {
      // Keys present only when there is something to link: the server merges `project` and
      // `project_ids`, so an empty list would be noise in every single-project creation.
      ...(primary !== undefined && {project: primary}),
      ...(projectIds.length > 0 && {project_ids: projectIds}),
      ...(groupIds.length > 0 && {group_ids: groupIds}),
      ...(tags.length > 0 && {tags}),
      title: flags.title,
      kind: flags.kind,
      body,
      tech_spec: techSpec,
      in_review: flags['in-review'] ? true : undefined,
      review_note: flags['review-note'],
      author_origin: flags['author-origin'],
    })

    if (!this.jsonEnabled()) {
      const page = res.data ?? {}
      this.log(flags['in-review'] ? 'Knowledge page proposed, waiting for review:' : 'Knowledge page created:')
      this.log(renderRecord({...page, ...pageScopeLines(page)}))
    }

    return res
  }
}
