import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

export interface CliConfig {
  apiUrl: string
  token?: string
  account?: {id: string; name: string; email: string}
  organization?: {id: string; name: string; slug: string}
  /** One token per organization already signed into, so `org switch` needs no browser the second time. */
  logins?: SavedLogin[]
}

/** A token is bound to one organization by the server: switching organization means switching token. */
export interface SavedLogin {
  apiUrl: string
  token: string
  account?: {id: string; name: string; email: string}
  organization: {id: string; name: string; slug: string}
}

/** The fields a login produces; the organization is missing only if whoami did not return one. */
export type LoginIdentity = Omit<SavedLogin, 'organization'> & {organization?: SavedLogin['organization']}

const DEFAULT_API_URL = 'https://app.closeyour.it'

/** Directory holding config.json. Overridable via CLOSEYOURIT_CONFIG_DIR (read at call time). */
function configDir(): string {
  const override = process.env.CLOSEYOURIT_CONFIG_DIR
  if (override && override.trim() !== '') return override
  return path.join(os.homedir(), '.config', 'closeyourit')
}

export function configPath(): string {
  return path.join(configDir(), 'config.json')
}

/**
 * API URL from CLOSEYOURIT_API_URL env (overrides the stored config apiUrl), for pointing the CLI
 * at another server on the fly — symmetric with envToken(), so URL and token behave the same way.
 */
function envApiUrl(): string | undefined {
  const fromEnv = process.env.CLOSEYOURIT_API_URL
  return fromEnv && fromEnv.trim() !== '' ? fromEnv.trim() : undefined
}

export function defaultApiUrl(): string {
  return envApiUrl() ?? DEFAULT_API_URL
}

/**
 * Token from CLOSEYOURIT_TOKEN env, for headless/CI/agent use (overrides the stored config token).
 * Lets a service account (cyi_u_) authenticate non-interactively without the device-flow login:
 *   CLOSEYOURIT_TOKEN=cyi_u_... cyi secrets bundle -p KEY -e development
 */
function envToken(): string | undefined {
  const fromEnv = process.env.CLOSEYOURIT_TOKEN
  return fromEnv && fromEnv.trim() !== '' ? fromEnv.trim() : undefined
}

/**
 * Config exactly as stored on disk, ignoring env overrides. Non-login mutations such as logout
 * preserve this issuer. A successful login separately persists the issuer of its newly issued token.
 */
export function loadStoredConfig(): CliConfig {
  const file = configPath()
  let parsed: Partial<CliConfig> = {}
  try {
    if (fs.existsSync(file)) {
      parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<CliConfig>
    }
  } catch {
    // Corrupted/unreadable config falls back to defaults rather than crashing.
    parsed = {}
  }
  return {
    apiUrl: parsed.apiUrl && parsed.apiUrl.trim() !== '' ? parsed.apiUrl : DEFAULT_API_URL,
    token: parsed.token,
    account: parsed.account,
    organization: parsed.organization,
    logins: Array.isArray(parsed.logins) ? parsed.logins.filter(isSavedLogin) : undefined,
  }
}

function isSavedLogin(value: unknown): value is SavedLogin {
  if (typeof value !== 'object' || value === null) return false
  const login = value as Partial<SavedLogin>
  return (
    typeof login.apiUrl === 'string' &&
    typeof login.token === 'string' &&
    typeof login.organization?.id === 'string' &&
    typeof login.organization.slug === 'string'
  )
}

/** An endpoint override must never carry a token issued by the stored endpoint. */
function sameEndpoint(left: string, right: string): boolean {
  try {
    const normalize = (value: string): string => new URL(value).href.replace(/\/+$/, '')
    return normalize(left) === normalize(right)
  } catch {
    return false
  }
}

/** Explicit environment credentials belong to the explicitly selected runtime endpoint. */
export function loadConfig(): CliConfig {
  const stored = loadStoredConfig()
  const apiUrl = envApiUrl() ?? stored.apiUrl
  const matched = sameEndpoint(apiUrl, stored.apiUrl)
  return {
    ...stored,
    apiUrl,
    token: envToken() ?? (matched ? stored.token : undefined),
    account: matched ? stored.account : undefined,
    organization: matched ? stored.organization : undefined,
  }
}

export function saveConfig(cfg: CliConfig): void {
  const dir = configDir()
  fs.mkdirSync(dir, {recursive: true})
  const file = configPath()
  fs.writeFileSync(file, `${JSON.stringify(cfg, null, 2)}\n`, {mode: 0o600})
  // Ensure perms even if the file pre-existed with a looser mode.
  fs.chmodSync(file, 0o600)
}

function activeLogin(cfg: CliConfig): SavedLogin | undefined {
  if (!cfg.token || !cfg.organization) return undefined
  return {apiUrl: cfg.apiUrl, token: cfg.token, account: cfg.account, organization: cfg.organization}
}

function sameLogin(left: SavedLogin, right: SavedLogin): boolean {
  return sameEndpoint(left.apiUrl, right.apiUrl) && left.organization.id === right.organization.id
}

/** Every saved login, plus the active one: a config written before `logins` existed only has that. */
function allLogins(cfg: CliConfig): SavedLogin[] {
  const logins = [...(cfg.logins ?? [])]
  const active = activeLogin(cfg)
  if (active && !logins.some((login) => sameLogin(login, active))) logins.unshift(active)
  return logins
}

/** The organizations `org switch` can reach without a browser: the logins issued by the config endpoint. */
export function savedLogins(cfg: CliConfig): SavedLogin[] {
  return allLogins(cfg).filter((login) => sameEndpoint(login.apiUrl, cfg.apiUrl))
}

/** Make `login` the active credential and keep every other saved login, the previously active one included. */
export function withActiveLogin(cfg: CliConfig, login: LoginIdentity): CliConfig {
  const logins = allLogins(cfg)
  const next: CliConfig = {apiUrl: login.apiUrl, token: login.token}
  if (login.account) next.account = login.account
  if (login.organization) {
    const saved: SavedLogin = {...login, organization: login.organization}
    next.organization = saved.organization
    const index = logins.findIndex((existing) => sameLogin(existing, saved))
    if (index === -1) logins.push(saved)
    else logins[index] = saved
  }
  if (logins.length > 0) next.logins = logins
  return next
}

/** Remove token + identity, keep the on-disk apiUrl (never a temporary env override) and the other organizations. */
export function clearToken(): void {
  const cfg = loadStoredConfig()
  const active = activeLogin(cfg)
  const logins = (cfg.logins ?? []).filter((login) => !active || !sameLogin(login, active))
  delete cfg.token
  delete cfg.account
  delete cfg.organization
  if (logins.length > 0) cfg.logins = logins
  else delete cfg.logins
  saveConfig(cfg)
}
