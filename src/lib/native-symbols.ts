import {constants} from 'node:fs'
import {open} from 'node:fs/promises'
import {extname, resolve, sep} from 'node:path'

const MAX_OBJECT = 20 * 1024 * 1024
const MAX_REQUEST = 28 * 1024 * 1024
export class NativeSymbolInputError extends Error {}
function invalid(message: string): never { throw new NativeSymbolInputError(message) }
function validateSize(size: number): void {
  if (!size) invalid('A nonempty native symbol file is required.')
  if (size > MAX_OBJECT) invalid('Native symbol input exceeds 20 MiB.')
}

/** Read one explicit file; bundle traversal and binary interpretation belong outside the CLI. */
export async function readNativeSymbolFile(path: string): Promise<Buffer> {
  const absolute = resolve(path)
  const denied = absolute.split(sep).some((part) => /^(?:\.env(?:\.|$)|\.ssh$|\.aws$|secrets?(?:\.|$)|credentials?(?:\.|$)|id_(?:rsa|ed25519)(?:\.|$))/i.test(part))
  const secretExtension = ['.pem', '.key', '.p8', '.p12', '.pfx', '.jks', '.keystore'].includes(extname(absolute).toLowerCase())
  if (denied || secretExtension) invalid('Choose an explicit native symbol file, not a secret file.')
  if (!Number.isInteger(constants.O_NOFOLLOW) || constants.O_NOFOLLOW === 0) invalid('This platform does not support safe native symbol uploads.')
  let file
  try { file = await open(absolute, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK) }
  catch { invalid('Unable to open a regular native symbol file without following links.') }
  try {
    const info = await file.stat()
    if (!info.isFile()) invalid('Native symbol input must be a regular file.')
    validateSize(info.size)
    const buffer = Buffer.alloc(MAX_OBJECT + 1)
    let used = 0
    while (used < buffer.length) {
      const {bytesRead} = await file.read(buffer, used, buffer.length - used, null)
      if (bytesRead === 0) break
      used += bytesRead
    }
    validateSize(used)
    return buffer.subarray(0, used)
  } catch (error) {
    if (error instanceof NativeSymbolInputError) throw error
    return invalid('Unable to read the native symbol file.')
  } finally {
    try { await file.close() }
    catch { invalid('Unable to close the native symbol file.') }
  }
}

export interface NativeSymbolIdentity {format: string; architecture: string; debugId: string; codeId?: string}
export function validateNativeSymbolIdentity(identity: NativeSymbolIdentity): void {
  if (!['elf', 'macho', 'pe', 'pdb'].includes(identity.format)) invalid('Native symbol format must be elf, macho, pe or pdb.')
  if (!/^[a-z0-9_]{1,32}$/.test(identity.architecture) || /\s/.test(identity.architecture)) invalid('A bounded native architecture name is required.')
  const debug = /^(?:[\da-f]{32,40}|[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}(?:-[\da-f]{1,8})?)$/i
  const uuid = identity.debugId.slice(0, identity.debugId[8] === '-' ? 36 : 32).replaceAll('-', '')
  if (!debug.test(identity.debugId) || /\s/.test(identity.debugId) || /^0+$/.test(uuid)) invalid('A valid nonzero debug ID with an optional 1–8 digit hexadecimal age is required.')
  if (identity.format === 'elf' && !identity.codeId) invalid('ELF requires its complete build code ID.')
  if (identity.format === 'pdb' && identity.codeId !== undefined) invalid('PDB identity uses GUID and age, without a code ID.')
  if (identity.codeId !== undefined && (!/^[\da-f]{1,128}$/i.test(identity.codeId) || /\s/.test(identity.codeId))) invalid('A hexadecimal code ID of at most 128 characters is required.')
}

export function nativeSymbolUploadBody(identity: NativeSymbolIdentity, object: Buffer): Record<string, unknown> {
  validateNativeSymbolIdentity(identity)
  validateSize(object.length)
  const body = {format: identity.format, architecture: identity.architecture, debug_id: identity.debugId,
    ...(identity.codeId === undefined ? {} : {code_id: identity.codeId}), object_base64: object.toString('base64')}
  if (Buffer.byteLength(JSON.stringify(body)) > MAX_REQUEST) invalid('Native symbol upload exceeds 28 MiB.')
  return body
}
