import {beforeEach, describe, expect, it, vi} from 'vitest'
import {apiMock, resetApiMock} from './helpers/api-mock'
import {apiError, envelope, runCaptured, runExpectingExit} from './helpers/command'

vi.mock('../src/lib/api', async (io) => {
  const actual = await io<typeof import('../src/lib/api')>()
  const {apiMock} = await import('./helpers/api-mock')
  return {...actual, CliApi: vi.fn(function () { return apiMock })}
})
vi.mock('../src/lib/config', async (io) => {
  const actual = await io<typeof import('../src/lib/config')>()
  return {...actual, loadConfig: vi.fn(() => ({apiUrl: 'https://api.test', token: 'tok_test'}))}
})

import KbApprove from '../src/commands/kb/approve'
import KbCreate from '../src/commands/kb/create'
import KbReject from '../src/commands/kb/reject'

const ID = 'pg-1'

beforeEach(() => resetApiMock())

describe('kb approve', () => {
  it('accepts the proposal and shows the page', async () => {
    apiMock.post.mockResolvedValue(envelope({id: ID, status: 'published'}))
    const {stdout} = await runCaptured(KbApprove, [ID])
    expect(apiMock.post).toHaveBeenCalledWith(`/cli/v1/knowledge/pages/${ID}/approve`)
    expect(stdout).toContain('Knowledge page accepted')
    expect(stdout).toContain('published')
  })

  it('with --json returns the envelope', async () => {
    apiMock.post.mockResolvedValue(envelope({id: ID}))
    const res = await runCaptured(KbApprove, [ID, '--json'])
    expect(res.result).toEqual(envelope({id: ID}))
    expect(res.stdout).not.toContain('accepted')
  })

  it('a decision rejected by the server exits with its code', async () => {
    apiMock.post.mockRejectedValue(apiError(422, 'R422-KNOWLEDGE-009', 'bocciata dal revisore'))
    const {stderr} = await runExpectingExit(KbApprove, [ID], 1)
    expect(stderr).toContain('R422-KNOWLEDGE-009: bocciata dal revisore')
  })
})

describe('kb reject', () => {
  it('discards the proposal', async () => {
    apiMock.post.mockResolvedValue(envelope({id: ID, status: 'rejected'}))
    const {stdout} = await runCaptured(KbReject, [ID])
    expect(apiMock.post).toHaveBeenCalledWith(`/cli/v1/knowledge/pages/${ID}/reject`)
    expect(stdout).toContain('Knowledge page rejected')
  })

  it('without an id no call is made', async () => {
    await runExpectingExit(KbReject, [], 2)
    expect(apiMock.post).not.toHaveBeenCalled()
  })
})

describe('automatic reviewer rejection (R422-KNOWLEDGE-013)', () => {
  const details = {
    format: 'troubleshooting',
    violations: [
      {code: 'T01', message: 'Il sintomo non cita il messaggio esatto.', blocking: true},
      {code: 'P05_missing', message: 'Manca la parte 2.', blocking: false},
    ],
    suggested_title: 'Rails — la cache non tiene niente in prova',
    split_suggestion: ['Rails — una cosa', "Rails — l'altra"],
    duplicate_of: 'Rails — la cache in prova',
  }
  const args = ['--project', 'acme', '--title', 'x', '--body', 'y']

  it('prints all violated rules, the format and the suggestions, not just the message', async () => {
    apiMock.post.mockRejectedValue(apiError(422, 'R422-KNOWLEDGE-013', 'La pagina non rispetta le regole: T01 — …', details))
    const {stderr} = await runExpectingExit(KbCreate, args, 1)
    expect(stderr).toContain('R422-KNOWLEDGE-013:')
    expect(stderr).toContain('T01: Il sintomo non cita il messaggio esatto.')
    expect(stderr).toContain('P05_missing (warning): Manca la parte 2.')
    expect(stderr).toContain('Format recognised: troubleshooting')
    expect(stderr).toContain('Suggested title: Rails — la cache non tiene niente in prova')
    expect(stderr).toContain('Looks like a duplicate of: Rails — la cache in prova')
    expect(stderr).toContain("Split into: Rails — una cosa · Rails — l'altra")
  })

  it('with --json the details travel in the envelope', async () => {
    apiMock.post.mockRejectedValue(apiError(422, 'R422-KNOWLEDGE-013', 'no', details))
    const {stdout} = await runExpectingExit(KbCreate, [...args, '--json'], 1)
    expect(JSON.parse(stdout)).toEqual({error: {code: 'R422-KNOWLEDGE-013', message: 'no', details}})
  })

  it('another error without details stays a single line', async () => {
    apiMock.post.mockRejectedValue(apiError(404, 'R404-KNOWLEDGE-001', 'Progetto non trovato.'))
    const {stderr} = await runExpectingExit(KbCreate, args, 1)
    expect(stderr.trim().split('\n')).toHaveLength(1)
  })
})
