import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {isNewer, updateNotice} from '../src/lib/update-check'

const DAY = 24 * 60 * 60 * 1000

let cacheDir: string

beforeEach(() => {
  cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyi-update-'))
})

afterEach(() => {
  fs.rmSync(cacheDir, {recursive: true, force: true})
})

// Published long before every `now` the tests use, so mise would install it.
const OLD = new Date(-10 * DAY).toISOString()

function registry(version: string, publishedAt = OLD) {
  return vi.fn(async () => ({ok: true, json: async () => ({time: {created: OLD, modified: publishedAt, [version]: publishedAt}})}))
}

function cacheFile(): {checkedAt: number; versions: Record<string, string>} {
  return JSON.parse(fs.readFileSync(path.join(cacheDir, 'update-check.json'), 'utf8'))
}

describe('isNewer', () => {
  it('compares the numeric core, not the strings', () => {
    expect(isNewer('0.32.10', '0.32.9')).toBe(true)
    expect(isNewer('1.0.0', '0.99.99')).toBe(true)
    expect(isNewer('0.32.1', '0.32.1')).toBe(false)
    expect(isNewer('0.32.0', '0.32.1')).toBe(false)
  })

  it('treats an unreadable version as not newer', () => {
    expect(isNewer('garbage', '0.1.0')).toBe(false)
  })
})

describe('updateNotice', () => {
  it('tells how to update when the registry has a newer version', async () => {
    const notice = await updateNotice('0.32.1', {cacheDir, env: {}, now: () => 0, fetch: registry('0.33.0')})

    expect(notice).toContain('0.32.1')
    expect(notice).toContain('0.33.0')
    expect(notice).toContain('mise upgrade --bump "npm:@bussolabs/closeyourit-cli"')
  })

  it('stays silent when the installed version is the latest or newer', async () => {
    expect(await updateNotice('0.33.0', {cacheDir, env: {}, now: () => 0, fetch: registry('0.33.0')})).toBeUndefined()
    fs.rmSync(path.join(cacheDir, 'update-check.json'))
    expect(await updateNotice('0.34.0-beta.1', {cacheDir, env: {}, now: () => 0, fetch: registry('0.33.0')})).toBeUndefined()
  })

  it('asks the registry at most once a day', async () => {
    const fetch = registry('0.33.0')
    await updateNotice('0.32.1', {cacheDir, env: {}, now: () => 0, fetch})
    const notice = await updateNotice('0.32.1', {cacheDir, env: {}, now: () => DAY - 1, fetch})

    expect(fetch).toHaveBeenCalledTimes(1)
    expect(notice).toContain('0.33.0')

    await updateNotice('0.32.1', {cacheDir, env: {}, now: () => DAY + 1, fetch})
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('stays silent and waits a day when the registry is unreachable', async () => {
    const fetch = vi.fn(async () => {
      throw new Error('offline')
    })

    expect(await updateNotice('0.32.1', {cacheDir, env: {}, now: () => 0, fetch})).toBeUndefined()
    expect(cacheFile()).toEqual({checkedAt: 0, versions: {}})

    await updateNotice('0.32.1', {cacheDir, env: {}, now: () => 1000, fetch})
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('keeps the last known version when a later check fails', async () => {
    await updateNotice('0.32.1', {cacheDir, env: {}, now: () => 0, fetch: registry('0.33.0')})
    const failing = vi.fn(async () => ({ok: false, json: async () => ({})}))

    const notice = await updateNotice('0.32.1', {cacheDir, env: {}, now: () => DAY + 1, fetch: failing})

    expect(notice).toContain('0.33.0')
  })

  it('ignores a corrupt cache file', async () => {
    fs.writeFileSync(path.join(cacheDir, 'update-check.json'), '{not json')

    expect(await updateNotice('0.32.1', {cacheDir, env: {}, now: () => 0, fetch: registry('0.33.0')})).toContain('0.33.0')
  })

  it('never checks in CI or when switched off', async () => {
    const fetch = registry('0.33.0')

    expect(await updateNotice('0.32.1', {cacheDir, env: {CI: 'true'}, now: () => 0, fetch})).toBeUndefined()
    expect(await updateNotice('0.32.1', {cacheDir, env: {CLOSEYOURIT_NO_UPDATE_CHECK: '1'}, now: () => 0, fetch})).toBeUndefined()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('offers the newest stable version as soon as it is published, skipping prereleases', async () => {
    // mise exempts this package from minimum_release_age, so a fresh release installs right away.
    const now = 100 * DAY
    const fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        time: {
          created: OLD,
          modified: new Date(now - 1000).toISOString(),
          '0.31.0': new Date(now - 3 * DAY).toISOString(),
          '0.32.1': new Date(now - 1000).toISOString(),
          '0.33.0-beta.1': new Date(now - 500).toISOString(),
        },
      }),
    }))

    expect(await updateNotice('0.30.0', {cacheDir, env: {}, now: () => now, fetch})).toContain('0.32.1 is available')
  })

  it('never fails the command when the cache directory cannot be written', async () => {
    const blocked = path.join(cacheDir, 'file-not-dir')
    fs.writeFileSync(blocked, '')

    expect(await updateNotice('0.32.1', {cacheDir: blocked, env: {}, now: () => 0, fetch: registry('0.33.0')})).toContain('0.33.0')
  })
})
