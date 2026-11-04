import {readFile} from 'node:fs/promises'
import {Flags} from '@oclif/core'
import {BaseCommand} from '../../base'
import {cleanList} from '../../lib/knowledge'
import {LENGTH_LIMITS, tooLongMessage} from '../../lib/limits'
import {renderRecord} from '../../lib/output'
import {readStream} from '../../lib/stdin'

export default class WikitechAdd extends BaseCommand {
  static description =
    'Save a tech notion (tool, library, open-source repo) to Wikitech; sending the same text and source again creates nothing new'

  static examples = [
    '<%= config.bin %> wikitech add --file ./note.txt --source-label "TikTok @github.signals" --source-url https://www.tiktok.com/@github.signals/video/1',
    'pbpaste | <%= config.bin %> wikitech add --link https://github.com/astral-sh/uv',
    '<%= config.bin %> wikitech add --file - --source-published-at 2026-10-30T10:00:00Z --json < note.txt',
  ]

  static flags = {
    file: Flags.string({
      description: `Read the body (plain text, max ${LENGTH_LIMITS.wikitechNoteBody} characters) from a file; "-" or no flag with piped input reads stdin`,
    }),
    'source-label': Flags.string({
      description: `Where the notion comes from, e.g. "TikTok @github.signals" (max ${LENGTH_LIMITS.wikitechSourceLabel} characters)`,
    }),
    'source-url': Flags.string({description: 'http(s) URL of the original content'}),
    'source-published-at': Flags.string({description: 'When the original content was published (ISO 8601)'}),
    link: Flags.string({description: 'http(s) URL found in the content (repeatable, max 50)', multiple: true}),
  }

  async run(): Promise<unknown> {
    const {flags} = await this.parse(WikitechAdd)

    const body = await this.readBody(flags.file)
    if (body.trim() === '') this.error('The note body is empty: nothing to save.', {exit: 2})

    const tooLong = tooLongMessage([
      {flag: flags.file === undefined || flags.file === '-' ? 'stdin' : '--file', value: body, max: LENGTH_LIMITS.wikitechNoteBody},
      {flag: '--source-label', value: flags['source-label'], max: LENGTH_LIMITS.wikitechSourceLabel},
    ])
    if (tooLong) this.error(tooLong, {exit: 2})

    const links = cleanList(flags.link)
    const res = await this.api.post<Record<string, unknown>>('/cli/v1/wikitech/notes', {
      body,
      ...(flags['source-label'] !== undefined && {source_label: flags['source-label']}),
      ...(flags['source-url'] !== undefined && {source_url: flags['source-url']}),
      ...(flags['source-published-at'] !== undefined && {source_published_at: flags['source-published-at']}),
      ...(links.length > 0 && {links}),
    })

    if (!this.jsonEnabled()) {
      this.log(
        res.meta?.duplicate
          ? 'Already saved: the same text and source exist, nothing new was created.'
          : 'Note saved, waiting to be processed:',
      )
      this.log(renderRecord(res.data ?? {}))
    }

    return res
  }

  private async readBody(file: string | undefined): Promise<string> {
    if (file !== undefined && file !== '-') {
      try {
        return await readFile(file, 'utf8')
      } catch {
        this.error(`File not found or unreadable: ${file}`, {exit: 2})
      }
    }

    // Without --file a terminal would wait forever for input nobody knows is expected.
    if (file === undefined && process.stdin.isTTY) {
      this.error('Provide the note body via --file <path>, or pipe it (e.g. "pbpaste | cyi wikitech add").', {exit: 2})
    }

    return readStream()
  }
}
