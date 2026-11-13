import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import {mkdir, mkdtemp, readdir, readFile, rm, stat, symlink, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {writePrivateFile, writePrivateFileSync} from '../src/lib/private-file'

let directory: string
beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), 'private-export-')) })
afterEach(async () => { await rm(directory, {recursive: true, force: true}) })

it('creates an owner-only export', async () => {
  const file = join(directory, 'export.json')
  await writePrivateFile(file, 'dummy-value')
  expect((await stat(file)).mode & 0o777).toBe(0o600)
})

it('replaces an existing permissive inode before exposing new content', async () => {
  const file = join(directory, 'export.json')
  await writeFile(file, 'old', {mode: 0o644})
  await writePrivateFile(file, 'dummy-value')
  expect((await stat(file)).mode & 0o777).toBe(0o600)
  expect(await readFile(file, 'utf8')).toBe('dummy-value')
})

it('does not overwrite without permission', async () => {
  const file = join(directory, 'export.json')
  await writeFile(file, 'old')
  await expect(writePrivateFile(file, 'dummy-value', false)).rejects.toMatchObject({code: 'EEXIST'})
  expect(await readFile(file, 'utf8')).toBe('old')
})

it('replaces a symlink without writing its target', async () => {
  const target = join(directory, 'target.json')
  const file = join(directory, 'export.json')
  await writeFile(target, 'untouched')
  await symlink(target, file)
  await writePrivateFile(file, 'dummy-value')
  expect(await readFile(target, 'utf8')).toBe('untouched')
  expect((await stat(file)).mode & 0o777).toBe(0o600)
})

describe('writePrivateFileSync', () => {
  it('creates an owner-only file', async () => {
    const file = join(directory, 'config.json')
    writePrivateFileSync(file, 'dummy-value')
    expect((await stat(file)).mode & 0o777).toBe(0o600)
    expect(await readFile(file, 'utf8')).toBe('dummy-value')
  })

  it('replaces an existing permissive inode before exposing new content', async () => {
    const file = join(directory, 'config.json')
    await writeFile(file, 'old', {mode: 0o644})
    const before = (await stat(file)).ino
    writePrivateFileSync(file, 'dummy-value')
    expect((await stat(file)).ino).not.toBe(before)
    expect((await stat(file)).mode & 0o777).toBe(0o600)
    expect(await readFile(file, 'utf8')).toBe('dummy-value')
  })

  it('does not overwrite without permission and leaves no temporary file', async () => {
    const file = join(directory, 'config.json')
    await writeFile(file, 'old')
    expect(() => writePrivateFileSync(file, 'dummy-value', false)).toThrow(expect.objectContaining({code: 'EEXIST'}))
    expect(await readFile(file, 'utf8')).toBe('old')
    expect(await readdir(directory)).toEqual(['config.json'])
  })

  it('removes the temporary file when the replace fails', async () => {
    const file = join(directory, 'config.json')
    // A directory in its place: the rename fails after the temporary file is written.
    await mkdir(file)
    expect(() => writePrivateFileSync(file, 'dummy-value')).toThrow()
    expect(await readdir(directory)).toEqual(['config.json'])
  })

  it('replaces a symlink without writing its target', async () => {
    const target = join(directory, 'target.json')
    const file = join(directory, 'config.json')
    await writeFile(target, 'untouched')
    await symlink(target, file)
    writePrivateFileSync(file, 'dummy-value')
    expect(await readFile(target, 'utf8')).toBe('untouched')
    expect((await stat(file)).mode & 0o777).toBe(0o600)
  })
})
