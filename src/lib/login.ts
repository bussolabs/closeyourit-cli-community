import {CliApi} from './api'
import type {LoginIdentity} from './config'
import {isSameOriginHttpUrl, openUrl} from './browser'
import {pollDeviceToken, startDeviceFlow} from './device-flow'

export interface DeviceLoginResult {
  identity: LoginIdentity
  token?: {id: string; name: string; prefix: string}
}

/**
 * Device-flow sign-in against `apiUrl`: the organization is picked in the browser. Saves nothing, so
 * the caller persists the issuer and its token together, only after the entire login succeeded.
 */
export async function deviceLogin(
  apiUrl: string,
  opts: {clientName: string; quiet: boolean; log: (line: string) => void},
): Promise<DeviceLoginResult> {
  const authorization = await startDeviceFlow(apiUrl, opts.clientName)
  // Only hand the OS (or a click in the terminal) an address that belongs to the server we are logging into.
  const completeUriIsSafe = isSameOriginHttpUrl(authorization.verification_uri_complete, apiUrl)

  if (!opts.quiet) {
    opts.log('')
    opts.log('To authorize this CLI, open:')
    opts.log(`  ${completeUriIsSafe ? authorization.verification_uri_complete : authorization.verification_uri}`)
    opts.log('')
    opts.log('and, if asked, enter the code:')
    opts.log('')
    opts.log(`    ${authorization.user_code}`)
    opts.log('')
  }

  if (completeUriIsSafe) {
    if (!opts.quiet) opts.log('Opening your browser…')
    openUrl(authorization.verification_uri_complete)
  }

  const result = await pollDeviceToken(apiUrl, authorization.device_code, {
    interval: authorization.interval,
    expiresIn: authorization.expires_in,
    onPending: () => {
      if (!opts.quiet) process.stderr.write('.')
    },
  })

  const identity: LoginIdentity = {apiUrl, token: result.access_token}

  // Enrich the login with identity (account + organization), asked with the token just issued.
  const api = new CliApi({apiUrl, token: result.access_token})
  const who = await api.get<{
    account?: {id: string; name: string; email: string}
    organization?: {id: string; name: string; slug: string}
  }>('/cli/v1/whoami')

  const account = who.data.account
  const organization = who.data.organization
  if (account) identity.account = {id: account.id, name: account.name, email: account.email}
  if (organization) identity.organization = {id: organization.id, name: organization.name, slug: organization.slug}

  return {identity, token: result.token}
}
