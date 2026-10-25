// Regenerates opencli.json from the oclif manifest. Runs in `prepack`, after `oclif manifest`,
// so the published file always describes the CLI's real commands and can no longer drift.
//
// The transformation lives in src/lib/opencli.ts (compiled into dist/, tested by vitest); this
// file only does the I/O: read manifest + package.json, write the file.
import {readFileSync, writeFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {buildOpenCliDocument} from '../dist/lib/opencli.js'

const root = (name) => fileURLToPath(new URL(`../${name}`, import.meta.url))
const readJson = (name) => JSON.parse(readFileSync(root(name), 'utf8'))

const manifest = readJson('oclif.manifest.json')
const pkg = readJson('package.json')

const bin = pkg.oclif?.bin ?? pkg.name
const license = pkg.license ? {name: pkg.license, identifier: pkg.license} : undefined

const doc = buildOpenCliDocument({
  manifest,
  bin,
  description: pkg.description,
  license,
  topics: pkg.oclif?.topics ?? {},
})

writeFileSync(root('opencli.json'), `${JSON.stringify(doc, null, 2)}\n`, 'utf8')

// Count of executable commands (leaves), only for the prepack log.
const leaves = (command) => {
  const children = command.commands ?? []
  if (children.length === 0) return 1
  return children.reduce((n, child) => n + leaves(child), 0)
}

console.log(`opencli.json: v${doc.info.version}, ${leaves(doc.command)} commands`)
