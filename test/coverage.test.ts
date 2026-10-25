import {describe, expect, it} from 'vitest'
import {buildCoverageBody, mergeResultsets} from '../src/lib/coverage'

const ROOT = '/app'

// A SimpleCov .resultset.json: one suite per file, branch keys are Ruby inspect strings.
function resultset(name: string, coverage: Record<string, unknown>, timestamp = 1) {
  return {[name]: {coverage, timestamp}}
}

describe('mergeResultsets', () => {
  it('sums line and branch hits of the parallel parts', () => {
    const part1 = resultset('RSpec (1/2)', {
      '/app/a.rb': {lines: [1, 0, null], branches: {'[:if, 0, 2, 0, 4, 3]': {'[:then, 1, 2, 2, 2, 8]': 0, '[:else, 2, 3, 2, 3, 8]': 1}}},
    })
    const part2 = resultset('RSpec (2/2)', {
      '/app/a.rb': {lines: [0, 2, null], branches: {'[:if, 0, 2, 0, 4, 3]': {'[:then, 1, 2, 2, 2, 8]': 3, '[:else, 2, 3, 2, 3, 8]': 0}}},
      '/app/b.rb': {lines: [0]},
    })

    const merged = mergeResultsets([part1, part2])

    expect(merged['/app/a.rb'].lines).toEqual([1, 2, null])
    expect(merged['/app/a.rb'].branches['[:if, 0, 2, 0, 4, 3]']).toEqual({'[:then, 1, 2, 2, 2, 8]': 3, '[:else, 2, 3, 2, 3, 8]': 1})
    expect(merged['/app/b.rb'].lines).toEqual([0])
  })

  it('reads the old format where a file is just its line array', () => {
    const merged = mergeResultsets([resultset('RSpec', {'/app/a.rb': [1, null, 0]})])

    expect(merged['/app/a.rb']).toEqual({lines: [1, null, 0], branches: {}})
  })
})

describe('buildCoverageBody', () => {
  const source = (path: string) => (path === 'a.rb' ? ['def x', '  if y', '    run_then', '  end'] : [])

  it('builds the summary and the per-file extract the endpoint expects', () => {
    const coverage = mergeResultsets([resultset('RSpec', {
      '/app/a.rb': {lines: [1, 4, 0, null], branches: {'[:if, 0, 2, 2, 4, 5]': {'[:then, 1, 3, 4, 3, 12]': 0, '[:else, 2, 2, 2, 4, 5]': 4}}},
      '/app/never.rb': {lines: [0, 0]},
      '/elsewhere/gem.rb': {lines: [1]},
    })])

    const body = buildCoverageBody(coverage, {root: ROOT, branch: 'main', sha: 'abc123', capturedAt: '2026-10-22T10:00:00Z', readSource: source})

    expect(body).toMatchObject({
      branch: 'main', sha: 'abc123', captured_at: '2026-10-22T10:00:00Z',
      line_covered_percent: 40, branch_covered_percent: 50, files_count: 2, never_loaded_count: 1,
    })
    expect(body.payload.files).toEqual([
      {path: 'a.rb', lines_relevant: 3, lines_covered: 2, branches_total: 2, branches_covered: 1, never_loaded: false},
      {path: 'never.rb', lines_relevant: 2, lines_covered: 0, branches_total: 0, branches_covered: 0, never_loaded: true},
    ])
    expect(body.payload.uncovered_branches).toEqual([
      {path: 'a.rb', type: 'then', line: 3, column: 4, parent_line_hits: 4, body_token: 'run_then'},
    ])
    expect(body.payload.run).toEqual({command: 'rspec', sha: 'abc123', branch: 'main', captured_at: '2026-10-22T10:00:00Z'})
  })

  it('reports zero percent instead of dividing by zero when nothing is relevant', () => {
    const body = buildCoverageBody({}, {root: ROOT, branch: 'main', sha: undefined, capturedAt: 'now', readSource: () => []})

    expect(body.line_covered_percent).toBe(0)
    expect(body.branch_covered_percent).toBe(0)
    expect(body.files_count).toBe(0)
  })
})
