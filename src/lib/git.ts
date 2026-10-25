import {execFile} from 'node:child_process'
import {promisify} from 'node:util'

const run = promisify(execFile)

/**
 * `owner/name` out of a git remote URL, in both shapes git writes them:
 *   git@github.com:bussolabs/closeyourit-cli.git
 *   https://github.com/bussolabs/closeyourit-cli
 *
 * Only the last two path segments are kept, so a nested group (gitlab) still yields the pair the
 * project→repository map is keyed by. Anything that is not a pair — a local path, an empty remote —
 * returns undefined: the caller then simply has no project, which is a legitimate state (CYCL-55,
 * scenario 2), not an error.
 */
export function parseRepoSlug(url: string): string | undefined {
  const trimmed = url.trim()
  if (trimmed === '') return undefined
  // A repository cloned from disk (`file:///srv/git/acme/api.git`) has no owner: keeping its last
  // two directories would invent a slug that could collide with a real `owner/name`.
  if (/^file:\/\//i.test(trimmed)) return undefined

  // With a scheme the path starts after the host; the scp-like form has everything past the colon.
  const marker = trimmed.indexOf('://')
  const path =
    marker === -1
      ? trimmed.slice(trimmed.indexOf(':') + 1)
      : trimmed
          .slice(marker + 3)
          .split('/')
          .slice(1)
          .join('/')

  if (marker === -1 && !trimmed.includes(':')) return undefined

  const parts = path
    .replace(/\.git$/i, '')
    .split('/')
    .filter((part) => part !== '')
  return parts.length < 2 ? undefined : parts.slice(-2).join('/')
}

/**
 * The `origin` remote of `cwd` as `owner/name`, or undefined when there is none to read: outside a
 * repository, without an `origin`, or without git installed. Never throws and never waits long —
 * this runs at the start of a session, where a hang would be felt on every single start.
 */
export async function repoSlug(cwd: string, timeoutMs = 2000): Promise<string | undefined> {
  try {
    const {stdout} = await run('git', ['remote', 'get-url', 'origin'], {cwd, timeout: timeoutMs})
    return parseRepoSlug(stdout)
  } catch {
    return undefined
  }
}
