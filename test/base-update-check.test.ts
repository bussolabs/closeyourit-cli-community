import {afterEach, describe, expect, it, vi} from 'vitest'
import {capture, run} from './helpers/command'

vi.mock('../src/lib/api', async (io) => {
  const actual = await io<typeof import('../src/lib/api')>()
  const {apiMock} = await import('./helpers/api-mock')
  return {...actual, CliApi: vi.fn(function () { return apiMock })}
})
vi.mock('../src/lib/config', async (io) => {
  const actual = await io<typeof import('../src/lib/config')>()
  return {...actual, loadConfig: vi.fn(() => ({apiUrl: 'https://api.test', token: 'tok_test'}))}
})
vi.mock('../src/lib/update-check', () => ({updateNotice: vi.fn()}))

import {updateNotice} from '../src/lib/update-check'
import Whoami from '../src/commands/whoami'

afterEach(() => vi.mocked(updateNotice).mockReset())

describe('BaseCommand update notice', () => {
  it('prints the notice on stderr before the command runs, with the installed version', async () => {
    vi.mocked(updateNotice).mockResolvedValue('cyi 0.1.0 is out of date')
    const io = capture()
    try {
      await run(Whoami, ['--json']).catch(() => undefined)
    } finally {
      io.restore()
    }

    expect(io.stderr()).toContain('cyi 0.1.0 is out of date')
    expect(io.stdout()).not.toContain('out of date')
    const [version, deps] = vi.mocked(updateNotice).mock.calls[0]
    expect(version).toMatch(/^\d+\.\d+\.\d+/)
    expect(deps.cacheDir).toBeTruthy()
  })

  it('prints nothing when the CLI is current', async () => {
    vi.mocked(updateNotice).mockResolvedValue(undefined)
    const io = capture()
    try {
      await run(Whoami, ['--json']).catch(() => undefined)
    } finally {
      io.restore()
    }

    expect(io.stderr()).not.toContain('out of date')
  })
})
