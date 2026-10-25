import {ApiRequestError} from './api'

export function artifactPath(project: string, id?: string, kind: 'source_maps' | 'proguard_maps' | 'native_symbols' = 'source_maps'): string {
  const base = `/cli/v1/projects/${encodeURIComponent(project)}/artifacts/${kind}`
  return id === undefined ? base : `${base}/${encodeURIComponent(id)}`
}

/** Return public artifact metadata only, even if the backend includes private contents. */
export function artifactMetadata(value: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const key of ['id', 'release', 'dist', 'generated_file', 'debug_id', 'byte_size', 'sha256', 'created_at', 'format', 'architecture', 'code_id']) {
    if (Object.hasOwn(value, key)) result[key] = value[key]
  }
  return result
}

export function artifactFailure(error: unknown, label: 'Source map' | 'ProGuard map' | 'native symbol' = 'Source map'): never {
  if (error instanceof ApiRequestError) {
    throw new ApiRequestError(error.status, error.code, `${label} request failed. Check access, identity, input limits and storage availability.`)
  }
  throw error
}
