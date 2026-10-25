import {describe, expect, it} from 'vitest'
import {buildOpenCliDocument, type OclifManifest, type OpenCliCommand} from '../src/lib/opencli'

// Reduced but representative oclif manifest: it covers deep nesting, the domains the hand-written file
// had lost (eligibility, matrix, knowledge, personal, lease) and every shape of flag/arg/example.
const manifest: OclifManifest = {
  version: '9.9.9',
  commands: {
    login: {
      id: 'login',
      description: 'Authenticate via the device flow.',
      aliases: ['signin'],
      flags: {
        'api-url': {
          name: 'api-url',
          type: 'option',
          description: 'Backend base URL.',
        },
      },
      examples: ['<%= config.bin %> login', '<%= config.bin %> login --api-url https://staging.closeyour.it'],
    },
    run: {
      id: 'run',
      description: 'Hidden internal command.',
      hidden: true,
    },
    'tickets:list': {
      id: 'tickets:list',
      summary: 'List tickets.',
      description: 'List tickets for a project (long form).',
      flags: {
        json: {name: 'json', type: 'boolean', description: 'Format output as json.', helpGroup: 'GLOBAL'},
        project: {name: 'project', type: 'option', char: 'p', description: 'Project id or key', required: true},
        'agent-eligibility': {
          name: 'agent-eligibility',
          type: 'option',
          description: 'Filter by agent eligibility',
          options: ['pending', 'allowed', 'blocked'],
        },
      },
      examples: ['<%= config.bin %> tickets list --project acme-api', '<%= config.bin %> tickets list --json'],
    },
    'tickets:show': {
      id: 'tickets:show',
      description: 'Show a single ticket in full.',
      args: {
        id: {name: 'id', description: 'Ticket id or code', required: true},
      },
      examples: [{command: '<%= config.bin %> tickets show DRFL-3', description: 'By code'}],
    },
    'groups:list': {
      id: 'groups:list',
      description: 'List groups.',
      flags: {
        all: {name: 'all', type: 'boolean', char: 'a', description: 'Include archived'},
        secret: {name: 'secret', type: 'boolean', description: 'Internal', hidden: true},
      },
    },
    'matrix:cells:list': {
      id: 'matrix:cells:list',
      description: 'List matrix cells.',
      args: {
        format: {name: 'format', description: 'Output format', options: ['table', 'wide']},
        internal: {name: 'internal', description: 'Reserved', hidden: true},
      },
    },
    'eligibility:show': {id: 'eligibility:show', description: 'Show eligibility.'},
    'knowledge:ask': {id: 'knowledge:ask', description: 'Ask the knowledge base.'},
    'personal:set': {id: 'personal:set', description: 'Set a personal secret.'},
    'lease:claim': {id: 'lease:claim', description: 'Claim a ticket lease.'},
  },
}

const topics = {
  tickets: {description: 'Tickets: list, show, create'},
  matrix: {description: 'Product feature matrix'},
}

const build = () =>
  buildOpenCliDocument({
    manifest,
    bin: 'closeyourit',
    description: 'Manage CloseYourIt from the CLI.',
    summary: 'CLI for CloseYourIt',
    license: {name: 'MIT', identifier: 'MIT'},
    topics,
  })

// Walks the command tree following the segments of the oclif id (separated by ':').
const findNode = (doc: ReturnType<typeof build>, id: string): OpenCliCommand | undefined => {
  let node: OpenCliCommand | undefined = doc.command
  for (const seg of id.split(':')) {
    node = (node?.commands ?? []).find((c) => c.name === seg)
    if (!node) return undefined
  }
  return node
}

describe('buildOpenCliDocument', () => {
  it('Scenario 2: the declared version is the real one, not a hand-frozen value', () => {
    const doc = build()
    expect(doc.info.version).toBe('9.9.9')
  })

  it('Scenario 1: every manifest command appears in the published document', () => {
    const doc = build()
    for (const id of Object.keys(manifest.commands)) {
      const node = findNode(doc, id)
      const cmd = manifest.commands[id]
      expect(node, `manca il comando ${id}`).toBeDefined()
      expect(node?.description).toBe(cmd.summary ?? cmd.description)
    }
  })

  it('includes the domains the hand-written file had lost', () => {
    const doc = build()
    for (const id of ['eligibility:show', 'matrix:cells:list', 'knowledge:ask', 'personal:set', 'lease:claim']) {
      expect(findNode(doc, id), `manca ${id}`).toBeDefined()
    }
  })

  it('produces the shape required by the OpenCLI schema: opencli + info + root command', () => {
    const doc = build()
    expect(doc.$schema).toBe('https://opencli.org/draft.json')
    expect(typeof doc.opencli).toBe('string')
    expect(doc.command.name).toBe('closeyourit')
    expect(doc.info.title).toBe('closeyourit')
    // The old shape with a top-level `commands` array is no longer produced.
    expect((doc as Record<string, unknown>).commands).toBeUndefined()
  })

  it('maps info from package.json (title, description, summary, license)', () => {
    const doc = build()
    expect(doc.info.description).toBe('Manage CloseYourIt from the CLI.')
    expect(doc.info.summary).toBe('CLI for CloseYourIt')
    expect(doc.info.license).toEqual({name: 'MIT', identifier: 'MIT'})
  })

  it('omits the optional info fields when not provided', () => {
    const doc = buildOpenCliDocument({manifest, bin: 'closeyourit'})
    expect(doc.info.description).toBeUndefined()
    expect(doc.info.summary).toBeUndefined()
    expect(doc.info.license).toBeUndefined()
  })

  it('includes the license even when it has only the SPDX identifier', () => {
    const doc = buildOpenCliDocument({manifest, bin: 'closeyourit', license: {identifier: 'MIT'}})
    expect(doc.info.license).toEqual({identifier: 'MIT'})
  })

  it('reports the aliases of a command', () => {
    const doc = build()
    expect(findNode(doc, 'login')?.aliases).toEqual(['signin'])
  })

  it('declares the global options (--help, --version, --json) only once, on the root command', () => {
    const doc = build()
    const names = (doc.command.options ?? []).map((o) => o.name)
    expect(names).toContain('--help')
    expect(names).toContain('--version')
    expect(names).toContain('--json')
    const json = (doc.command.options ?? []).find((o) => o.name === '--json')
    expect(json?.recursive).toBe(true)
  })

  it('does not repeat the global --json flag in the options of each command', () => {
    const doc = build()
    const list = findNode(doc, 'tickets:list')
    const names = (list?.options ?? []).map((o) => o.name)
    expect(names).not.toContain('--json')
    expect(names).toContain('--project')
  })

  it('maps a flag with a value to an option with an argument and a short alias', () => {
    const doc = build()
    const list = findNode(doc, 'tickets:list')
    const project = (list?.options ?? []).find((o) => o.name === '--project')
    expect(project?.aliases).toEqual(['-p'])
    expect(project?.required).toBe(true)
    expect(project?.arguments).toEqual([{name: 'PROJECT', required: true}])
  })

  it('reports the allowed values of an enum flag as acceptedValues', () => {
    const doc = build()
    const list = findNode(doc, 'tickets:list')
    const opt = (list?.options ?? []).find((o) => o.name === '--agent-eligibility')
    expect(opt?.arguments?.[0].acceptedValues).toEqual(['pending', 'allowed', 'blocked'])
  })

  it('maps a boolean flag without arguments and hides a hidden one', () => {
    const doc = build()
    const groups = findNode(doc, 'groups:list')
    const all = (groups?.options ?? []).find((o) => o.name === '--all')
    expect(all?.arguments).toBeUndefined()
    expect(all?.aliases).toEqual(['-a'])
    const secret = (groups?.options ?? []).find((o) => o.name === '--secret')
    expect(secret?.hidden).toBe(true)
  })

  it('maps positional arguments with an uppercase name, requiredness and description', () => {
    const doc = build()
    const show = findNode(doc, 'tickets:show')
    expect(show?.arguments).toEqual([{name: 'ID', required: true, description: 'Ticket id or code'}])
  })

  it('maps allowed values and visibility on positional arguments', () => {
    const doc = build()
    const cells = findNode(doc, 'matrix:cells:list')
    const format = (cells?.arguments ?? []).find((a) => a.name === 'FORMAT')
    expect(format?.acceptedValues).toEqual(['table', 'wide'])
    const internal = (cells?.arguments ?? []).find((a) => a.name === 'INTERNAL')
    expect(internal?.hidden).toBe(true)
  })

  it('substitutes the config.bin template in the examples, in object form too', () => {
    const doc = build()
    const login = findNode(doc, 'login')
    expect(login?.examples).toEqual(['closeyourit login', 'closeyourit login --api-url https://staging.closeyour.it'])
    const show = findNode(doc, 'tickets:show')
    expect(show?.examples).toEqual(['closeyourit tickets show DRFL-3'])
  })

  it('prefers the command summary over the long description', () => {
    const doc = build()
    expect(findNode(doc, 'tickets:list')?.description).toBe('List tickets.')
  })

  it('marks hidden commands as hidden', () => {
    const doc = build()
    expect(findNode(doc, 'run')?.hidden).toBe(true)
  })

  it('assigns topics their description from package.json, and none if absent', () => {
    const doc = build()
    const tickets = (doc.command.commands ?? []).find((c) => c.name === 'tickets')
    expect(tickets?.description).toBe('Tickets: list, show, create')
    const eligibility = (doc.command.commands ?? []).find((c) => c.name === 'eligibility')
    expect(eligibility?.description).toBeUndefined()
  })

  it('sorts the commands deterministically (alphabetically)', () => {
    const doc = build()
    const names = (doc.command.commands ?? []).map((c) => c.name)
    expect(names).toEqual([...names].sort())
  })
})
