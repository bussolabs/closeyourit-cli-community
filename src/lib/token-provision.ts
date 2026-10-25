import type {Envelope} from './api'

type UnknownRecord = Record<string, unknown>

const tokenKeys = [
  'id',
  'name',
  'environment_id',
  'token_prefix',
  'public_key',
  'scopes',
  'last_used_at',
  'revoked_at',
  'created_at',
] as const

const provisionKeys = [
  'id',
  'status',
  'secret_name',
  'sync_github',
  'error_code',
  'error_message',
  'synced_at',
  'created_at',
  'updated_at',
  'source_project_id',
  'source_environment_id',
  'destination_project_id',
  'destination_environment_id',
] as const

function record(value: unknown): UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as UnknownRecord) : {}
}

function pick(source: UnknownRecord, keys: readonly string[]): UnknownRecord {
  const safe: UnknownRecord = {}
  for (const key of keys) {
    if (source[key] !== undefined) safe[key] = source[key]
  }

  return safe
}

/**
 * Rebuild the backend response from an allow-list. Even if a future backend regression adds a
 * plaintext field, blind commands cannot return it through oclif's JSON formatter.
 */
export function safeTokenProvisionEnvelope(response: Envelope<unknown>): Envelope<UnknownRecord> {
  const data = record(response.data)
  const safeData = data.provision === undefined
    ? pick(data, provisionKeys)
    : {
        token: pick(record(data.token), tokenKeys),
        provision: pick(record(data.provision), provisionKeys),
      }

  return response.meta ? {data: safeData, meta: response.meta} : {data: safeData}
}
