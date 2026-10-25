// Generates an OpenCLI document (https://opencli.org) from the oclif manifest.
//
// Why: a hand-written `opencli.json` drifted — it declared a version and a command list frozen
// months earlier. Here the source is the oclif manifest, which is always aligned with the real
// commands, so the file can no longer fall behind. The I/O part (reading the manifest, writing the
// file) lives in `scripts/generate-opencli.mjs`; here there is only the pure, testable transformation.

/** A command flag, as exposed by `oclif.manifest.json`. */
export interface OclifFlag {
  name: string
  type: 'boolean' | 'option'
  char?: string
  description?: string
  required?: boolean
  options?: string[]
  hidden?: boolean
  helpGroup?: string
}

/** A command's positional argument, from the oclif manifest. */
export interface OclifArg {
  name: string
  description?: string
  required?: boolean
  options?: string[]
  hidden?: boolean
}

/** A command resolved from the oclif manifest. */
export interface OclifCommand {
  id: string
  description?: string
  summary?: string
  aliases?: string[]
  hidden?: boolean
  flags?: Record<string, OclifFlag>
  args?: Record<string, OclifArg>
  examples?: Array<string | {command: string; description?: string}>
}

/** The oclif manifest (`oclif.manifest.json`). */
export interface OclifManifest {
  version: string
  commands: Record<string, OclifCommand>
}

export interface OpenCliArgument {
  name: string
  required?: boolean
  description?: string
  acceptedValues?: string[]
  hidden?: boolean
}

export interface OpenCliOption {
  name: string
  aliases?: string[]
  description?: string
  required?: boolean
  recursive?: boolean
  hidden?: boolean
  arguments?: OpenCliArgument[]
}

export interface OpenCliExitCode {
  code: number
  description?: string
}

export interface OpenCliCommand {
  name: string
  description?: string
  aliases?: string[]
  hidden?: boolean
  options?: OpenCliOption[]
  arguments?: OpenCliArgument[]
  exitCodes?: OpenCliExitCode[]
  examples?: string[]
  commands?: OpenCliCommand[]
}

export interface OpenCliInfo {
  title: string
  version: string
  summary?: string
  description?: string
  license?: {name?: string; identifier?: string; url?: string}
}

export interface OpenCliDocument {
  $schema: string
  opencli: string
  info: OpenCliInfo
  conventions: {groupOptions: boolean; optionSeparator: string}
  command: OpenCliCommand
}

export interface BuildOpenCliInput {
  manifest: OclifManifest
  bin: string
  description?: string
  summary?: string
  license?: {name?: string; identifier?: string; url?: string}
  /** Topic descriptions (containers without a command of their own), indexed by oclif id. */
  topics?: Record<string, {description?: string}>
}

// Version of the OpenCLI specification the document conforms to.
const OPENCLI_VERSION = '0.1'
const SCHEMA_URL = 'https://opencli.org/draft.json'
// oclif separates the id segments with ':' in the manifest (regardless of topicSeparator).
const ID_SEPARATOR = ':'

// Global options: injected by oclif on every command, so declared only once on the root command
// as `recursive`. They are structural invariants of the runtime, not commands that drift, which
// is why they live here as a constant and not in the manifest.
const GLOBAL_OPTIONS: OpenCliOption[] = [
  {name: '--help', aliases: ['-h'], description: 'Show help.', recursive: true},
  {name: '--version', aliases: ['-V'], description: 'Show CLI version.'},
  {name: '--json', description: 'Format output as json.', recursive: true},
]

// CLI exit codes: a stable convention, shared by all commands.
const EXIT_CODES: OpenCliExitCode[] = [
  {code: 0, description: 'Success'},
  {code: 1, description: 'Runtime or API error'},
  {code: 2, description: 'Invalid usage (bad flags/arguments)'},
]

const upper = (name: string): string => name.toUpperCase()

const mapArgument = (arg: OclifArg): OpenCliArgument => {
  const out: OpenCliArgument = {name: upper(arg.name)}
  if (arg.required) out.required = true
  if (arg.description) out.description = arg.description
  if (arg.options && arg.options.length > 0) out.acceptedValues = arg.options
  if (arg.hidden) out.hidden = true
  return out
}

const mapFlag = (flag: OclifFlag): OpenCliOption => {
  const out: OpenCliOption = {name: `--${flag.name}`}
  if (flag.char) out.aliases = [`-${flag.char}`]
  if (flag.description) out.description = flag.description
  if (flag.required) out.required = true
  if (flag.hidden) out.hidden = true
  if (flag.type === 'option') {
    const argument: OpenCliArgument = {name: upper(flag.name), required: true}
    if (flag.options && flag.options.length > 0) argument.acceptedValues = flag.options
    out.arguments = [argument]
  }
  return out
}

const substituteBin = (text: string, bin: string): string => text.replaceAll('<%= config.bin %>', bin)

const mapExamples = (
  examples: Array<string | {command: string; description?: string}> | undefined,
  bin: string,
): string[] | undefined => {
  if (!examples || examples.length === 0) return undefined
  return examples.map((ex) => substituteBin(typeof ex === 'string' ? ex : ex.command, bin))
}

// Applies the data of its oclif command to the command node. The global --json flag (helpGroup
// GLOBAL) is not repeated: it is already declared recursive on the root command.
const applyCommand = (node: OpenCliCommand, cmd: OclifCommand, bin: string): void => {
  node.description = cmd.summary ?? cmd.description
  if (cmd.hidden) node.hidden = true
  if (cmd.aliases && cmd.aliases.length > 0) node.aliases = cmd.aliases

  const flags = Object.values(cmd.flags ?? {}).filter((f) => f.helpGroup !== 'GLOBAL')
  if (flags.length > 0) node.options = flags.map((f) => mapFlag(f))

  const args = Object.values(cmd.args ?? {})
  if (args.length > 0) node.arguments = args.map((a) => mapArgument(a))

  const examples = mapExamples(cmd.examples, bin)
  if (examples) node.examples = examples
}

interface TreeNode {
  name: string
  path: string[]
  children: Map<string, TreeNode>
  command?: OclifCommand
}

const buildTree = (manifest: OclifManifest): TreeNode => {
  const root: TreeNode = {name: '', path: [], children: new Map()}
  for (const id of Object.keys(manifest.commands)) {
    const segments = id.split(ID_SEPARATOR)
    let node = root
    const path: string[] = []
    for (const segment of segments) {
      path.push(segment)
      let child = node.children.get(segment)
      if (!child) {
        child = {name: segment, path: [...path], children: new Map()}
        node.children.set(segment, child)
      }
      node = child
    }
    node.command = manifest.commands[id]
  }
  return root
}

const toOpenCliCommand = (
  node: TreeNode,
  bin: string,
  topics: Record<string, {description?: string}>,
): OpenCliCommand => {
  const out: OpenCliCommand = {name: node.name}
  if (node.command) {
    applyCommand(out, node.command, bin)
  } else {
    // Container topic: no command of its own, the description comes from package.json (if any).
    const topic = topics[node.path.join(ID_SEPARATOR)]
    if (topic?.description) out.description = topic.description
  }
  if (node.children.size > 0) {
    out.commands = [...node.children.values()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((child) => toOpenCliCommand(child, bin, topics))
  }
  return out
}

/** Builds the full OpenCLI document from the oclif manifest and the package.json metadata. */
export function buildOpenCliDocument(input: BuildOpenCliInput): OpenCliDocument {
  const {manifest, bin, topics = {}} = input

  const info: OpenCliInfo = {title: bin, version: manifest.version}
  if (input.summary) info.summary = input.summary
  if (input.description) info.description = input.description
  if (input.license && (input.license.name || input.license.identifier || input.license.url)) {
    info.license = input.license
  }

  const tree = buildTree(manifest)
  const command: OpenCliCommand = {
    name: bin,
    ...(input.description ? {description: input.description} : {}),
    options: GLOBAL_OPTIONS,
    exitCodes: EXIT_CODES,
    commands: [...tree.children.values()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((child) => toOpenCliCommand(child, bin, topics)),
  }

  return {
    $schema: SCHEMA_URL,
    opencli: OPENCLI_VERSION,
    info,
    conventions: {groupOptions: true, optionSeparator: ' '},
    command,
  }
}
