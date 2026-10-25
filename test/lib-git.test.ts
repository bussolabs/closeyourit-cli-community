import {execFileSync} from 'node:child_process'
import {mkdtemp, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import {parseRepoSlug, repoSlug} from '../src/lib/git'

describe('parseRepoSlug', () => {
  it('extracts owner/name from an SSH remote', () => {
    expect(parseRepoSlug('git@github.com:bussolabs/closeyourit-cli.git')).toBe('bussolabs/closeyourit-cli')
  })

  it('extracts owner/name from an HTTPS remote, with or without the .git suffix', () => {
    expect(parseRepoSlug('https://github.com/bussolabs/closeyourit-cli.git')).toBe('bussolabs/closeyourit-cli')
    expect(parseRepoSlug('https://github.com/bussolabs/closeyourit-cli')).toBe('bussolabs/closeyourit-cli')
  })

  it('ignores the port and the credentials in the URL', () => {
    expect(parseRepoSlug('https://user@git.example.com:8443/acme/api')).toBe('acme/api')
  })

  it('keeps only the last two segments of a nested path', () => {
    expect(parseRepoSlug('git@gitlab.com:acme/team/api.git')).toBe('team/api')
  })

  it('drops the trailing newline git prints', () => {
    expect(parseRepoSlug('git@github.com:acme/api.git\n')).toBe('acme/api')
  })

  it('returns undefined for a local repository reached via file://', () => {
    expect(parseRepoSlug('file:///Users/ada/repos/api')).toBeUndefined()
    expect(parseRepoSlug('file:///srv/git/acme/api.git')).toBeUndefined()
  })

  it('returns undefined for a remote that is not owner/name', () => {
    expect(parseRepoSlug('')).toBeUndefined()
    expect(parseRepoSlug('   ')).toBeUndefined()
    expect(parseRepoSlug('/Users/ada/repos/api')).toBeUndefined()
    expect(parseRepoSlug('git@github.com:api.git')).toBeUndefined()
  })
})

describe('repoSlug', () => {
  let dir = ''

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'cyi-git-'))
  })

  afterEach(async () => {
    await rm(dir, {force: true, recursive: true})
  })

  it('reads the origin remote of the repository', async () => {
    execFileSync('git', ['init', '-q'], {cwd: dir})
    execFileSync('git', ['remote', 'add', 'origin', 'git@github.com:acme/api.git'], {cwd: dir})
    await expect(repoSlug(dir)).resolves.toBe('acme/api')
  })

  it('returns undefined in a repository without origin', async () => {
    execFileSync('git', ['init', '-q'], {cwd: dir})
    await expect(repoSlug(dir)).resolves.toBeUndefined()
  })

  it('returns undefined outside a repository, without throwing', async () => {
    await expect(repoSlug('/dev/null/non-esiste')).resolves.toBeUndefined()
  })
})
