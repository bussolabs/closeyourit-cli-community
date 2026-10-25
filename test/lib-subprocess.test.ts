import {describe, expect, it} from 'vitest'
import {runCommand} from '../src/lib/subprocess'

describe('runCommand', () => {
  it('resolves with exit code 0 when the command succeeds', async () => {
    const code = await runCommand(process.execPath, ['-e', 'process.exit(0)'], process.env)
    expect(code).toBe(0)
  })

  it('resolves with the child\'s non-zero exit code', async () => {
    const code = await runCommand(process.execPath, ['-e', 'process.exit(3)'], process.env)
    expect(code).toBe(3)
  })

  it('rejects when the command does not exist', async () => {
    await expect(runCommand('definitely-not-a-real-binary-xyz', [], process.env)).rejects.toBeInstanceOf(Error)
  })
})
