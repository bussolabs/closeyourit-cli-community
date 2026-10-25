import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {apiMock, resetApiMock} from './helpers/api-mock'
import {capture, envelope, run, runCaptured} from './helpers/command'
import {loadStoredConfig, saveConfig, savedLogins, withActiveLogin} from '../src/lib/config'
import {pollDeviceToken, startDeviceFlow} from '../src/lib/device-flow'

vi.mock('../src/lib/api', async (io) => {
  const actual = await io<typeof import('../src/lib/api')>()
  const {apiMock} = await import('./helpers/api-mock')
  return {...actual, CliApi: vi.fn(function () { return apiMock })}
})
vi.mock('../src/lib/device-flow', () => ({startDeviceFlow: vi.fn(), pollDeviceToken: vi.fn()}))
vi.mock('../src/lib/browser', async (io) => {
  const actual = await io<typeof import('../src/lib/browser')>()
  return {...actual, openUrl: vi.fn()}
})

import Login from '../src/commands/login'
import OrgList from '../src/commands/org/list'
import OrgSwitch from '../src/commands/org/switch'

const API = 'https://api.test'
const acme = {apiUrl: API, token: 'tok_acme', account: {id: 'a1', name: 'Ada', email: 'ada@x.test'}, organization: {id: 'o1', name: 'Acme', slug: 'acme'}}
const beta = {apiUrl: API, token: 'tok_beta', account: {id: 'a1', name: 'Ada', email: 'ada@x.test'}, organization: {id: 'o2', name: 'Beta', slug: 'beta'}}

let dir: string

function signInThroughBrowser(organization: {id: string; name: string; slug: string}): void {
  vi.mocked(startDeviceFlow).mockResolvedValue({
    device_code: 'dc',
    user_code: 'WXYZ-1234',
    verification_uri: `${API}/device`,
    verification_uri_complete: `${API}/device?code=WXYZ-1234`,
    interval: 5,
    expires_in: 600,
  })
  vi.mocked(pollDeviceToken).mockResolvedValue({access_token: `tok_${organization.slug}`, token: {id: 't', name: 'cli', prefix: 'cyi_u'}})
  apiMock.get.mockResolvedValue(envelope({account: acme.account, organization}))
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyi-org-switch-'))
  process.env.CLOSEYOURIT_CONFIG_DIR = dir
  delete process.env.CLOSEYOURIT_TOKEN
  delete process.env.CLOSEYOURIT_API_URL
  resetApiMock()
  vi.mocked(startDeviceFlow).mockReset()
  vi.mocked(pollDeviceToken).mockReset()
})

afterEach(() => {
  delete process.env.CLOSEYOURIT_CONFIG_DIR
  fs.rmSync(dir, {recursive: true, force: true})
})

describe('org switch', () => {
  it('switches to an organization already signed into, without a browser', async () => {
    saveConfig(withActiveLogin(withActiveLogin({apiUrl: API}, acme), beta))

    const {stdout} = await runCaptured(OrgSwitch, ['ACME'])

    expect(startDeviceFlow).not.toHaveBeenCalled()
    expect(loadStoredConfig().token).toBe('tok_acme')
    expect(loadStoredConfig().organization?.slug).toBe('acme')
    expect(savedLogins(loadStoredConfig()).map((login) => login.organization.slug)).toEqual(['acme', 'beta'])
    expect(stdout).toContain('Now in Acme (acme)')
  })

  it('signs in through the browser the first time and keeps the previous organization', async () => {
    saveConfig(withActiveLogin({apiUrl: API}, acme))
    signInThroughBrowser(beta.organization)

    const {stdout} = await runCaptured(OrgSwitch, ['beta'])

    expect(startDeviceFlow).toHaveBeenCalledWith(API, expect.any(String))
    expect(loadStoredConfig().token).toBe('tok_beta')
    expect(savedLogins(loadStoredConfig()).map((login) => login.organization.slug)).toEqual(['acme', 'beta'])
    expect(stdout).toContain('WXYZ-1234')
    expect(stdout).toContain('Now in Beta (beta)')
  })

  it('warns when a different organization is picked in the browser', async () => {
    saveConfig(withActiveLogin({apiUrl: API}, acme))
    signInThroughBrowser(beta.organization)

    const cap = capture()
    try {
      await run(OrgSwitch, ['gamma'])
    } finally {
      cap.restore()
    }

    expect(cap.stderr()).toContain('You picked Beta (beta) in the browser, not "gamma"')
    expect(cap.stdout()).toContain('Now in Beta (beta)')
  })

  it('a failed sign-in leaves the active organization untouched', async () => {
    saveConfig(withActiveLogin({apiUrl: API}, acme))
    vi.mocked(startDeviceFlow).mockRejectedValue(new Error('Device authorization failed'))

    await expect(runCaptured(OrgSwitch, ['beta'])).rejects.toThrow('Device authorization failed')

    expect(loadStoredConfig().token).toBe('tok_acme')
  })

  it('warns that CLOSEYOURIT_TOKEN still wins over the switched organization', async () => {
    saveConfig(withActiveLogin(withActiveLogin({apiUrl: API}, acme), beta))
    process.env.CLOSEYOURIT_TOKEN = 'cyi_u_env'
    const cap = capture()
    try {
      await run(OrgSwitch, ['acme'])
    } finally {
      cap.restore()
      delete process.env.CLOSEYOURIT_TOKEN
    }

    expect(cap.stderr()).toContain('CLOSEYOURIT_TOKEN is set')
    expect(loadStoredConfig().token).toBe('tok_acme')
  })

  it('signs in quietly with --json, waiting without printing dots', async () => {
    saveConfig(withActiveLogin({apiUrl: API}, acme))
    signInThroughBrowser(beta.organization)
    vi.mocked(pollDeviceToken).mockImplementation(async (_url, _code, opts) => {
      opts?.onPending?.()
      return {access_token: 'tok_beta', token: {id: 't', name: 'cli', prefix: 'cyi_u'}}
    })
    const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    let stdout: string
    try {
      stdout = (await runCaptured(OrgSwitch, ['beta', '--json'])).stdout
    } finally {
      write.mockRestore()
    }

    expect(write).not.toHaveBeenCalledWith('.')
    expect(stdout).not.toContain('WXYZ-1234')
    expect(JSON.parse(stdout)).toEqual({organization: beta.organization, account: beta.account})
  })

  it('a sign-in that returns no organization becomes active without being saved for switching', async () => {
    saveConfig(withActiveLogin({apiUrl: API}, acme))
    signInThroughBrowser(beta.organization)
    apiMock.get.mockResolvedValue(envelope({}))

    const {stdout} = await runCaptured(OrgSwitch, ['beta'])

    expect(stdout).toContain('Now in no organization')
    expect(loadStoredConfig().token).toBe('tok_beta')
    expect(savedLogins(loadStoredConfig()).map((login) => login.organization.slug)).toEqual(['acme'])
  })

  it('--json returns the organization and never a token', async () => {
    saveConfig(withActiveLogin(withActiveLogin({apiUrl: API}, acme), beta))

    const {stdout} = await runCaptured(OrgSwitch, ['acme', '--json'])

    expect(JSON.parse(stdout)).toEqual({organization: acme.organization, account: acme.account})
    expect(stdout).not.toContain('tok_')
  })
})

describe('org list', () => {
  it('lists the saved organizations and marks the active one, without tokens', async () => {
    saveConfig(withActiveLogin(withActiveLogin({apiUrl: API}, acme), beta))

    const {stdout} = await runCaptured(OrgList, ['--json'])

    expect(JSON.parse(stdout)).toEqual([
      {id: 'o1', name: 'Acme', slug: 'acme', account: 'ada@x.test', active: false},
      {id: 'o2', name: 'Beta', slug: 'beta', account: 'ada@x.test', active: true},
    ])
    expect(stdout).not.toContain('tok_')
  })

  it('prints a table with the active organization starred', async () => {
    saveConfig(withActiveLogin(withActiveLogin({apiUrl: API}, acme), {...beta, account: undefined}))

    const {stdout} = await runCaptured(OrgList, [])

    expect(stdout).toMatch(/\*\s+Beta\s+beta/)
    expect(stdout).toMatch(/Acme\s+acme\s+ada@x\.test/)
  })

  it('says how to sign in when nothing is saved', async () => {
    const {stdout} = await runCaptured(OrgList, [])
    expect(stdout).toContain('No organization saved yet')
  })
})

describe('login', () => {
  it('keeps the organizations signed into before', async () => {
    saveConfig(withActiveLogin({apiUrl: API}, acme))
    signInThroughBrowser(beta.organization)

    await runCaptured(Login, [])

    expect(loadStoredConfig().organization?.slug).toBe('beta')
    expect(savedLogins(loadStoredConfig()).map((login) => login.organization.slug)).toEqual(['acme', 'beta'])
  })
})
