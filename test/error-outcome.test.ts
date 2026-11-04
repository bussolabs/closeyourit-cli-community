import {describe, expect, it} from 'vitest'
import {ExitCodes, exitCodeFor} from '../src/errors/exit-codes'
import {nextStepsFor} from '../src/errors/next-steps'

describe('exitCodeFor picks the exit code from the kind of error (CYCL-82)', () => {
  it.each([
    ['a rejected input (400)', 400, 'R400-PRM-001', ExitCodes.invalidInput],
    ['a validation failure (422)', 422, 'R422-TKT-002', ExitCodes.invalidInput],
    ['a dangerous action without --yes', 422, 'R422-CONFIRM-001', ExitCodes.confirmationRequired],
    ['a missing login', 401, 'C401-AUT-001', ExitCodes.accessDenied],
    ['a denied permission', 403, 'R403-AUTH-001', ExitCodes.accessDenied],
    ['a missing resource', 404, 'C404-PRJ-001', ExitCodes.notFound],
    ['an unreachable server', 0, 'C000-NET-001', ExitCodes.failure],
    ['a server failure', 500, 'C500-API-000', ExitCodes.failure],
    ['a conflict', 409, 'R409-LEASE-001', ExitCodes.failure],
    ['a timeout', 408, 'C408-ASK-001', ExitCodes.failure],
    ['a backend older than the command (404 on a missing route)', 404, 'C404-KNW-001', ExitCodes.failure],
  ])('%s', (_name, status, code, expected) => {
    expect(exitCodeFor({status, code})).toBe(expected)
  })

  it('keeps every code distinct and non-zero', () => {
    const codes = Object.values(ExitCodes)
    expect(new Set(codes).size).toBe(codes.length)
    expect(codes).not.toContain(0)
  })
})

describe('nextStepsFor suggests the commands to try next (CYCL-82)', () => {
  const ctx = {command: 'tickets:delete', argv: ['DRFL-3', '--project', 'DRFL']}

  it.each([
    ['C404-PRJ-001', 'cyi projects list'],
    ['C404-ROL-001', 'cyi roles list'],
    ['C404-GRP-001', 'cyi groups list'],
    ['C404-TEM-001', 'cyi teams list'],
    ['C404-MBR-001', 'cyi members list'],
    ['C404-TKT-001', 'cyi tickets list --project <id|key>'],
    ['C401-AUT-001', 'cyi login'],
  ])('%s suggests `%s`', (code, step) => {
    expect(nextStepsFor({status: 404, code})).toEqual([step])
  })

  it('a server 401 without a local code suggests logging in again', () => {
    expect(nextStepsFor({status: 401, code: 'R401-AUTH-002'})).toEqual(['cyi login'])
  })

  it('a missing confirmation suggests the same command with --yes', () => {
    expect(nextStepsFor({status: 422, code: 'R422-CONFIRM-001'}, ctx)).toEqual([
      'cyi tickets delete DRFL-3 --project DRFL --yes',
    ])
  })

  it('quotes arguments the shell would split or expand', () => {
    const steps = nextStepsFor(
      {status: 422, code: 'R422-CONFIRM-001'},
      {command: 'tickets:comment', argv: ['DRFL-3', '--body', "it's done"]},
    )
    expect(steps).toEqual([String.raw`cyi tickets comment DRFL-3 --body 'it'\''s done' --yes`])
  })

  it('never repeats a secret value given as NAME=value', () => {
    const steps = nextStepsFor(
      {status: 422, code: 'R422-CONFIRM-001'},
      {command: 'secrets:set', argv: ['API_KEY=s3cr3t', '--environment=production']},
    )
    expect(steps).toEqual(["cyi secrets set 'API_KEY=<value>' --environment=production --yes"])
    expect(steps.join(' ')).not.toContain('s3cr3t')
  })

  it('a missing confirmation without a command to repeat suggests nothing', () => {
    expect(nextStepsFor({status: 422, code: 'R422-CONFIRM-001'})).toEqual([])
  })

  it('a rejected command line suggests the command help', () => {
    expect(nextStepsFor({status: 400, code: 'C400-INP-001'}, ctx)).toEqual(['cyi tickets delete --help'])
  })

  it('the server suggestions win and arrive unchanged', () => {
    const nextSteps = ['cyi projects list --page 2']
    expect(nextStepsFor({status: 404, code: 'C404-PRJ-001', nextSteps}, ctx)).toEqual(nextSteps)
  })

  it('an error nobody knows a way out of suggests nothing', () => {
    expect(nextStepsFor({status: 500, code: 'C500-SYS-001'}, ctx)).toEqual([])
  })
})
