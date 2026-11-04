import {ErrorCodes} from './error-codes'

/**
 * Exit codes by kind of error (CYCL-82): an agent learns what went wrong from the code alone, without
 * reading the message. Everything that is not one of the kinds below keeps 1, as before.
 *
 * `cyi run` and `personal run` are outside this table: they exit with the code of the program they ran.
 */
export const ExitCodes = {
  failure: 1,
  invalidInput: 2,
  confirmationRequired: 3,
  accessDenied: 4,
  notFound: 5,
} as const

/** Error code the server answers when a dangerous write arrives without the confirm gesture (CYRA-728). */
export const CONFIRMATION_REQUIRED_CODE = 'R422-CONFIRM-001'

/**
 * The kind is read from the HTTP status every error already carries (local C-codes repeat it), so no
 * command has to declare anything. A route the server does not know answers as a server failure, not
 * as a 404: it stays 1, like every real failure.
 */
export function exitCodeFor(error: {status: number; code: string}): number {
  if (error.code === CONFIRMATION_REQUIRED_CODE) return ExitCodes.confirmationRequired
  // A 404 on a route this server does not have yet: nothing is missing, the server is too old.
  if (error.code === ErrorCodes.Knowledge.publishUnavailable) return ExitCodes.failure
  switch (error.status) {
    case 400:
    case 422: {
      return ExitCodes.invalidInput
    }

    case 401:
    case 403: {
      return ExitCodes.accessDenied
    }

    case 404: {
      return ExitCodes.notFound
    }

    default: {
      return ExitCodes.failure
    }
  }
}
