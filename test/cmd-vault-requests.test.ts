import {beforeEach, describe, expect, it, vi} from 'vitest'
import {apiMock, resetApiMock} from './helpers/api-mock'
import {MID, PID, apiError, envelope, run, runCaptured, runExpectingExit} from './helpers/command'

vi.mock('../src/lib/api', async (io) => {
  const actual = await io<typeof import('../src/lib/api')>()
  const {apiMock} = await import('./helpers/api-mock')
  return {...actual, CliApi: vi.fn(function () { return apiMock })}
})
vi.mock('../src/lib/config', async (io) => {
  const actual = await io<typeof import('../src/lib/config')>()
  return {...actual, loadConfig: vi.fn(() => ({apiUrl: 'https://api.test', token: 'tok_test'}))}
})

import VaultRequestsApprove from '../src/commands/vault/requests/approve'
import VaultRequestsList from '../src/commands/vault/requests/list'
import VaultRequestsReject from '../src/commands/vault/requests/reject'

// ORG-LEVEL endpoint: pending requests are viewed all together, across the visible projects —
// no /projects/:id in the path, like the vault web page.
const base = '/cli/v1/vault/change_requests'

/** Full row as the backend serves it (SecretChangeRequestSerializer): never the proposed value. */
const pending = {
  id: MID,
  name: 'STRIPE_KEY',
  action: 'set',
  status: 'pending',
  reason: null,
  created_at: '2026-08-20T09:00:00Z',
  decided_at: null,
  environment: {id: PID, code: 'production', label: 'Produzione'},
  project: {id: PID, key: 'ACME', name: 'Acme API'},
  requested_by: {id: MID, name: 'Mario Rossi', email: 'mario@acme.test'},
}

beforeEach(() => resetApiMock())

describe('vault requests list', () => {
  it('lists the pending requests with project, environment, action, name and requester', async () => {
    apiMock.get.mockResolvedValue(envelope([pending]))
    const {stdout} = await runCaptured(VaultRequestsList, [])
    expect(apiMock.get).toHaveBeenCalledWith(`${base}?page=1&per=100`)
    expect(stdout).toContain(MID)
    expect(stdout).toContain('ACME')
    expect(stdout).toContain('production')
    expect(stdout).toContain('set')
    expect(stdout).toContain('STRIPE_KEY')
    expect(stdout).toContain('Mario Rossi')
    expect(stdout).toContain('2026-08-20')
  })

  it('aggregates all the pages, not just the first', async () => {
    apiMock.get
      .mockResolvedValueOnce(envelope([{...pending, name: 'ALPHA'}], {total_pages: 2}))
      .mockResolvedValueOnce(envelope([{...pending, name: 'BETA'}], {total_pages: 2}))
    const {stdout} = await runCaptured(VaultRequestsList, [])
    expect(apiMock.get).toHaveBeenNthCalledWith(1, `${base}?page=1&per=100`)
    expect(apiMock.get).toHaveBeenNthCalledWith(2, `${base}?page=2&per=100`)
    expect(stdout).toContain('ALPHA')
    expect(stdout).toContain('BETA')
  })

  // The serializer NEVER sends the proposed value; the CLI does not trust someone else's promise and
  // prints only the fields it chose — a payload that one day carried it does not end up on screen.
  it('does not print the proposed value even if the payload carried it', async () => {
    apiMock.get.mockResolvedValue(envelope([{...pending, value: 'sk_live_s3cr3t'}]))
    const {stdout} = await runCaptured(VaultRequestsList, [])
    expect(stdout).not.toContain('sk_live_s3cr3t')
    expect(stdout).toContain('STRIPE_KEY')
  })

  it('a delete request is told apart from an update request', async () => {
    apiMock.get.mockResolvedValue(envelope([{...pending, action: 'remove'}]))
    const {stdout} = await runCaptured(VaultRequestsList, [])
    expect(stdout).toContain('remove')
  })

  it('a row without requester (deleted account) does not break the table', async () => {
    apiMock.get.mockResolvedValue(envelope([{id: MID, name: 'ORPHAN'}]))
    const {stdout} = await runCaptured(VaultRequestsList, [])
    expect(stdout).toContain('ORPHAN')
  })

  it('no pending request says so instead of printing an empty table', async () => {
    apiMock.get.mockResolvedValue(envelope([]))
    const {stdout} = await runCaptured(VaultRequestsList, [])
    expect(stdout).toMatch(/no secret change request/i)
  })

  it('declares no project flag (the queue is org-level)', () => {
    expect(VaultRequestsList.flags).toBeUndefined()
  })

  it('missing permission → the server code arrives on stderr', async () => {
    apiMock.get.mockRejectedValue(apiError(403, 'R403-CLIAUTH-002', 'Permesso negato'))
    const {stderr} = await runExpectingExit(VaultRequestsList, [])
    expect(stderr).toContain('R403-CLIAUTH-002')
  })
})

describe('vault requests approve', () => {
  it('approves the request and says what was applied, where', async () => {
    apiMock.post.mockResolvedValue(
      envelope({...pending, status: 'applied', decided_at: '2026-08-21T10:00:00Z'}),
    )
    const {stdout} = await runCaptured(VaultRequestsApprove, [MID])
    expect(apiMock.post).toHaveBeenCalledWith(`${base}/${MID}/approve`)
    expect(stdout).toMatch(/approved/i)
    expect(stdout).toContain('STRIPE_KEY')
    expect(stdout).toContain('ACME')
    expect(stdout).toContain('production')
    expect(stdout).toContain('applied')
  })

  it('does not print the approved value even if the payload carried it', async () => {
    apiMock.post.mockResolvedValue(envelope({...pending, status: 'applied', value: 'sk_live_s3cr3t'}))
    const {stdout} = await runCaptured(VaultRequestsApprove, [MID])
    expect(stdout).not.toContain('sk_live_s3cr3t')
  })

  // 4-eyes constraint: whoever decides is not whoever asked. The server message stays whole and the
  // CLI adds the way out, otherwise a flat rejection looks like a missing permission.
  it('you cannot approve your own request: server message + way out', async () => {
    apiMock.post.mockRejectedValue(
      apiError(403, 'R403-CHANGEREQUEST-001', 'Non puoi decidere la tua stessa richiesta'),
    )
    const {stderr} = await runExpectingExit(VaultRequestsApprove, [MID])
    expect(stderr).toContain('R403-CHANGEREQUEST-001')
    expect(stderr).toContain('Non puoi decidere la tua stessa richiesta')
    expect(stderr).toMatch(/someone else/i)
  })

  // CYRA-640: the second approval is given by a person, never by a service account.
  it('a service account does not decide: the explanation says to use your own access', async () => {
    apiMock.post.mockRejectedValue(
      apiError(403, 'R403-CHANGEREQUEST-003', 'Solo una persona può approvare o rifiutare'),
    )
    const {stderr} = await runExpectingExit(VaultRequestsApprove, [MID])
    expect(stderr).toContain('R403-CHANGEREQUEST-003')
    expect(stderr).toMatch(/person/i)
    expect(stderr).toMatch(/service account/i)
  })

  it('request already decided → explained conflict, with the command to review the queue', async () => {
    apiMock.post.mockRejectedValue(
      apiError(409, 'R409-CHANGEREQUEST-001', 'La richiesta è già stata decisa'),
    )
    const {stderr} = await runExpectingExit(VaultRequestsApprove, [MID])
    expect(stderr).toContain('R409-CHANGEREQUEST-001')
    expect(stderr).toMatch(/already decided/i)
    expect(stderr).toContain('vault requests list')
  })

  it('nonexistent request or outside the visible projects → the server code passes through whole', async () => {
    apiMock.post.mockRejectedValue(apiError(404, 'R404-SYSTEM-001', 'Risorsa non trovata'))
    const {stderr} = await runExpectingExit(VaultRequestsApprove, [MID])
    expect(stderr).toContain('R404-SYSTEM-001')
    expect(stderr).toContain('Risorsa non trovata')
  })

  it('missing manage permission → the server code arrives whole, without invented explanations', async () => {
    apiMock.post.mockRejectedValue(apiError(403, 'R403-CLIAUTH-002', 'Permesso negato'))
    const {stderr} = await runExpectingExit(VaultRequestsApprove, [MID])
    expect(stderr).toContain('R403-CLIAUTH-002')
    expect(stderr).not.toMatch(/someone else/i)
  })

  it('without an id does not call the server', async () => {
    await expect(run(VaultRequestsApprove, [])).rejects.toThrow(/id/i)
    expect(apiMock.post).not.toHaveBeenCalled()
  })
})

describe('vault requests reject', () => {
  it('rejects with the reason and says the secret did not change', async () => {
    apiMock.post.mockResolvedValue(
      envelope({...pending, status: 'rejected', reason: 'chiave sbagliata', decided_at: '2026-08-21T10:00:00Z'}),
    )
    const {stdout} = await runCaptured(VaultRequestsReject, [MID, '--reason', 'chiave sbagliata'])
    expect(apiMock.post).toHaveBeenCalledWith(`${base}/${MID}/reject`, {reason: 'chiave sbagliata'})
    expect(stdout).toMatch(/rejected/i)
    expect(stdout).toContain('STRIPE_KEY')
    expect(stdout).toMatch(/unchanged/i)
    expect(stdout).toContain('chiave sbagliata')
  })

  it('without --reason stops before the call', async () => {
    await expect(run(VaultRequestsReject, [MID])).rejects.toThrow(/reason/i)
    expect(apiMock.post).not.toHaveBeenCalled()
  })

  // A whitespace-only reason would pass the required flag and be rejected by the server: the
  // rejection freezes the request, so the explanation must really be there.
  it('a whitespace-only reason is rejected here, not by the server', async () => {
    const {message} = await runExpectingExit(VaultRequestsReject, [MID, '--reason', '   '], 2)
    expect(message).toMatch(/reason/i)
    expect(apiMock.post).not.toHaveBeenCalled()
  })

  it('reason rejected by the server → the code arrives with the explanation', async () => {
    apiMock.post.mockRejectedValue(
      apiError(422, 'R422-CHANGEREQUEST-001', 'Il motivo del rifiuto è obbligatorio'),
    )
    const {stderr} = await runExpectingExit(VaultRequestsReject, [MID, '--reason', 'no'])
    expect(stderr).toContain('R422-CHANGEREQUEST-001')
    expect(stderr).toMatch(/reason/i)
  })

  it('you cannot reject your own request: same way out as approval', async () => {
    apiMock.post.mockRejectedValue(
      apiError(403, 'R403-CHANGEREQUEST-001', 'Non puoi decidere la tua stessa richiesta'),
    )
    const {stderr} = await runExpectingExit(VaultRequestsReject, [MID, '--reason', 'no'])
    expect(stderr).toContain('R403-CHANGEREQUEST-001')
    expect(stderr).toMatch(/someone else/i)
  })

  it('a service account does not reject: rejecting freezes the request', async () => {
    apiMock.post.mockRejectedValue(
      apiError(403, 'R403-CHANGEREQUEST-003', 'Solo una persona può approvare o rifiutare'),
    )
    const {stderr} = await runExpectingExit(VaultRequestsReject, [MID, '--reason', 'no'])
    expect(stderr).toMatch(/person/i)
  })

  it('request already decided → explained conflict', async () => {
    apiMock.post.mockRejectedValue(apiError(409, 'R409-CHANGEREQUEST-001', 'La richiesta è già stata decisa'))
    const {stderr} = await runExpectingExit(VaultRequestsReject, [MID, '--reason', 'no'])
    expect(stderr).toMatch(/already decided/i)
  })
})

// Machine branches: `--json` exercises the else side of `if (!this.jsonEnabled())`, the null envelope the
// `?? []` / `?? {}` fallbacks.
describe('vault requests in --json mode and with a null envelope', () => {
  it('list --json returns data + aggregated meta and prints no tables', async () => {
    apiMock.get.mockResolvedValue(envelope([pending]))
    const {result, stdout} = await runCaptured(VaultRequestsList, ['--json'])
    expect(result).toEqual({data: [pending], meta: {page: 1, per: 1, total: 1, total_pages: 1}})
    expect(stdout).not.toContain('NAME')

    apiMock.get.mockResolvedValue({data: undefined})
    const {result: empty} = await runCaptured(VaultRequestsList, ['--json'])
    expect(empty).toEqual({data: [], meta: {page: 1, per: 0, total: 0, total_pages: 1}})
  })

  // Defence in depth: the proposed value is encrypted at rest and the serializer does not expose it; if
  // it ever showed up in the payload, it must not come out of the machine channel either.
  it('--json does not return the proposed value even if the payload carried it', async () => {
    apiMock.get.mockResolvedValue(envelope([{...pending, value: 'sk_live_s3cr3t'}]))
    const {result} = await runCaptured(VaultRequestsList, ['--json'])
    expect(JSON.stringify(result)).not.toContain('sk_live_s3cr3t')

    apiMock.post.mockResolvedValue(envelope({...pending, status: 'applied', value: 'sk_live_s3cr3t'}))
    const {result: approved} = await runCaptured(VaultRequestsApprove, [MID, '--json'])
    expect(JSON.stringify(approved)).not.toContain('sk_live_s3cr3t')
  })

  it('approve --json returns the envelope without human lines', async () => {
    apiMock.post.mockResolvedValue(envelope({...pending, status: 'applied'}))
    const {result, stdout} = await runCaptured(VaultRequestsApprove, [MID, '--json'])
    expect((result as {data: {status: string}}).data.status).toBe('applied')
    expect(stdout).not.toMatch(/approved/i)
  })

  it('reject --json returns the envelope without human lines', async () => {
    apiMock.post.mockResolvedValue(envelope({...pending, status: 'rejected', reason: 'no'}))
    const {result, stdout} = await runCaptured(VaultRequestsReject, [MID, '--reason', 'no', '--json'])
    expect((result as {data: {status: string}}).data.status).toBe('rejected')
    expect(stdout).not.toMatch(/rejected:/i)
  })

  it('an envelope without data does not drop the human confirmation', async () => {
    apiMock.post.mockResolvedValue({data: undefined})
    const {stdout} = await runCaptured(VaultRequestsApprove, [MID])
    expect(stdout).toMatch(/approved/i)
  })
})
