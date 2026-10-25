import {randomUUID} from 'node:crypto'
import {link, open, rename, unlink} from 'node:fs/promises'
import {basename, dirname, join} from 'node:path'

/** Replace the directory entry, never follow an existing symlink or reuse a permissive inode. */
export async function writePrivateFile(destination: string, content: string | Uint8Array, overwrite = true): Promise<void> {
  const temporary = join(dirname(destination), `.${basename(destination)}.${randomUUID()}.tmp`)
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
