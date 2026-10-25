import { Plugin } from '@oclif/core'
import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

// Use the same manifest generator as `oclif manifest`, without its release tooling.
const root = fileURLToPath(new URL('../', import.meta.url))
const plugin = new Plugin({
  root,
  type: 'core',
  errorOnManifestCreate: true,
  ignoreManifest: true,
  respectNoCacheDefault: true,
})
await plugin.load()
if (!plugin.valid) throw new Error('Cannot generate a manifest for an invalid plugin')
await writeFile(new URL('../oclif.manifest.json', import.meta.url), JSON.stringify(plugin.manifest, null, 2))
