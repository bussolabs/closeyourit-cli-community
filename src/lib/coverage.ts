// CYCL-78 — turns SimpleCov `.resultset.json` files into the coverage extract that
// POST /api/v1/projects/:id/coverage stores (one snapshot per branch, last write wins).
// Same extract the CloseYourIt CI builds, so both sources read the same way.

type Hits = number | null
export type BranchHits = Record<string, Record<string, number>>
export interface FileCoverage {
  lines: Hits[]
  branches: BranchHits
}
export type MergedCoverage = Record<string, FileCoverage>

export interface ExtractFile {
  path: string
  lines_relevant: number
  lines_covered: number
  branches_total: number
  branches_covered: number
  never_loaded: boolean
}

export interface UncoveredBranch {
  path: string
  type: string
  line: number | null
  column: number | null
  parent_line_hits: number
  body_token: string
}

export interface CoverageBody {
  branch: string
  sha?: string
  captured_at: string
  line_covered_percent: number
  branch_covered_percent: number
  files_count: number
  never_loaded_count: number
  payload: {
    files: ExtractFile[]
    uncovered_branches: UncoveredBranch[]
    run: {command: string; sha?: string; branch: string; captured_at: string}
  }
}

const MAX_UNCOVERED = 5000
const BODY_TOKEN_LENGTH = 60

function fileCoverage(raw: unknown): FileCoverage {
  if (Array.isArray(raw)) return {lines: raw as Hits[], branches: {}}
  const data = (raw ?? {}) as {lines?: Hits[]; branches?: BranchHits}
  return {lines: data.lines ?? [], branches: data.branches ?? {}}
}

function addLines(into: Hits[], from: Hits[]): Hits[] {
  const length = Math.max(into.length, from.length)
  return Array.from({length}, (_, i) => {
    const a = into[i] ?? null
    const b = from[i] ?? null
    return a === null && b === null ? null : (a ?? 0) + (b ?? 0)
  })
}

function addBranches(into: BranchHits, from: BranchHits): BranchHits {
  const result: BranchHits = {...into}
  for (const [condition, targets] of Object.entries(from)) {
    const merged = {...result[condition]}
    for (const [target, hits] of Object.entries(targets)) merged[target] = (merged[target] ?? 0) + Number(hits)
    result[condition] = merged
  }
  return result
}

/** Sums every suite of every resultset: parallel parts of one run add up to the whole run. */
export function mergeResultsets(resultsets: unknown[]): MergedCoverage {
  const merged: MergedCoverage = {}
  for (const resultset of resultsets) {
    for (const suite of Object.values((resultset ?? {}) as Record<string, {coverage?: Record<string, unknown>}>)) {
      for (const [path, raw] of Object.entries(suite?.coverage ?? {})) {
        const file = fileCoverage(raw)
        const current = merged[path]
        merged[path] = current
          ? {lines: addLines(current.lines, file.lines), branches: addBranches(current.branches, file.branches)}
          : {lines: [...file.lines], branches: addBranches({}, file.branches)}
      }
    }
  }
  return merged
}

// SimpleCov writes branch keys with Ruby's inspect: "[:then, 1, 3, 4, 3, 12]"
// (type, id, start line, start column, end line, end column).
function parseBranchKey(key: string): {type: string; line: number | null; column: number | null} {
  const match = /^\[:(\w+), \d+, (\d+), (\d+), \d+, \d+\]$/.exec(key)
  if (!match) return {type: '', line: null, column: null}
  return {type: match[1], line: Number(match[2]), column: Number(match[3])}
}

function percent(covered: number, total: number): number {
  return total === 0 ? 0 : Math.round((10_000 * covered) / total) / 100
}

export interface BuildOptions {
  root: string
  branch: string
  sha: string | undefined
  capturedAt: string
  command?: string
  readSource: (relativePath: string) => string[]
}

export function buildCoverageBody(coverage: MergedCoverage, options: BuildOptions): CoverageBody {
  const root = options.root.endsWith('/') ? options.root : `${options.root}/`
  const files: ExtractFile[] = []
  const uncovered: UncoveredBranch[] = []
  let lineRelevant = 0
  let lineCovered = 0
  let branchTotal = 0
  let branchCovered = 0
  let neverLoaded = 0

  for (const [path, data] of Object.entries(coverage)) {
    if (!path.startsWith(root)) continue
    const rel = path.slice(root.length)
    const relevant = data.lines.filter((hit) => hit !== null).length
    const covered = data.lines.filter((hit) => typeof hit === 'number' && hit > 0).length
    let fileTotal = 0
    let fileCovered = 0
    let source: string[] | undefined

    for (const [condition, targets] of Object.entries(data.branches)) {
      const parentLine = parseBranchKey(condition).line
      for (const [target, hits] of Object.entries(targets)) {
        fileTotal += 1
        if (hits > 0) {
          fileCovered += 1
        } else if (uncovered.length < MAX_UNCOVERED) {
          const {type, line, column} = parseBranchKey(target)
          source ??= options.readSource(rel)
          uncovered.push({
            path: rel, type, line, column,
            // Hits of the condition line: tells an else never taken in hot code from dead code.
            parent_line_hits: parentLine === null ? 0 : Number(data.lines[parentLine - 1] ?? 0),
            body_token: line === null ? '' : (source[line - 1] ?? '').trim().slice(0, BODY_TOKEN_LENGTH),
          })
        }
      }
    }

    const never = relevant > 0 && covered === 0 && fileCovered === 0
    if (never) neverLoaded += 1
    lineRelevant += relevant
    lineCovered += covered
    branchTotal += fileTotal
    branchCovered += fileCovered
    files.push({path: rel, lines_relevant: relevant, lines_covered: covered, branches_total: fileTotal, branches_covered: fileCovered, never_loaded: never})
  }

  return {
    branch: options.branch,
    sha: options.sha,
    captured_at: options.capturedAt,
    line_covered_percent: percent(lineCovered, lineRelevant),
    branch_covered_percent: percent(branchCovered, branchTotal),
    files_count: files.length,
    never_loaded_count: neverLoaded,
    payload: {
      files,
      uncovered_branches: uncovered,
      run: {command: options.command ?? 'rspec', sha: options.sha, branch: options.branch, captured_at: options.capturedAt},
    },
  }
}
