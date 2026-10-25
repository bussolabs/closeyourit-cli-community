import {afterEach, describe, expect, it, vi} from 'vitest'
import {mkdtemp, mkdir, rm, symlink, writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {proguardMapUploadBody, readProguardMapFile} from '../src/lib/proguard-maps'

const debugId = '12345678-1234-5678-9012-123456789abc'
const identity = {release: ' v1 ', dist: ' arm64 ', debugId}
const mapping = '# {"id":"com.android.tools.r8.mapping","version":"2.2"}\r\nexample.Original -> a:\r\n    1:2:void fail():7:8 -> a\r\n'
const directories: string[] = []
async function directory() { const path = await mkdtemp(join(tmpdir(), 'cyi-proguard-')); directories.push(path); return path }
afterEach(async () => { await Promise.all(directories.splice(0).map((path) => rm(path, {recursive: true, force: true}))) })

describe('ProGuard mapping upload preparation', () => {
  it('fails closed when the platform cannot prevent following symbolic links', async () => {
    vi.resetModules()
    vi.doMock('node:fs', () => ({constants: {O_RDONLY: 0}}))
    try {
      const {readProguardMapFile: unsupportedRead} = await import('../src/lib/proguard-maps')
      await expect(unsupportedRead('/missing/mapping.txt')).rejects.toThrow('This platform does not support safe mapping file uploads.')
    } finally {
      vi.doUnmock('node:fs')
      vi.resetModules()
    }
  })
  it('preserves mapping comments and line endings and exact nonblank release/dist', () => {
    expect(proguardMapUploadBody(identity, mapping)).toEqual({release: ' v1 ', dist: ' arm64 ', debug_id: debugId, mapping})
    expect(proguardMapUploadBody({...identity, dist: ' '}, mapping)).not.toHaveProperty('dist')
    expect(proguardMapUploadBody({...identity, dist: '\t\r\n'}, mapping)).not.toHaveProperty('dist')
    expect(proguardMapUploadBody({...identity, debugId: debugId.replaceAll('-', '').toUpperCase()}, mapping).debug_id).toBe(debugId.replaceAll('-', '').toUpperCase())
  })

  it.each(['', 'deadbeef', '00000000-0000-0000-0000-000000000000', '12345678_1234_5678_9012_123456789abc'])('rejects invalid Sentry UUID without echoing its value', (debugId) => {
    expect(() => proguardMapUploadBody({...identity, debugId}, mapping)).toThrow('A valid nonzero ProGuard debug UUID is required.')
  })

  it('requires a release and rejects NUL, empty and oversized mappings without parsing R8', () => {
    expect(() => proguardMapUploadBody({...identity, release: ' '}, mapping)).toThrow('release')
    expect(() => proguardMapUploadBody({...identity, release: 'v1\0'}, mapping)).toThrow('release')
    expect(() => proguardMapUploadBody({...identity, dist: 'privateSentinel\0'}, mapping)).toThrow('Distribution must not contain control characters.')
    expect(() => proguardMapUploadBody(identity, 'privateSentinel\0')).toThrow('NUL')
    expect(() => proguardMapUploadBody(identity, ' \r\n')).toThrow('nonempty')
    expect(() => proguardMapUploadBody(identity, 'x'.repeat(8 * 1024 * 1024 + 1))).toThrow('8 MiB')
    expect(proguardMapUploadBody(identity, '# semantic extension unknown to the CLI').mapping).toBe('# semantic extension unknown to the CLI')
    expect(() => proguardMapUploadBody(identity, '\\'.repeat(5 * 1024 * 1024))).toThrow('10 MiB')
  })

  it.each(['txt', 'map'])('reads a regular .%s file without altering UTF-8 or a BOM', async (extension) => {
    const path = join(await directory(), `mapping.${extension}`)
    const original = '\ufeff' + mapping + '# Unicode: 日本語\n'
    await writeFile(path, original)
    expect(await readProguardMapFile(path)).toBe(original)
  })

  it('preserves mappings at the eight MiB boundary', async () => {
    const path = join(await directory(), 'mapping.txt')
    const original = mapping.padEnd(8 * 1024 * 1024, ' ')
    await writeFile(path, original)
    expect(await readProguardMapFile(path)).toBe(original)
    expect(proguardMapUploadBody(identity, original).mapping).toBe(original)
  })

  it('refuses links, directories, missing files and secret paths', async () => {
    const dir = await directory(), path = join(dir, 'mapping.txt')
    await writeFile(path, mapping)
    await symlink(path, join(dir, 'link.txt'))
    await mkdir(join(dir, 'folder.map'))
    for (const name of ['link.txt', 'folder.map', 'missing.txt']) await expect(readProguardMapFile(join(dir, name))).rejects.toThrow('regular')
    for (const name of ['.env.map', 'credentials.txt', 'secrets.txt', 'id_rsa.txt', 'mapping.json']) await expect(readProguardMapFile(join(dir, name))).rejects.toThrow('explicit')
  })

  it('bounds the opened descriptor and rejects malformed UTF-8 without showing bytes', async () => {
    const path = join(await directory(), 'mapping.txt')
    await writeFile(path, 'x'.repeat(8 * 1024 * 1024 + 1))
    await expect(readProguardMapFile(path)).rejects.toThrow('8 MiB')
    await writeFile(path, Buffer.from([0xff]))
    await expect(readProguardMapFile(path)).rejects.toThrow('valid UTF-8')
    await writeFile(path, 'privateSentinel\0')
    await expect(readProguardMapFile(path)).rejects.toThrow('NUL')
  })
})
