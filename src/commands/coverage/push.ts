import {Flags} from '@oclif/core'
import {readFileSync} from 'node:fs'
import {join, resolve} from 'node:path'
import {BaseCommand, projectFlag} from '../../base'
import {buildCoverageBody, mergeResultsets} from '../../lib/coverage'

interface CoverageReport {
  branch?: string
  line_covered_percent?: string | number
  branch_covered_percent?: string | number
  files_count?: number
}

// CYCL-78 — a CI sends its SimpleCov coverage. Works with the project ingest token in
// CLOSEYOURIT_TOKEN, so --project must then be the project ID (a key needs a user token to resolve).
export default class CoveragePush extends BaseCommand {
  static description =
    'Send SimpleCov coverage from CI: reads one or more .resultset.json files (parallel parts are merged) and stores the snapshot of a branch'

  static examples = [
    'CLOSEYOURIT_TOKEN=$INGEST_TOKEN <%= config.bin %> coverage push -p <project-id> --branch main',
    '<%= config.bin %> coverage push -p <project-id> --branch main --file part1/.resultset.json --file part2/.resultset.json',
  ]

  static flags = {
    ...projectFlag,
    branch: Flags.string({description: 'Branch the snapshot belongs to (from a tag build, the branch it was cut from, e.g. main)', required: true}),
    file: Flags.string({description: 'SimpleCov .resultset.json; repeat it for parallel parts', multiple: true, default: ['coverage/.resultset.json']}),
    sha: Flags.string({description: 'Commit measured (default: $GITHUB_SHA)'}),
    root: Flags.string({description: 'Project root the resultset paths start with (default: current directory)'}),
    command: Flags.string({description: 'Test command that produced the coverage', default: 'rspec'}),
  }

  async run(): Promise<unknown> {
    const {flags} = await this.parse(CoveragePush)
    const resultsets = flags.file.map((file) => {
      try {
        return JSON.parse(readFileSync(file, 'utf8')) as unknown
      } catch (error) {
        return this.error(`Cannot read the SimpleCov resultset ${file}: ${(error as Error).message}`, {exit: 2})
      }
    })

    const root = resolve(flags.root ?? process.cwd())
    const body = buildCoverageBody(mergeResultsets(resultsets), {
      root,
      branch: flags.branch,
      sha: flags.sha ?? process.env.GITHUB_SHA,
      capturedAt: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
      command: flags.command,
      readSource: (rel) => {
        try {
          return readFileSync(join(root, rel), 'utf8').split('\n')
        } catch {
          return []
        }
      },
    })

    const projectId = await this.resolveProjectId(flags.project)
    const res = await this.api.post<CoverageReport>(`/api/v1/projects/${encodeURIComponent(projectId)}/coverage`, body)

    if (!this.jsonEnabled()) {
      this.log(`${body.branch}  line ${body.line_covered_percent}%  branch ${body.branch_covered_percent}%  files ${body.files_count}  sent`)
    }

    return res
  }
}
