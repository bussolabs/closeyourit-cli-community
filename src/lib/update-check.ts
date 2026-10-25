import * as fs from 'node:fs'
import * as path from 'node:path'

const PACKAGE = '@bussolabs/closeyourit-cli'
const REGISTRY_URL = `https://registry.npmjs.org/${PACKAGE.replace('/', '%2f')}`
const CACHE_FILE = 'update-check.json'
const DAY_MS = 24 * 60 * 60 * 1000
const CHECK_EVERY_MS = DAY_MS
// A command must never feel slower because the registry is: past this, skip until tomorrow.
const TIMEOUT_MS = 1500

interface Cache {
  checkedAt: number
  /** Stable version → publish time (ISO), as the registry reported it. */
  versions: Record<string, string>
}

type RegistryFetch = (url: string, init: {signal: AbortSignal}) => Promise<{ok: boolean; json: () => Promise<unknown>}>

export interface UpdateCheckDeps {
  cacheDir: string
  env?: NodeJS.ProcessEnv
  now?: () => number
  fetch?: RegistryFetch
}

function parse(version: string): number[] | undefined {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version)
  return match ? match.slice(1, 4).map(Number) : undefined
}

/** True when `candidate` is a strictly higher release than `current` (numeric core only). */
export function isNewer(candidate: string, current: string): boolean {
  const a = parse(candidate)
  const b = parse(current)
  if (!a || !b) return false
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i]
  }
  return false
}

function readCache(file: string): Cache | undefined {
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8')) as Cache
    return typeof data.checkedAt === 'number' && typeof data.versions === 'object' && data.versions !== null
      ? data
      : undefined
  } catch {
    return undefined
  }
}

function writeCache(file: string, cache: Cache): void {
  try {
    fs.mkdirSync(path.dirname(file), {recursive: true})
    fs.writeFileSync(file, JSON.stringify(cache))
  } catch {
    // An unwritable cache only means asking the registry again next time.
  }
}

/** Stable versions with their publish time, or undefined when the registry can't be read. */
async function fetchVersions(fetchImpl: RegistryFetch): Promise<Record<string, string> | undefined> {
  try {
    const res = await fetchImpl(REGISTRY_URL, {signal: AbortSignal.timeout(TIMEOUT_MS)})
    if (!res.ok) return undefined
    const body = (await res.json()) as {time?: Record<string, unknown>}
    const versions: Record<string, string> = {}
    for (const [version, time] of Object.entries(body.time ?? {})) {
      if (typeof time === 'string' && /^\d+\.\d+\.\d+$/.test(version)) versions[version] = time
    }
    return versions
  } catch {
    return undefined
  }
}

/** Highest stable version the registry lists. */
function newest(versions: Record<string, string>): string | undefined {
  let best: string | undefined
  for (const version of Object.keys(versions)) {
    if (!best || isNewer(version, best)) best = version
  }
  return best
}

/**
 * One line telling the user their CLI is behind the published one, or undefined.
 *
 * Flags change between versions, and an old CLI makes agent skills fail in silence on commands
 * they believe correct: the CLI itself says so, so no skill has to run a separate check first.
 * Checked at most once a day; offline, CI and CLOSEYOURIT_NO_UPDATE_CHECK stay silent.
 */
export async function updateNotice(current: string, deps: UpdateCheckDeps): Promise<string | undefined> {
  const env = deps.env ?? process.env
  if (env.CI || env.CLOSEYOURIT_NO_UPDATE_CHECK) return undefined

  const now = (deps.now ?? Date.now)()
  const file = path.join(deps.cacheDir, CACHE_FILE)
  const cached = readCache(file)
  let versions = cached?.versions ?? {}

  if (!cached || now - cached.checkedAt >= CHECK_EVERY_MS) {
    const fetched = await fetchVersions(deps.fetch ?? (globalThis.fetch as unknown as RegistryFetch))
    versions = fetched ?? versions
    writeCache(file, {checkedAt: now, versions})
  }

  const latest = newest(versions)
  if (!latest || !isNewer(latest, current)) return undefined
  return `cyi ${current} is out of date: ${latest} is available. Update with: mise upgrade --bump "npm:${PACKAGE}"`
}
