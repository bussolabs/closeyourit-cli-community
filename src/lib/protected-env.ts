/**
 * Environment variables a vault secret must never override when `cyi run` spawns the child.
 * They decide which binaries, loaders and startup files get executed, so a poisoned secret
 * would turn into code execution on the developer's machine (CYCL-74). The server filters
 * these names too; this is defence in depth.
 */
const PROTECTED_ENV_NAMES = new Set([
  'PATH',
  'NODE_OPTIONS',
  'BASH_ENV',
  'ENV',
  'GIT_SSH_COMMAND',
  'PERL5OPT',
  'RUBYOPT',
  'PYTHONPATH',
  'PYTHONSTARTUP',
  'SHELL',
  'HOME',
  'IFS',
])

const PROTECTED_ENV_PREFIXES = ['LD_', 'DYLD_']

/** Case-insensitive: Windows treats `path` and `PATH` as the same variable. */
export function isProtectedEnvName(name: string): boolean {
  const upper = name.toUpperCase()
  return PROTECTED_ENV_NAMES.has(upper) || PROTECTED_ENV_PREFIXES.some((prefix) => upper.startsWith(prefix))
}

/** Merge secrets over the base env, dropping protected names. `skipped` keeps the order received. */
export function mergeSecretsIntoEnv(
  base: NodeJS.ProcessEnv,
  secrets: Record<string, string>,
): {env: NodeJS.ProcessEnv; skipped: string[]} {
  const env: NodeJS.ProcessEnv = {...base}
  const skipped: string[] = []
  for (const [name, value] of Object.entries(secrets)) {
    if (isProtectedEnvName(name)) skipped.push(name)
    else env[name] = value
  }
  return {env, skipped}
}

/** One stderr line naming the skipped secrets, never their values. */
export function skippedSecretsWarning(skipped: string[]): string {
  return `Warning: skipped ${skipped.length === 1 ? 'secret' : 'secrets'} that would override protected environment variables: ${skipped.join(', ')}`
}
