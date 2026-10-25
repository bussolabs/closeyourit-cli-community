// CYCL-51 — the third-party steps CI runs are referenced by digest, not by name.
//
// `uses: actions/checkout@v6` does not name code: it names a label the owner can move to any
// commit, at any time, without telling anyone. Whoever got into that repository would move `v6`
// and our CI would run the new code on the next run — with the permissions we give it here, which
// for the `publish` job include the identity we publish to npm with. A 40-digit digest instead is
// the content: if it changes, it is no longer the same thing.
//
// It applies to every shape that brings in someone else's code, not only to actions:
// `docker://alpine` and `docker://alpine:latest` are moving names exactly like `@v6`, and an image
// is pinned with the content digest (`@sha256:…`). Exempting everything that is not an action
// wholesale would let back in through the window the problem this test exists to close.
//
// The `# vX.Y.Z` comment next to the digest is not decoration: without it, nobody knows any more
// which version is running or when it is time to update it, and the pin becomes a forgotten pin.
//
// Workflows are read as TEXT, without a YAML parser: adding a dependency only for the tests would
// contradict the premise of this package, which carries as few as possible.

import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const WORKFLOWS_DIR = path.join(ROOT, '.github/workflows')

type Step = {comment: string; file: string; reference: string; line: number; text: string}

// How a reference is pinned, depending on its shape: what it must contain (`digest`), what it must
// tell us next to it (`version`), and what to write to whoever reads it in red.
type Rule = {help: string; digest: RegExp; version: RegExp}

function ruleFor(reference: string): Rule | null {
  // An action inside this same repository is versioned by our commit: by construction it has no
  // digest of its own, and there is no third party that could change it under us.
  if (reference.startsWith('./')) return null

  if (reference.startsWith('docker://')) {
    return {
      help: 'pin the image by its digest — docker://image@sha256:… — and write "# tag" next to it',
      digest: /@sha256:[\da-f]{64}$/,
      // An image does not necessarily have a `vX.Y.Z` number: it is enough to say which tag that digest is.
      version: /#\s*\S+/,
    }
  }

  return {
    help: 'use the SHA of the commit that name points to today, followed by "# vX.Y.Z"',
    digest: /@[\da-f]{40}$/,
    version: /#\s*v\d+(\.\d+)*\b/,
  }
}

// The reason a reference is not good, or `null` if it is. A single function, used both on the
// real workflow steps and on the cases below: what the test claims to check is exactly what
// runs in CI.
function problemOf(reference: string, comment: string): null | string {
  const rule = ruleFor(reference)
  if (!rule) return null
  if (!rule.digest.test(reference)) return `referenced by name, not by digest: ${rule.help}`
  if (!rule.version.test(comment)) return `does not say which version it is: ${rule.help}`
  return null
}

function thirdPartySteps(): Step[] {
  const files = readdirSync(WORKFLOWS_DIR).filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))
  expect(files, 'no workflow found: the test would search an empty folder and say green').not.toHaveLength(0)

  const steps: Step[] = []
  for (const name of files) {
    const lines = readFileSync(path.join(WORKFLOWS_DIR, name), 'utf8').split('\n')
    lines.forEach((line, index) => {
      // Only a real directive: `uses:` at the start of the line (after the indentation or the list
      // dash). This way `uses` mentioned inside a comment or a script does not count.
      const found = /^\s*(?:-\s*)?uses:\s*(\S+)(.*)$/.exec(line)
      if (!found) return
      steps.push({comment: found[2]!, file: name, reference: found[1]!, line: index + 1, text: line.trim()})
    })
  }

  return steps
}

const steps = thirdPartySteps()

// A sample digest: what matters here is the shape, not what it points to.
const DIGEST = `sha256:${'a'.repeat(64)}`
const SHA = 'd23441a48e516b6c34aea4fa41551a30e30af803'

const CASES: {expected: 'ok' | 'rejected'; comment: string; reference: string}[] = [
  {expected: 'rejected', comment: '', reference: 'actions/checkout@v6'},
  {expected: 'rejected', comment: ' # v6.1.0', reference: 'actions/checkout@v6'},
  {expected: 'rejected', comment: '', reference: `actions/checkout@${SHA}`},
  {expected: 'rejected', comment: '', reference: 'actions/checkout'},
  {expected: 'ok', comment: ' # v6.1.0', reference: `actions/checkout@${SHA}`},
  {expected: 'ok', comment: ' # v4.3.0', reference: `jdx/mise-action@${SHA}`},
  // The two shapes a too-broad exemption would let through: an image without a tag and one with
  // the moving tag par excellence.
  {expected: 'rejected', comment: ' # 3.20', reference: 'docker://alpine'},
  {expected: 'rejected', comment: ' # 3.20', reference: 'docker://alpine:latest'},
  {expected: 'ok', comment: ' # 3.20', reference: `docker://alpine@${DIGEST}`},
  {expected: 'rejected', comment: '', reference: `docker://alpine@${DIGEST}`},
  {expected: 'ok', comment: '', reference: './.github/actions/something'},
]

describe('what this check accepts and what it rejects', () => {
  it.each(CASES)('$reference «$comment» → $expected', (testCase) => {
    const problem = problemOf(testCase.reference, testCase.comment)
    expect(problem === null ? 'ok' : 'rejected', problem ?? '').toBe(testCase.expected)
  })
})

describe('the third-party steps run by CI', () => {
  it('CI really runs some (otherwise the checks below look at nothing)', () => {
    expect(steps.length).toBeGreaterThan(0)
  })

  it.each(steps)('$file:$line is pinned to the verified content', (step) => {
    const problem = problemOf(step.reference, step.comment)
    expect(problem, `${step.file}:${step.line} ${problem}\n  ${step.text}`).toBeNull()
  })
})
