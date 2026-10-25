import {BaseCommand} from '../../base'
import {mergeSecretsIntoEnv, skippedSecretsWarning} from '../../lib/protected-env'
import {runCommand} from '../../lib/subprocess'

export default class PersonalRun extends BaseCommand {
  // Everything after `--` is the child command + its args (not parsed as flags).
  static strict = false
  // The output belongs to the child process, not to us.
  static enableJsonFlag = false

  static description = 'Run a command with your personal secrets injected as env vars. Secrets never touch disk.'

  static examples = [
    '<%= config.bin %> personal run -- bundle exec rails server',
    '<%= config.bin %> personal run -- printenv OPENAI_API_KEY',
  ]

  async run(): Promise<unknown> {
    const {argv} = await this.parse(PersonalRun)
    const parts = argv as string[]
    if (parts.length === 0) {
      this.error('Provide a command to run after `--`, e.g. `cyi personal run -- printenv`', {exit: 1})
    }

    const {data} = await this.api.get<Record<string, string>>('/cli/v1/personal_secrets/bundle')

    const [command, ...commandArgs] = parts
    const {env, skipped} = mergeSecretsIntoEnv(process.env, data ?? {})
    if (skipped.length > 0) this.logToStderr(skippedSecretsWarning(skipped))
    const code = await runCommand(command, commandArgs, env)
    // Propagate the child's exit code (0 on success) so `cyi personal run … && next` behaves like the child.
    this.exit(code)
  }
}
