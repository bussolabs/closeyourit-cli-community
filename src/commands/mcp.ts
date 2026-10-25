import {Flags} from '@oclif/core'
import {BaseCommand} from '../base'
import {createSession, serveStdio} from '../lib/mcp/server'

export default class Mcp extends BaseCommand {
  // No `--json`: on this command standard output is the protocol channel, and an extra envelope
  // at the end would be the only line the client cannot read.
  static enableJsonFlag = false

  static description =
    'Serve the knowledge base over the Model Context Protocol on stdin/stdout, so any assistant that speaks MCP can search it, ask it and propose pages — with your own access and no instructions written for it'

  static examples = [
    '<%= config.bin %> mcp',
    'CLOSEYOURIT_TOKEN=cyi_u_… <%= config.bin %> mcp',
  ]

  static flags = {
    timeout: Flags.integer({
      description: 'Seconds to wait for git when recognising the project of the current directory',
      default: 5,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(Mcp)
    // The server lives as long as the client keeps its standard input open: the client launches it
    // as a subprocess and closes it, there is nothing to print before or after.
    await serveStdio(
      process.stdin,
      process.stdout,
      createSession({
        api: this.api,
        version: this.config.version,
        cwd: process.cwd(),
        timeoutMs: flags.timeout * 1000,
      }),
    )
  }
}
