import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {clearToken, configPath, loadConfig, loadStoredConfig, saveConfig, savedLogins, withActiveLogin} from '../src/lib/config'

let dir: string
const savedApiUrlEnv = process.env.CLOSEYOURIT_API_URL
const savedTokenEnv = process.env.CLOSEYOURIT_TOKEN

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyi-config-'))
  process.env.CLOSEYOURIT_CONFIG_DIR = dir
  delete process.env.CLOSEYOURIT_API_URL
  delete process.env.CLOSEYOURIT_TOKEN
})

afterEach(() => {
  delete process.env.CLOSEYOURIT_CONFIG_DIR
  if (savedApiUrlEnv === undefined) delete process.env.CLOSEYOURIT_API_URL
  else process.env.CLOSEYOURIT_API_URL = savedApiUrlEnv
  if (savedTokenEnv === undefined) delete process.env.CLOSEYOURIT_TOKEN
  else process.env.CLOSEYOURIT_TOKEN = savedTokenEnv
  fs.rmSync(dir, {recursive: true, force: true})
})

describe('config', () => {
  it('round-trips save and load', () => {
    saveConfig({
      apiUrl: 'https://example.test',
      token: 'tok_123',
      account: {id: 'a', name: 'Ada', email: 'ada@example.test'},
      organization: {id: 'o', name: 'Acme', slug: 'acme'},
    })

    const loaded = loadConfig()
    expect(loaded.apiUrl).toBe('https://example.test')
    expect(loaded.token).toBe('tok_123')
    expect(loaded.account?.email).toBe('ada@example.test')
    expect(loaded.organization?.slug).toBe('acme')
  })

  it('applies the default apiUrl when no config exists', () => {
    const loaded = loadConfig()
    expect(loaded.apiUrl).toBe('https://app.closeyour.it')
    expect(loaded.token).toBeUndefined()
  })

  it('honours CLOSEYOURIT_API_URL for the default apiUrl', () => {
    process.env.CLOSEYOURIT_API_URL = 'https://staging.closeyour.it'
    expect(loadConfig().apiUrl).toBe('https://staging.closeyour.it')
  })

  it('CLOSEYOURIT_API_URL overrides the apiUrl saved in the config', () => {
    saveConfig({apiUrl: 'https://salvato.test', token: 'tok'})
    process.env.CLOSEYOURIT_API_URL = 'https://al-volo.test'
    expect(loadConfig().apiUrl).toBe('https://al-volo.test')
  })

  it('never forwards the stored bearer to an overridden endpoint', () => {
    saveConfig({apiUrl: 'https://issuer.test', token: 'issuer-token'})
    process.env.CLOSEYOURIT_API_URL = 'https://different.test'
    expect(loadConfig().token).toBeUndefined()
    process.env.CLOSEYOURIT_TOKEN = 'explicit-other-token'
    expect(loadConfig().token).toBe('explicit-other-token')
  })

  it('keeps credentials for an equivalent normalized endpoint', () => {
    saveConfig({apiUrl: 'https://issuer.test', token: 'issuer-token'})
    process.env.CLOSEYOURIT_API_URL = 'https://issuer.test:443/'
    expect(loadConfig().token).toBe('issuer-token')
  })

  it('ignores a whitespace-only CLOSEYOURIT_API_URL (falls back to the config)', () => {
    saveConfig({apiUrl: 'https://salvato.test', token: 'tok'})
    process.env.CLOSEYOURIT_API_URL = '   '
    expect(loadConfig().apiUrl).toBe('https://salvato.test')
  })

  it('writes config.json with 0600 permissions', () => {
    saveConfig({apiUrl: 'https://example.test', token: 'tok'})
    const mode = fs.statSync(configPath()).mode & 0o777
    expect(mode).toBe(0o600)
  })

  it('uses CLOSEYOURIT_TOKEN from the environment for headless use (no config)', () => {
    process.env.CLOSEYOURIT_TOKEN = 'cyi_u_env_headless'
    expect(loadConfig().token).toBe('cyi_u_env_headless')
  })

  it('CLOSEYOURIT_TOKEN overrides the token saved in the config', () => {
    saveConfig({apiUrl: 'https://example.test', token: 'tok_da_file'})
    process.env.CLOSEYOURIT_TOKEN = 'cyi_u_env_override'
    expect(loadConfig().token).toBe('cyi_u_env_override')
  })

  it('ignores a whitespace-only CLOSEYOURIT_TOKEN (falls back to the config)', () => {
    saveConfig({apiUrl: 'https://example.test', token: 'tok_da_file'})
    process.env.CLOSEYOURIT_TOKEN = '   '
    expect(loadConfig().token).toBe('tok_da_file')
  })

  it('clearToken removes token and identity but keeps apiUrl', () => {
    saveConfig({
      apiUrl: 'https://example.test',
      token: 'tok',
      account: {id: 'a', name: 'Ada', email: 'ada@example.test'},
    })

    clearToken()

    const loaded = loadConfig()
    expect(loaded.token).toBeUndefined()
    expect(loaded.account).toBeUndefined()
    expect(loaded.apiUrl).toBe('https://example.test')
  })

  it('clearToken keeps the apiUrl on disk and ignores the CLOSEYOURIT_API_URL override', () => {
    saveConfig({apiUrl: 'https://salvato.test', token: 'tok'})
    process.env.CLOSEYOURIT_API_URL = 'https://al-volo.test'
    clearToken()
    const persisted = JSON.parse(fs.readFileSync(configPath(), 'utf8'))
    expect(persisted.apiUrl).toBe('https://salvato.test')
    expect(persisted.token).toBeUndefined()
  })

  it('clearToken forgets only the active login and keeps the other organizations', () => {
    const acme = {apiUrl: 'https://example.test', token: 'tok_acme', organization: {id: 'o1', name: 'Acme', slug: 'acme'}}
    const beta = {apiUrl: 'https://example.test', token: 'tok_beta', organization: {id: 'o2', name: 'Beta', slug: 'beta'}}
    saveConfig(withActiveLogin(withActiveLogin({apiUrl: 'https://example.test'}, acme), beta))

    clearToken()

    const stored = loadStoredConfig()
    expect(stored.token).toBeUndefined()
    expect(stored.organization).toBeUndefined()
    expect(savedLogins(stored).map((login) => login.organization.slug)).toEqual(['acme'])
  })
})

describe('saved logins', () => {
  const acme = {apiUrl: 'https://example.test', token: 'tok_acme', organization: {id: 'o1', name: 'Acme', slug: 'acme'}}
  const beta = {apiUrl: 'https://example.test', token: 'tok_beta', organization: {id: 'o2', name: 'Beta', slug: 'beta'}}

  it('a new login becomes active and keeps the previous one saved', () => {
    const cfg = withActiveLogin(withActiveLogin({apiUrl: 'https://example.test'}, acme), beta)

    expect(cfg.token).toBe('tok_beta')
    expect(cfg.organization?.slug).toBe('beta')
    expect(savedLogins(cfg).map((login) => login.organization.slug)).toEqual(['acme', 'beta'])
  })

  it('signing in again to the same organization replaces its token in place', () => {
    const cfg = withActiveLogin(withActiveLogin(withActiveLogin({apiUrl: 'https://example.test'}, acme), beta), {
      ...acme,
      token: 'tok_acme_new',
    })

    expect(cfg.token).toBe('tok_acme_new')
    expect(savedLogins(cfg).map((login) => [login.organization.slug, login.token])).toEqual([
      ['acme', 'tok_acme_new'],
      ['beta', 'tok_beta'],
    ])
  })

  it('a config written before saved logins existed still lists its active login', () => {
    saveConfig({apiUrl: 'https://example.test', token: 'tok_old', organization: {id: 'o1', name: 'Acme', slug: 'acme'}})

    const stored = loadStoredConfig()
    expect(savedLogins(stored).map((login) => login.token)).toEqual(['tok_old'])
    expect(savedLogins(withActiveLogin(stored, beta)).map((login) => login.organization.slug)).toEqual(['acme', 'beta'])
  })

  it('lists only the logins issued by the configured endpoint', () => {
    const staging = {...acme, apiUrl: 'https://staging.test', token: 'tok_staging'}
    const cfg = withActiveLogin(withActiveLogin({apiUrl: 'https://example.test'}, staging), beta)

    expect(savedLogins(cfg).map((login) => login.token)).toEqual(['tok_beta'])
  })

  it('a login without an organization is active but never saved for switching', () => {
    const cfg = withActiveLogin({apiUrl: 'https://example.test'}, {apiUrl: 'https://example.test', token: 'tok'})

    expect(cfg).toEqual({apiUrl: 'https://example.test', token: 'tok'})
  })

  it('drops malformed saved logins read from disk', () => {
    fs.writeFileSync(
      configPath(),
      JSON.stringify({apiUrl: 'https://example.test', logins: [acme, {token: 'tok_no_org'}, 'junk']}),
    )

    expect(savedLogins(loadStoredConfig()).map((login) => login.token)).toEqual(['tok_acme'])
  })
})
