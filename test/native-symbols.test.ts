import {afterEach, describe, expect, it} from 'vitest'
import {mkdtemp, mkdir, rm, symlink, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {nativeSymbolUploadBody, readNativeSymbolFile, validateNativeSymbolIdentity} from '../src/lib/native-symbols'

const dirs: string[] = []
async function directory() { const path = await mkdtemp(join(tmpdir(), 'cyi-native-')); dirs.push(path); return path }
afterEach(async () => { for (const dir of dirs.splice(0)) await rm(dir, {recursive: true, force: true}) })
const identity = {format: 'elf', architecture: 'arm64', debugId: 'cd4bb8e6-a7fe-3089-1de1-3ce56c1bf370', codeId: 'e6b84bcdfea789301de13ce56c1bf3706c31fca0'}
const bytes = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0, 255])

describe('native symbol input boundaries', () => {
  it('preserves all binary bytes and exact build identity without a release', () => {
    expect(nativeSymbolUploadBody(identity, bytes)).toEqual({format: 'elf', architecture: 'arm64', debug_id: identity.debugId, code_id: identity.codeId, object_base64: bytes.toString('base64')})
  })
  it.each(['macho', 'pdb', 'pe'])('allows an exact %s debug ID without a code ID', (format) => {
    expect(() => validateNativeSymbolIdentity({format, architecture: 'x86_64', debugId: identity.debugId + '-1'})).not.toThrow()
  })
  it.each(['', '00000000-0000-0000-0000-000000000000', identity.debugId + '-123456789', identity.debugId + '-1-tail', identity.debugId.replaceAll('-', '') + '-1', identity.debugId + '\n'])('rejects invalid or truncated debug identities (%j)', (debugId) => {
    expect(() => validateNativeSymbolIdentity({...identity, debugId})).toThrow('debug ID')
  })
  it('accepts compact IDs and the full eight-digit PDB age', () => {
    expect(() => validateNativeSymbolIdentity({...identity, format: 'pdb', codeId: undefined, debugId: identity.debugId.replaceAll('-', '') + 'ffffffff'})).not.toThrow()
  })
  it('requires the complete ELF code ID and rejects invalid identities before file access', () => {
    expect(() => validateNativeSymbolIdentity({...identity, codeId: undefined})).toThrow('ELF')
    expect(() => validateNativeSymbolIdentity({...identity, codeId: 'xyz'})).toThrow('code ID')
    expect(() => validateNativeSymbolIdentity({...identity, codeId: 'f'.repeat(129)})).toThrow('code ID')
    expect(() => validateNativeSymbolIdentity({...identity, format: 'pdb'})).toThrow('PDB')
    expect(() => validateNativeSymbolIdentity({...identity, format: 'zip'})).toThrow('format')
    expect(() => validateNativeSymbolIdentity({...identity, architecture: 'arm64\n'})).toThrow('architecture')
  })
  it('bounds binary and JSON sizes, rejecting empty input', () => {
    expect(() => nativeSymbolUploadBody(identity, Buffer.alloc(0))).toThrow('nonempty')
    expect(nativeSymbolUploadBody(identity, Buffer.alloc(20 * 1024 * 1024))).toHaveProperty('object_base64')
    expect(() => nativeSymbolUploadBody(identity, Buffer.alloc(20 * 1024 * 1024 + 1))).toThrow('20 MiB')
  })
  it('reads one regular binary file including an extensionless dSYM member', async () => {
    const path = join(await directory(), 'Application')
    await writeFile(path, bytes)
    expect(await readNativeSymbolFile(path)).toEqual(bytes)
  })
  it('refuses links, directories, missing files and credential paths', async () => {
    const dir = await directory(), path = join(dir, 'application.debug')
    await writeFile(path, bytes)
    await symlink(path, join(dir, 'link'))
    await mkdir(join(dir, 'Application.dSYM'))
    for (const name of ['link', 'Application.dSYM', 'missing']) await expect(readNativeSymbolFile(join(dir, name))).rejects.toThrow('regular')
    for (const name of ['.env', 'credentials.json', 'id_rsa', 'certificate.pem', 'private.key', 'signing.p12']) await expect(readNativeSymbolFile(join(dir, name))).rejects.toThrow('secret')
  })
  it('bounds bytes from the opened descriptor and refuses empty files', async () => {
    const path = join(await directory(), 'application.debug')
    await writeFile(path, Buffer.alloc(20 * 1024 * 1024 + 1))
    await expect(readNativeSymbolFile(path)).rejects.toThrow('20 MiB')
    await writeFile(path, Buffer.alloc(0))
    await expect(readNativeSymbolFile(path)).rejects.toThrow('nonempty')
  })
})
