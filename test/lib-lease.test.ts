import {describe, expect, it} from 'vitest'
import {ApiRequestError} from '../src/lib/api'
import {describeLeaseConflict, leaseErrorEnvelope} from '../src/lib/lease'

describe('describeLeaseConflict', () => {
  it('leaves an error that is not an ApiRequestError untouched', () => {
    const err = new Error('boom')
    expect(describeLeaseConflict(err)).toBe(err)
  })

  it('leaves an ApiRequestError that is not a 409 untouched (e.g. 404 no lease)', () => {
    const err = new ApiRequestError(404, 'R404-LEASE-002', 'No lease to renew')
    expect(describeLeaseConflict(err)).toBe(err)
  })

  it('leaves a 409 without details.holder untouched (unexpected shape)', () => {
    const err = new ApiRequestError(409, 'R409-LEASE-001', 'Ticket is already leased')
    expect(describeLeaseConflict(err)).toBe(err)
  })

  it('leaves a 409 with held_by without kind untouched', () => {
    const err = new ApiRequestError(409, 'R409-LEASE-001', 'Ticket is already leased', {
      holder: {held_by: {id: 'acc-9'}, expires_at: '2026-08-06T20:00:00Z'},
    })
    expect(describeLeaseConflict(err)).toBe(err)
  })

  it('leaves a 409 with held_by without id untouched', () => {
    const err = new ApiRequestError(409, 'R409-LEASE-001', 'Ticket is already leased', {
      holder: {held_by: {kind: 'account'}, expires_at: '2026-08-06T20:00:00Z'},
    })
    expect(describeLeaseConflict(err)).toBe(err)
  })

  it('enriches the message with holder (name) and expiry', () => {
    const err = new ApiRequestError(409, 'R409-LEASE-001', 'Ticket is already leased', {
      holder: {held_by: {kind: 'host', id: 'host-9', name: 'mac-mini-2'}, expires_at: '2026-08-06T20:00:00Z'},
    })
    const result = describeLeaseConflict(err) as ApiRequestError
    expect(result).toBeInstanceOf(ApiRequestError)
    expect(result.status).toBe(409)
    expect(result.code).toBe('R409-LEASE-001')
    expect(result.message).toBe('Ticket already leased by host "mac-mini-2" until 2026-08-06T20:00:00Z.')
    expect(result.details).toBe(err.details)
  })

  it('uses the id as holder when the name is not set', () => {
    const err = new ApiRequestError(409, 'R409-LEASE-001', 'Ticket is already leased', {
      holder: {held_by: {kind: 'account', id: 'acc-9'}, expires_at: '2026-08-06T20:00:00Z'},
    })
    const result = describeLeaseConflict(err) as ApiRequestError
    expect(result.message).toBe('Ticket already leased by account acc-9 until 2026-08-06T20:00:00Z.')
  })

  it('omits "until" when the expiry is unknown', () => {
    const err = new ApiRequestError(409, 'R409-LEASE-001', 'Ticket is already leased', {
      holder: {held_by: {kind: 'account', id: 'acc-9', name: 'Ada'}},
    })
    const result = describeLeaseConflict(err) as ApiRequestError
    expect(result.message).toBe('Ticket already leased by account "Ada".')
  })
})

describe('leaseErrorEnvelope', () => {
  it('undefined for an error that is not an ApiRequestError (the caller lets it propagate)', () => {
    expect(leaseErrorEnvelope(new Error('boom'))).toBeUndefined()
  })

  it('includes code, message and details rebuilt from the allow-list (kind, id, name, expires_at)', () => {
    const err = new ApiRequestError(409, 'R409-LEASE-001', 'Ticket is already leased', {
      holder: {held_by: {kind: 'host', id: 'host-9', name: 'mac-mini-2'}, expires_at: '2026-08-06T20:00:00Z'},
    })
    expect(leaseErrorEnvelope(err)).toEqual({
      error: {
        code: 'R409-LEASE-001',
        message: 'Ticket is already leased',
        details: {
          holder: {held_by: {kind: 'host', id: 'host-9', name: 'mac-mini-2'}, expires_at: '2026-08-06T20:00:00Z'},
        },
      },
    })
  })

  it('drops every extra backend field that is not in the allow-list (e.g. holder.ticket)', () => {
    // Same shape seen from the real backend: holder also carries `ticket` next to held_by/expires_at.
    // Only held_by.{kind,id,name} and expires_at must survive in the --json envelope.
    const err = new ApiRequestError(409, 'R409-LEASE-001', 'Ticket is already leased', {
      holder: {
        ticket: 'CYRA-1',
        held_by: {kind: 'account', id: 'acc-1', name: 'Alessio Bussolari', email: 'a@example.com'},
        expires_at: '2026-08-06T18:00:00Z',
        run_id: 'run-x',
      },
    })
    expect(leaseErrorEnvelope(err)).toEqual({
      error: {
        code: 'R409-LEASE-001',
        message: 'Ticket is already leased',
        details: {
          holder: {held_by: {kind: 'account', id: 'acc-1', name: 'Alessio Bussolari'}, expires_at: '2026-08-06T18:00:00Z'},
        },
      },
    })
  })

  it('held_by without a name: the name key does not appear (not "name: undefined")', () => {
    const err = new ApiRequestError(409, 'R409-LEASE-001', 'Ticket is already leased', {
      holder: {held_by: {kind: 'account', id: 'acc-9'}, expires_at: '2026-08-06T20:00:00Z'},
    })
    const result = leaseErrorEnvelope(err)
    expect(result?.error.details?.holder.held_by).toEqual({kind: 'account', id: 'acc-9'})
    expect(result?.error.details?.holder.held_by).not.toHaveProperty('name')
  })

  it('without expires_at: the expires_at key does not appear', () => {
    const err = new ApiRequestError(409, 'R409-LEASE-001', 'Ticket is already leased', {
      holder: {held_by: {kind: 'account', id: 'acc-9', name: 'Ada'}},
    })
    const result = leaseErrorEnvelope(err)
    expect(result?.error.details?.holder).toEqual({held_by: {kind: 'account', id: 'acc-9', name: 'Ada'}})
    expect(result?.error.details?.holder).not.toHaveProperty('expires_at')
  })

  it('details stays undefined when the backend sends none (e.g. 404)', () => {
    const err = new ApiRequestError(404, 'R404-LEASE-002', 'No lease to renew')
    expect(leaseErrorEnvelope(err)).toEqual({
      error: {code: 'R404-LEASE-002', message: 'No lease to renew', details: undefined},
    })
  })

  it('details stays undefined for a 409 with a holder in an unexpected shape (kind/id missing)', () => {
    const err = new ApiRequestError(409, 'R409-LEASE-001', 'Ticket is already leased', {
      holder: {held_by: {name: 'Ada senza kind né id'}},
    })
    expect(leaseErrorEnvelope(err)).toEqual({
      error: {code: 'R409-LEASE-001', message: 'Ticket is already leased', details: undefined},
    })
  })
})
