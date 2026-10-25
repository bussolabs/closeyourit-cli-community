import {BaseCommand, environmentFlag, projectFlag} from '../base'
import {mergeSecretsIntoEnv, skippedSecretsWarning} from '../lib/protected-env'
import {runCommand} from '../lib/subprocess'

/**
 * The child command + its args, taken from the raw command line starting after the first `--`.
 *
 * oclif's own `argv` can't be used: the parser re-sorts the tokens by the FIRST position the same
 * text has on the line, so `-- echo -p 3021` comes back as `['-p', 'echo', '3021']` and we would
 * spawn `-p` (CYCL-63). Without a `--` there is nothing to protect: oclif's `argv` already holds
 * the plain arguments.
 */
function childCommand(raw: string[], parsed: string[]): string[] {
  const separator = raw.indexOf('--')
  return separator === -1 ? parsed : raw.slice(separator + 1)
}

export default class Run extends BaseCommand {
  // Everything after `--` is the child command + its args (not parsed as flags).
  static strict = false
  // The output belongs to the child process, not to us.
  static enableJsonFlag = false

  static description = 'Run a command with project/environment secrets injected as env vars. Secrets never touch disk.'

  static examples = [
    '<%= config.bin %> run -p acme-api -e production -- bundle exec rails server',
    '<%= config.bin %> run -p acme-api -e production -- printenv DATABASE_URL',
  ]

  static flags = {
    ...projectFlag,
    ...environmentFlag,
  }

  async run(): Promise<unknown> {
    const {argv, flags} = await this.parse(Run)
    const parts = childCommand(this.argv, argv as string[])
    if (parts.length === 0) {
      this.error('Provide a command to run after `--`, e.g. `cyi run -p acme -e production -- printenv`', {exit: 1})
    }

    const projectId = await this.resolveProjectId(flags.project)
    const {data} = await this.api.get<Record<string, string>>(
      `/cli/v1/projects/${encodeURIComponent(projectId)}/secrets/bundle?environment=${encodeURIComponent(flags.environment)}`,
    )

    const [command, ...commandArgs] = parts
    const {env, skipped} = mergeSecretsIntoEnv(process.env, data ?? {})
    if (skipped.length > 0) this.logToStderr(skippedSecretsWarning(skipped))
    const code = await runCommand(command, commandArgs, env)
    // Propagate the child's exit code (0 on success) so `cyi run … && next` behaves like the child.
    this.exit(code)
  }
}
