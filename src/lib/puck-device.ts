import {execFile} from 'node:child_process'
import {readFile, readdir, realpath, stat} from 'node:fs/promises'
import {isAbsolute, relative, resolve, sep} from 'node:path'

/** A request a Puck sends to this computer (CYRA-1029). */
export interface DeviceCall {
  id: string
  tool: 'list_files' | 'read_file' | 'run_command'
  value: string
  puck: string
}

export interface Allowlist {
  dirs: string[]
  commands: string[]
}

const MAX_FILE_BYTES = 200 * 1024
const MAX_OUTPUT = 24 * 1024

/** The real path of a requested file, or undefined when it falls outside every allowed folder. */
export async function insideAllowed(value: string, dirs: string[]): Promise<string | undefined> {
  let target: string
  try {
    target = await realpath(resolve(dirs[0] ?? '.', value))
  } catch {
    return undefined
  }
  for (const dir of dirs) {
    const root = await realpath(dir).catch(() => undefined)
    if (!root) continue
    const rel = relative(root, target)
    if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel) && !rel.split(sep).includes('..'))) return target
  }
  return undefined
}

/** Why a call cannot run here, before the person is even asked; undefined when it may be asked. */
export async function refusal(call: DeviceCall, allow: Allowlist): Promise<string | undefined> {
  if (call.tool === 'run_command') return allow.commands.includes(call.value) ? undefined : 'This command is not on the allowed list.'
  return (await insideAllowed(call.value, allow.dirs)) ? undefined : 'This path is outside the allowed folders.'
}

/** Runs an approved call and returns its text output. */
export async function perform(call: DeviceCall, allow: Allowlist): Promise<string> {
  if (call.tool === 'run_command') return runCommand(call.value)
  const target = (await insideAllowed(call.value, allow.dirs)) as string
  if (call.tool === 'list_files') {
    const entries = await readdir(target, {withFileTypes: true})
    return entries.map((entry) => (entry.isDirectory() ? `${entry.name}/` : entry.name)).sort().join('\n')
  }
  const info = await stat(target)
  if (info.size > MAX_FILE_BYTES) throw new Error(`The file is larger than ${MAX_FILE_BYTES} bytes.`)
  return readFile(target, 'utf8')
}

function runCommand(command: string): Promise<string> {
  return new Promise((done) => {
    execFile('/bin/sh', ['-c', command], {timeout: 60_000, maxBuffer: 1024 * 1024}, (error, stdout, stderr) => {
      const text = `${stdout}${stderr}${error ? `\n(exit: ${error.code ?? error.signal})` : ''}`
      done(text.slice(0, MAX_OUTPUT))
    })
  })
}
