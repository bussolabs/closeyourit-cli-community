import {beforeEach, describe, expect, it, vi} from 'vitest'
import {apiMock, resetApiMock} from './helpers/api-mock'
import {MID, apiError, capture, envelope, run, runCaptured, runExpectingExit} from './helpers/command'

vi.mock('../src/lib/api', async (io) => {
  const actual = await io<typeof import('../src/lib/api')>()
  const {apiMock} = await import('./helpers/api-mock')
  return {...actual, CliApi: vi.fn(function () { return apiMock })}
})
vi.mock('../src/lib/config', async (io) => {
  const actual = await io<typeof import('../src/lib/config')>()
  return {...actual, loadConfig: vi.fn(() => ({apiUrl: 'https://api.test', token: 'tok_test'}))}
})

import InvitationsCreate from '../src/commands/invitations/create'
import InvitationsList from '../src/commands/invitations/list'
import InvitationsResend from '../src/commands/invitations/resend'
import InvitationsRevoke from '../src/commands/invitations/revoke'

beforeEach(() => resetApiMock())

describe('invitations list', () => {
  it('lists invitations (accepted flag rendered)', async () => {
    apiMock.get.mockResolvedValue(envelope([{email: 'a@acme.test', role: 'member', accepted_at: null, id: MID}]))
    const {stdout} = await runCaptured(InvitationsList, [])
    expect(apiMock.get).toHaveBeenCalledWith('/cli/v1/invitations?page=1')
    expect(stdout).toContain('a@acme.test')
  })

  it('exits non-zero on an API error', async () => {
    apiMock.get.mockRejectedValue(apiError(403, 'R403-INV-001', 'forbidden'))
    const {stderr} = await runExpectingExit(InvitationsList, [])
    expect(stderr).toContain('R403-INV-001')
  })
})

describe('invitations create', () => {
  it('posts email + default role and prints the accept link', async () => {
    apiMock.post.mockResolvedValue(envelope({email: 'client@acme.com', role: 'customer', accept_url: 'https://a/accept'}))
    const {stdout} = await runCaptured(InvitationsCreate, ['client@acme.com'])
    expect(apiMock.post).toHaveBeenCalledWith('/cli/v1/invitations', {email: 'client@acme.com', role: 'customer'})
    expect(stdout).toContain('https://a/accept')
  })

  // The command always printed "Email delivery is not wired in production": a fixed sentence that
  // looked at nothing. Now the server says it with email_delivery.
  it('warns about manual delivery only when the server says mail is off', async () => {
    const capturedRun = async (): Promise<{stderr: string; stdout: string}> => {
      const cap = capture()
      try {
        await run(InvitationsCreate, ['client@acme.com'])
        return {stderr: cap.stderr(), stdout: cap.stdout()}
      } finally {
        cap.restore()
      }
    }

    apiMock.post.mockResolvedValue(
      envelope({accept_url: 'https://a/accept', email: 'client@acme.com', email_delivery: false, role: 'customer'}),
    )
    const off = await capturedRun()
    expect(off.stderr).toContain('Email delivery is off')

    apiMock.post.mockResolvedValue(
      envelope({accept_url: 'https://a/accept', email: 'client@acme.com', email_delivery: true, role: 'customer'}),
    )
    const on = await capturedRun()
    expect(on.stderr).not.toContain('Email delivery is off')
    expect(on.stdout).toContain('https://a/accept')
  })

  it('honours --role', async () => {
    apiMock.post.mockResolvedValue(envelope({email: 't@acme.com', role: 'member'}))
    await runCaptured(InvitationsCreate, ['t@acme.com', '--role', 'member'])
    expect(apiMock.post).toHaveBeenCalledWith('/cli/v1/invitations', {email: 't@acme.com', role: 'member'})
  })

  it('rejects an invalid --role (exit 2)', async () => {
    await runExpectingExit(InvitationsCreate, ['t@acme.com', '--role', 'superuser'], 2)
    expect(apiMock.post).not.toHaveBeenCalled()
  })
})

describe('invitations resend / revoke', () => {
  it('resend → PUT .../resend and reprints the link', async () => {
    apiMock.put.mockResolvedValue(envelope({email: 'a@acme.test', role: 'member', accept_url: 'https://a/accept2'}))
    const {stdout} = await runCaptured(InvitationsResend, [MID])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/invitations/${MID}/resend`)
    expect(stdout).toContain('https://a/accept2')
  })

  it('revoke → DELETE', async () => {
    apiMock.delete.mockResolvedValue(envelope({}))
    const {result} = await runCaptured(InvitationsRevoke, [MID])
    expect(apiMock.delete).toHaveBeenCalledWith(`/cli/v1/invitations/${MID}`)
    expect((result as {revoked: string}).revoked).toBe(MID)
  })
})
