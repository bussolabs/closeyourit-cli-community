import {beforeEach, describe, expect, it, vi} from 'vitest'
import {apiMock, resetApiMock} from './helpers/api-mock'
import {apiError, capture, envelope, run, runExpectingExit} from './helpers/command'
import {clearToken, loadConfig, loadStoredConfig, saveConfig} from '../src/lib/config'
import {pollDeviceToken, startDeviceFlow} from '../src/lib/device-flow'
import {openUrl} from '../src/lib/browser'

vi.mock('../src/lib/api', async (io) => {
  const actual = await io<typeof import('../src/lib/api')>()
  const {apiMock} = await import('./helpers/api-mock')
  return {...actual, CliApi: vi.fn(function () { return apiMock })}
})
vi.mock('../src/lib/config', async (io) => {
  const actual = await io<typeof import('../src/lib/config')>()
  return {
    ...actual,
    loadConfig: vi.fn(() => ({apiUrl: 'https://api.test'})),
    loadStoredConfig: vi.fn(() => ({apiUrl: 'https://api.test'})),
    saveConfig: vi.fn(),
    clearToken: vi.fn(),
  }
})
vi.mock('../src/lib/device-flow', () => ({startDeviceFlow: vi.fn(), pollDeviceToken: vi.fn()}))
vi.mock('../src/lib/browser', async (io) => {
  const actual = await io<typeof import('../src/lib/browser')>()
  return {...actual, openUrl: vi.fn()}
})

import Login from '../src/commands/login'
import Logout from '../src/commands/logout'
import Whoami from '../src/commands/whoami'

beforeEach(() => {
  resetApiMock()
  vi.mocked(saveConfig).mockReset()
  vi.mocked(clearToken).mockReset()
  vi.mocked(startDeviceFlow).mockReset()
  vi.mocked(pollDeviceToken).mockReset()
  vi.mocked(openUrl).mockReset()
  vi.mocked(loadConfig).mockReturnValue({apiUrl: 'https://api.test'})
  vi.mocked(loadStoredConfig).mockReturnValue({apiUrl: 'https://api.test'})
})

describe('whoami — fallbacks', () => {
  it('prints dashes for every field when the payload is empty', async () => {
    apiMock.get.mockResolvedValue(envelope({}))
    const cap = capture()
    try {
      await run(Whoami, [])
    } finally {
      cap.restore()
    }
    expect(cap.stdout()).toContain('Account:')
    expect(cap.stdout()).toContain('-')
  })

  it('--json returns the payload and prints no human lines', async () => {
    apiMock.get.mockResolvedValue(envelope({account: {id: 'a', name: 'A', email: 'a@x'}}))
    const cap = capture()
    let result: unknown
    try {
      result = await run(Whoami, ['--json'])
    } finally {
      cap.restore()
    }
    expect(result).toBeTruthy()
    expect(cap.stdout()).not.toContain('Account:')
  })

  it('--json allow-lists identity fields and never returns token secrets', async () => {
    const sentinel = 'cyi_u_FULL_SECRET_SENTINEL_NEVER_PRINT'
    apiMock.get.mockResolvedValue(
      envelope({
        account: {id: 'a', name: 'A', email: 'a@x'},
        token: {id: 't', name: 'cli', prefix: 'cyi_u_safe', secret: sentinel},
        access_token: sentinel,
      }),
    )

    const result = await run(Whoami, ['--json'])
    expect(JSON.stringify(result)).not.toContain(sentinel)
    expect(result).toMatchObject({token: {prefix: 'cyi_u_safe'}})
  })

  it('a nonexistent flag in --json is named, without exposing the token', async () => {
    const sentinel = 'cyi_u_FULL_SECRET_SENTINEL_NEVER_PRINT'
    process.env.CLOSEYOURIT_TOKEN = sentinel
    apiMock.get.mockResolvedValue(envelope({account: {id: 'a', name: 'A', email: 'a@x'}}))
    try {
      // whoami has no flags of its own: until CYCL-33 it never parsed, so the typo was ignored
      // and the identity was printed as if the command line had been right.
      const {error, stdout} = await runExpectingExit(Whoami, ['--json', '--invalid-flag'])
      expect(stdout).toContain('C400-INP-001')
      expect(stdout).toContain('Nonexistent flag: --invalid-flag')
      expect(stdout).not.toContain(sentinel)
      expect(JSON.stringify(error)).not.toContain(sentinel)
      expect(stdout).not.toContain('a@x')
    } finally {
      delete process.env.CLOSEYOURIT_TOKEN
    }
  })

  it('an unexpected error in --json emits only a safe envelope', async () => {
    const sentinel = 'cyi_u_FULL_SECRET_SENTINEL_NEVER_PRINT'
    process.env.CLOSEYOURIT_TOKEN = sentinel
    try {
      // No mocked response: `run` blows up on `res.data.account`. A real failure keeps the generic
      // code (CYCL-33), and the envelope still carries nothing but code + message.
      const {error, stdout} = await runExpectingExit(Whoami, ['--json'])
      expect(stdout).toContain('C500-SYS-001')
      expect(stdout).not.toContain(sentinel)
      expect(JSON.stringify(error)).not.toContain(sentinel)
    } finally {
      delete process.env.CLOSEYOURIT_TOKEN
    }
  })
})

describe('login', () => {
  const authorization = {
    device_code: 'dc',
    user_code: 'WXYZ-1234',
    verification_uri: 'https://api.test/device',
    verification_uri_complete: 'https://api.test/device?code=WXYZ-1234',
    interval: 5,
    expires_in: 600,
  }
  const tokenResult = {access_token: 'tok_live', token: {id: 't1', name: 'cli', prefix: 'cyi_abc'}}

  it('runs the device flow, opens the browser, persists the token and identity', async () => {
    vi.mocked(startDeviceFlow).mockResolvedValue(authorization)
    vi.mocked(pollDeviceToken).mockResolvedValue(tokenResult)
    apiMock.get.mockResolvedValue(
      envelope({
        account: {id: 'a1', name: 'Ada', email: 'ada@acme.test'},
        organization: {id: 'o1', name: 'Acme', slug: 'acme'},
      }),
    )

    const cap = capture()
    let result: {account?: {email: string}; token?: {prefix: string}}
    try {
      result = (await run(Login, [])) as typeof result
    } finally {
      cap.restore()
    }

    expect(vi.mocked(startDeviceFlow)).toHaveBeenCalledOnce()
    expect(vi.mocked(openUrl)).toHaveBeenCalledWith(authorization.verification_uri_complete)
    expect(apiMock.get).toHaveBeenCalledWith('/cli/v1/whoami')
    expect(vi.mocked(saveConfig)).toHaveBeenCalled()
    expect(result.account?.email).toBe('ada@acme.test')
    expect(result.token?.prefix).toBe('cyi_abc')
    expect(cap.stdout()).toContain('WXYZ-1234')
    expect(cap.stdout()).toContain('Logged in as ada@acme.test')
  })

  it('prints the address that already carries the code, so a click in the terminal works (CYCL-76)', async () => {
    vi.mocked(startDeviceFlow).mockResolvedValue(authorization)
    vi.mocked(pollDeviceToken).mockResolvedValue(tokenResult)
    apiMock.get.mockResolvedValue(envelope({}))

    const cap = capture()
    try {
      await run(Login, [])
    } finally {
      cap.restore()
    }

    expect(cap.stdout()).toContain(authorization.verification_uri_complete)
  })

  it('does not open a login address from another origin, but still prints the code (CYCL-74)', async () => {
    vi.mocked(startDeviceFlow).mockResolvedValue({
      ...authorization,
      verification_uri_complete: 'https://evil.test/device?code=WXYZ-1234',
    })
    vi.mocked(pollDeviceToken).mockResolvedValue(tokenResult)
    apiMock.get.mockResolvedValue(envelope({}))

    const cap = capture()
    try {
      await run(Login, [])
    } finally {
      cap.restore()
    }

    expect(vi.mocked(openUrl)).not.toHaveBeenCalled()
    expect(cap.stdout()).toContain('WXYZ-1234')
    expect(cap.stdout()).toContain('https://api.test/device')
    expect(cap.stdout()).not.toContain('evil.test')
    expect(cap.stdout()).not.toContain('Opening your browser')
  })

  it('persists a custom issuer only after the complete flow succeeds', async () => {
    vi.mocked(startDeviceFlow).mockImplementation(async () => {
      expect(saveConfig).not.toHaveBeenCalled()
      return authorization
    })
    vi.mocked(pollDeviceToken).mockResolvedValue(tokenResult)
    apiMock.get.mockResolvedValue(envelope({}))

    const cap = capture()
    try {
      await run(Login, ['--api-url', 'https://staging.closeyour.it'])
    } finally {
      cap.restore()
    }

    expect(vi.mocked(startDeviceFlow)).toHaveBeenCalledWith('https://staging.closeyour.it', expect.any(String))
    expect(saveConfig).toHaveBeenCalledExactlyOnceWith({apiUrl: 'https://staging.closeyour.it', token: 'tok_live'})
  })

  it('surfaces a device-flow failure to the caller', async () => {
    vi.mocked(startDeviceFlow).mockRejectedValue(new Error('Device authorization failed'))
    // A plain Error is not an ApiRequestError, so base.catch defers to oclif, which rethrows it.
    await expect(run(Login, [])).rejects.toThrow(/Device authorization failed/)
    expect(saveConfig).not.toHaveBeenCalled()
  })

  it('persists the runtime issuer together with the token it issued', async () => {
    vi.mocked(loadConfig).mockReturnValue({apiUrl: 'https://al-volo.test'})
    vi.mocked(loadStoredConfig).mockReturnValue({apiUrl: 'https://salvato.test'})
    vi.mocked(startDeviceFlow).mockResolvedValue(authorization)
    vi.mocked(pollDeviceToken).mockResolvedValue(tokenResult)
    apiMock.get.mockResolvedValue(envelope({}))

    const cap = capture()
    try {
      await run(Login, [])
    } finally {
      cap.restore()
    }

    expect(vi.mocked(startDeviceFlow)).toHaveBeenCalledWith('https://al-volo.test', expect.any(String))
    expect(saveConfig).toHaveBeenCalledExactlyOnceWith({apiUrl: 'https://al-volo.test', token: 'tok_live'})
  })

  it.each(['poll', 'identity'])('preserves previous credentials when %s fails', async (step) => {
    vi.mocked(loadConfig).mockReturnValue({apiUrl: 'https://previous.test', token: 'previous-token'})
    vi.mocked(startDeviceFlow).mockResolvedValue(authorization)
    vi.mocked(pollDeviceToken).mockResolvedValue(tokenResult)
    if (step === 'poll') vi.mocked(pollDeviceToken).mockRejectedValue(new Error('Login interrupted'))
    else apiMock.get.mockRejectedValue(new Error('Login interrupted'))
    const cap = capture()
    try {
      await expect(run(Login, ['--api-url', 'https://new.test'])).rejects.toThrow('Login interrupted')
    } finally {
      cap.restore()
    }
    expect(saveConfig).not.toHaveBeenCalled()
  })
})

describe('logout', () => {
  it('clears the local token and prints guidance', async () => {
    const cap = capture()
    let result: {ok: boolean}
    try {
      result = (await run(Logout, [])) as typeof result
    } finally {
      cap.restore()
    }
    expect(vi.mocked(clearToken)).toHaveBeenCalledOnce()
    expect(result.ok).toBe(true)
    expect(cap.stdout()).toContain('Logged out')
  })

  it('a nonexistent flag stops the command before deleting the credentials', async () => {
    const {stdout} = await runExpectingExit(Logout, ['--json', '--nope'])
    expect(JSON.parse(stdout)).toEqual({error: {code: 'C400-INP-001', message: 'Nonexistent flag: --nope'}})
    expect(vi.mocked(clearToken)).not.toHaveBeenCalled()
  })
})

describe('whoami', () => {
  it('prints the account, organization, token and permissions', async () => {
    apiMock.get.mockResolvedValue(
      envelope({
        account: {id: 'a1', name: 'Ada', email: 'ada@acme.test'},
        organization: {id: 'o1', name: 'Acme', slug: 'acme'},
        token: {id: 't1', name: 'cli', prefix: 'cyi_abc'},
        permissions: ['tickets.edit', 'errors.view'],
      }),
    )

    const cap = capture()
    try {
      await run(Whoami, [])
    } finally {
      cap.restore()
    }

    expect(apiMock.get).toHaveBeenCalledWith('/cli/v1/whoami')
    expect(cap.stdout()).toContain('ada@acme.test')
    expect(cap.stdout()).toContain('tickets.edit, errors.view')
  })

  it('exits non-zero and prints the code when the API errors', async () => {
    apiMock.get.mockRejectedValue(apiError(401, 'R401-AUTH-001', 'Not authenticated'))
    const {stderr} = await runExpectingExit(Whoami, [])
    expect(stderr).toContain('R401-AUTH-001')
    expect(stderr).toContain('Not authenticated')
  })
})
