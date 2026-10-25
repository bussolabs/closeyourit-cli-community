// CYCL-50 — no command group stays silent.
//
// oclif derives a topic from EVERY folder under src/commands, but it takes the sentence saying what it
// is for only from `oclif.topics` in package.json: what the code does not declare exists
// nowhere. A group without a description shows up as an empty line in the help (`closeyourit
// --help`, `closeyourit alerts --help`) and in the published catalogue (opencli.json, which reads the
// same topics), so the reader has to open the subcommands to understand what it is about.
//
// The gap does not come from an oversight on a single group: it comes from the fact that adding a folder is
// enough to make a topic appear, and nothing forces writing the line in package.json too. That is why
// the check starts from the filesystem and not from a hand-written list — a list would go out of sync
// exactly like the topics.

import {readFileSync, readdirSync} from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

import {describe, expect, it} from 'vitest'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const topics = (
  JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as {
    oclif: {topics: Record<string, {description?: string}>}
  }
).oclif.topics

// The oclif ids of the topics, derived from the folders as oclif itself does: a folder is a topic, and
// nesting becomes `parent:child` (the manifest uses ':' whatever the topicSeparator).
function topicsFromFolders(dir: string, prefix = ''): string[] {
  const id: string[] = []
  for (const entry of readdirSync(dir, {withFileTypes: true})) {
    if (!entry.isDirectory()) continue
    const name = prefix ? `${prefix}:${entry.name}` : entry.name
    id.push(name, ...topicsFromFolders(path.join(dir, entry.name), name))
  }

  return id.sort()
}

const groups = topicsFromFolders(path.join(ROOT, 'src/commands'))

describe('command groups describe themselves', () => {
  it('there really are groups to check', () => {
    // If a refactor moved the commands elsewhere, the two tests below would pass vacuously on an
    // empty list and nobody would notice.
    expect(groups.length).toBeGreaterThan(0)
  })

  it('every group declares a non-empty description', () => {
    const silent = groups.filter((id) => !topics[id]?.description?.trim())
    // The list is in the message: whoever adds a new folder reads right away which line to write
    // in package.json, without having to trace back from the red to what is missing.
    expect(silent, `groups without a description in oclif.topics: ${silent.join(', ')}`).toEqual([])
  })

  it('no description stays attached to a group that no longer exists', () => {
    // The reverse of the same failure: after a rename the old line survives in
    // package.json, describes nothing and makes a group that is actually silent look covered.
    const orphans = Object.keys(topics).filter((id) => !groups.includes(id))
    expect(orphans, `descriptions without a folder in src/commands: ${orphans.join(', ')}`).toEqual([])
  })
})
