// CYRA-1029 — `cyi puck connect`: the Puck asks, the person answers here, nothing runs outside the
// allowed folders and commands.

import {mkdtempSync, mkdirSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import {apiMock, resetApiMock} from './helpers/api-mock'
import {envelope, runCaptured} from './helpers/command'

const answers = vi.hoisted(() => ({next: 'n'}))

vi.mock('node:timers/promises', () => ({setTimeout: async () => undefined}))
vi.mock('node:readline/promises', () => ({
  createInterface: () => ({question: async () => answers.next, close: () => undefined}),
}))
vi.mock('../src/lib/api', async (io) => {
  const actual = await io<typeof import('../src/lib/api')>()
  const {apiMock} = await import('./helpers/api-mock')
  return {...actual, CliApi: vi.fn(function () { return apiMock })}
})
vi.mock('../src/lib/config', async (io) => {
  const actual = await io<typeof import('../src/lib/config')>()
  return {...actual, loadConfig: vi.fn(() => ({apiUrl: 'https://api.test', token: 'tok_test'}))}
})

import PuckConnect from '../src/commands/puck/connect'
import {insideAllowed, refusal} from '../src/lib/puck-device'

const DEVICE = {id: 'd-1', token: 'cyi_d_secret'}

function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), 'puck-'))
  mkdirSync(join(dir, 'src'))
  writeFileSync(join(dir, 'src', 'app.rb'), 'puts 1')
  return dir
}

function serve(call: unknown): void {
  apiMock.post = vi.fn(async (path: string) => {
    if (path === '/cli/v1/coworkers/devices') return envelope(DEVICE)
    if (path.endsWith('/poll')) return envelope(call)
    return envelope({status: 'ok'})
  })
  apiMock.delete = vi.fn(async () => envelope(null))
}

function answer(): Record<string, unknown> | undefined {
  const sent = apiMock.post.mock.calls.find(([path]) => String(path).includes('/calls/'))
  return sent?.[1] as Record<string, unknown> | undefined
}

describe('puck connect', () => {
  beforeEach(() => {
    resetApiMock()
    answers.next = 'n'
  })

  it('keeps every path inside the allowed folders', async () => {
    const dir = workspace()
    expect(await insideAllowed('src/app.rb', [dir])).toContain('app.rb')
    expect(await insideAllowed('../../etc/passwd', [dir])).toBeUndefined()
    expect(await refusal({id: '1', tool: 'run_command', value: 'rm -rf /', puck: 'P'}, {dirs: [dir], commands: ['git status']}))
      .toMatch(/not on the allowed list/)
  })

  it('refuses a command outside the allowlist without asking, then disconnects', async () => {
    serve({id: 'c-1', tool: 'run_command', value: 'rm -rf /', puck: 'Triage'})
    await runCaptured(PuckConnect, ['--allow-dir', workspace(), '--polls', '1'])
    expect(answer()).toMatchObject({device_token: DEVICE.token, allowed: false})
    expect(apiMock.delete).toHaveBeenCalledWith('/cli/v1/coworkers/devices/d-1', {body: {device_token: DEVICE.token}})
  })

  it('reads an allowed file only after the person says yes', async () => {
    const dir = workspace()
    serve({id: 'c-2', tool: 'read_file', value: 'src/app.rb', puck: 'Triage'})
    answers.next = 'y'
    await runCaptured(PuckConnect, ['--allow-dir', dir, '--polls', '1'])
    expect(answer()).toMatchObject({allowed: true, output: 'puts 1'})
  })

  it('sends a no when the person refuses', async () => {
    serve({id: 'c-3', tool: 'list_files', value: '.', puck: 'Triage'})
    await runCaptured(PuckConnect, ['--allow-dir', workspace(), '--polls', '1'])
    expect(answer()).toEqual({device_token: DEVICE.token, allowed: false})
  })
})
