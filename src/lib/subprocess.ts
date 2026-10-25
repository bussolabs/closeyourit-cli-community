import {spawn} from 'node:child_process'

/**
 * Run a child process inheriting stdio, resolving with its exit code. Unlike `openUrl` (browser.ts)
 * this is NOT detached/unref'd: `cyi run` must stay attached and propagate the child's exit code
 * and propagate the child's exit code. A terminating signal maps to a non-zero code.
 */
export function runCommand(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {stdio: 'inherit', env})
    child.on('error', reject)
    child.on('exit', (code, signal) => resolve(code ?? (signal ? 1 : 0)))
  })
}
