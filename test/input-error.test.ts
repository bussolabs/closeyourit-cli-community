import {Args, Errors, Flags, Parser} from '@oclif/core'
import {describe, expect, it} from 'vitest'
import {inputErrorMessage, isInputError} from '../src/errors/input-error'

/**
 * The errors under test are the real ones oclif throws: build them by running the actual parser
 * instead of hand-writing a message, so a change in oclif's wording breaks the test here (CYCL-33).
 */
async function parseError(argv: string[], options: Record<string, unknown>): Promise<Error> {
  return Parser.parse(argv, options as never).then(
    () => {
      throw new Error('expected a parse error, but the parse succeeded')
    },
    (error: unknown) => error as Error,
  )
}

describe('isInputError recognises the errors already worded for the command user', () => {
  it('a missing required flag is an input error', async () => {
    expect(isInputError(await parseError([], {flags: {project: Flags.string({required: true})}}))).toBe(true)
  })

  it('a command guard (this.error) is an input error', () => {
    expect(isInputError(new Errors.CLIError('Refusing to delete without --confirm.'))).toBe(true)
  })

  it('this.exit is not an input error: it only propagates the exit code', () => {
    expect(isInputError(new Errors.ExitError(0))).toBe(false)
    expect(isInputError(new Errors.ExitError(2))).toBe(false)
  })

  it('a module that fails to load is a real failure, not an input error', () => {
    expect(isInputError(new Errors.ModuleLoadError('boom'))).toBe(false)
  })

  it('any other error (network down) is not an input error', () => {
    expect(isInputError(new Error('rete a terra'))).toBe(false)
    expect(isInputError('rete a terra')).toBe(false)
  })
})

describe('inputErrorMessage reduces the oclif message to the line that matters', () => {
  it('a missing required flag stays "Missing required flag project"', async () => {
    const error = await parseError([], {flags: {project: Flags.string({required: true})}})
    expect(inputErrorMessage(error)).toBe('Missing required flag project')
  })

  it('two missing flags end up in the same message, separated', async () => {
    const error = await parseError([], {
      flags: {environment: Flags.string({required: true}), project: Flags.string({required: true})},
    })
    expect(inputErrorMessage(error)).toBe('Missing required flag environment; Missing required flag project')
  })

  it('a missing required argument says which argument it is', async () => {
    const error = await parseError([], {
      args: {id: Args.string({description: 'Ticket id or code (e.g. DRFL-3)', required: true})},
    })
    expect(inputErrorMessage(error)).toBe('Missing 1 required arg: id  Ticket id or code (e.g. DRFL-3)')
  })

  it('a nonexistent flag stays as is', async () => {
    const error = await parseError(['--nope'], {flags: {project: Flags.string()}})
    expect(inputErrorMessage(error)).toBe('Nonexistent flag: --nope')
  })

  it('a value outside the allowed options lists the options', async () => {
    const error = await parseError(['--status', 'nope'], {
      flags: {status: Flags.string({options: ['open', 'closed']})},
    })
    expect(inputErrorMessage(error)).toBe('Expected --status=nope to be one of: open, closed')
  })

  it('a command guard message passes through unchanged', () => {
    const error = new Errors.CLIError('Refusing to delete without --confirm (the action is irreversible).')
    expect(inputErrorMessage(error)).toBe('Refusing to delete without --confirm (the action is irreversible).')
  })

  it('no ANSI colour code ends up in the message', () => {
    // oclif dims the reason with ANSI when the terminal has colors; JSON output must stay plain.
    const esc = String.fromCodePoint(27)
    const error = new Errors.CLIError(`The following error occurred:\n  ${esc}[2mMissing required flag project${esc}[22m`)
    expect(inputErrorMessage(error)).toBe('Missing required flag project')
  })

  it('a message made only of noise does not become empty', () => {
    const error = new Errors.CLIError('See more help with --help')
    expect(inputErrorMessage(error)).toBe('See more help with --help')
  })
})
