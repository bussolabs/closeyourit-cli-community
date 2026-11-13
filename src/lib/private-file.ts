import {randomUUID} from 'node:crypto'
import {closeSync, fsyncSync, linkSync, openSync, renameSync, unlinkSync, writeFileSync} from 'node:fs'
import {link, open, rename, unlink} from 'node:fs/promises'
import {basename, dirname, join} from 'node:path'

function temporaryPath(destination: string): string {
  return join(dirname(destination), `.${basename(destination)}.${randomUUID()}.tmp`)
}

/** Replace the directory entry, never follow an existing symlink or reuse a permissive inode. */
export async function writePrivateFile(destination: string, content: string | Uint8Array, overwrite = true): Promise<void> {
  const temporary = temporaryPath(destination)
  const file = await open(temporary, 'wx', 0o600)
  try {
    await file.writeFile(content)
    await file.sync()
  } catch (error) {
    await unlink(temporary)
    throw error
  } finally {
    await file.close()
  }

  try {
    if (overwrite) await rename(temporary, destination)
    else await link(temporary, destination)
  } finally {
    await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error
    })
  }
}

/**
 * writePrivateFile for callers that do not wait: same guarantees, so a reader running at the same
 * time finds the old file or the new one, never an empty or half-written one.
 */
export function writePrivateFileSync(destination: string, content: string | Uint8Array, overwrite = true): void {
  const temporary = temporaryPath(destination)
  const file = openSync(temporary, 'wx', 0o600)
  try {
    writeFileSync(file, content)
    fsyncSync(file)
  } catch (error) {
    unlinkSync(temporary)
    throw error
  } finally {
    closeSync(file)
  }

  try {
    if (overwrite) renameSync(temporary, destination)
    else linkSync(temporary, destination)
  } finally {
    try {
      unlinkSync(temporary)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }
}
