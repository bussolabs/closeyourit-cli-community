import {constants} from 'node:fs'
import {open} from 'node:fs/promises'
import {extname, resolve, sep} from 'node:path'

const MAX_MAPPING = 8 * 1024 * 1024
const MAX_REQUEST = 10 * 1024 * 1024
export class ProguardMapInputError extends Error {}
function invalid(message: string): never { throw new ProguardMapInputError(message) }

function validateMapping(mapping: string): void {
  if (Buffer.byteLength(mapping) > MAX_MAPPING) invalid('ProGuard mapping exceeds 8 MiB.')
  if (mapping.includes('\0')) invalid('ProGuard mapping must not contain NUL bytes.')
  if (!mapping.trim()) invalid('A nonempty ProGuard mapping is required.')
}

/** Preserve semantic comments and bytes; only the isolated backend processor interprets R8. */
export async function readProguardMapFile(path: string): Promise<string> {
  const absolute = resolve(path)
  const denied = absolute.split(sep).some((part) => /^(?:\.env(?:\.|$)|\.ssh$|\.aws$|secrets?(?:\.|$)|credentials?(?:\.|$)|id_(?:rsa|ed25519)(?:\.|$))/i.test(part))
  if (denied || !['.map', '.txt'].includes(extname(absolute).toLowerCase())) invalid('Choose an explicit .txt or .map mapping file, not a secret file.')
  if (!Number.isInteger(constants.O_NOFOLLOW) || constants.O_NOFOLLOW === 0) invalid('This platform does not support safe mapping file uploads.')
  let file
  try { file = await open(absolute, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK) }
  catch { invalid('Unable to open a regular mapping file without following links.') }
  try {
    const info = await file.stat()
    if (!info.isFile()) invalid('ProGuard mapping input must be a regular file.')
    if (info.size > MAX_MAPPING) invalid('ProGuard mapping exceeds 8 MiB.')
    const buffer = Buffer.alloc(MAX_MAPPING + 1)
    let used = 0
    while (used < buffer.length) {
      const {bytesRead} = await file.read(buffer, used, buffer.length - used, null)
      if (bytesRead === 0) break
      used += bytesRead
    }
    if (used > MAX_MAPPING) invalid('ProGuard mapping exceeds 8 MiB.')
    let text: string
    try { text = new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(buffer.subarray(0, used)) }
    catch { invalid('ProGuard mapping must be valid UTF-8.') }
    validateMapping(text)
    return text
  } catch (error) {
    if (error instanceof ProguardMapInputError) throw error
    return invalid('Unable to read the ProGuard mapping file.')
  } finally {
    try { await file.close() }
    catch { invalid('Unable to close the ProGuard mapping file.') }
  }
}

export interface ProguardMapIdentity {release: string; dist?: string; debugId: string}
export function validateProguardMapIdentity(identity: ProguardMapIdentity): void {
  if (!identity.release.trim() || /[\x00-\x1f\x7f]/.test(identity.release)) invalid('A nonblank release without control characters is required.')
  if (identity.dist?.trim() && /[\x00-\x1f\x7f]/.test(identity.dist)) invalid('Distribution must not contain control characters.')
  const uuid = /^(?:[\da-f]{32}|[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12})$/i
  if (!uuid.test(identity.debugId) || /^0+$/.test(identity.debugId.replaceAll('-', ''))) invalid('A valid nonzero ProGuard debug UUID is required.')
}

export function proguardMapUploadBody(identity: ProguardMapIdentity, mapping: string): Record<string, unknown> {
  validateProguardMapIdentity(identity)
  validateMapping(mapping)
  const body = {release: identity.release, ...(identity.dist?.trim() ? {dist: identity.dist} : {}), debug_id: identity.debugId, mapping}
  if (Buffer.byteLength(JSON.stringify(body)) > MAX_REQUEST) invalid('ProGuard mapping upload exceeds 10 MiB.')
  return body
}
