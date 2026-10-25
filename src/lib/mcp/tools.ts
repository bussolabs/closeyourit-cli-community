import type {CliApi, Envelope} from '../api'
import {ErrorCodes} from '../../errors/error-codes'
import {
  capContextPages,
  cleanList,
  normalizeKinds,
  buildPagesQuery,
  KNOWLEDGE_KINDS,
  KNOWLEDGE_STATUSES,
} from '../knowledge'
import {fetchKnowledgeContext, projectFromGitRemote} from '../knowledge-context'
import {LENGTH_LIMITS, tooLongMessage} from '../limits'
import {resolveNamedId, resolveProjectId} from '../lookup'

/**
 * The tools the MCP server offers on knowledge (CYCL-56).
 *
 * Each one is the call the matching command already makes, on the same HTTP client and with the
 * same token: whoever connects keeps the limits they have on the command line, without this layer
 * having to know them. Five read; the sixth, `kb_propose`, is the only one that writes and it
 * ALWAYS sends the page to review — there is no argument that can publish it.
 */

/** A wrong argument: the model that wrote it can correct itself and retry. */
export class McpToolInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'McpToolInputError'
  }
}

/** What a tool knows about the world around the call. */
export interface McpToolContext {
  api: CliApi
  /** Folder the server was launched from: that is where `kb_context` looks for the git remote. */
  cwd: string
  /** How long to wait for `git` before giving up on recognising the project. */
  timeoutMs: number
  /** Client name declared in the handshake, used to attribute a page proposal. */
  clientName?: string
}

/** Hints the client shows before invoking: they tell which tools only read and which write. */
export interface McpToolAnnotations {
  title: string
  readOnlyHint: boolean
  destructiveHint: boolean
  idempotentHint: boolean
  openWorldHint: boolean
}

export interface McpTool {
  name: string
  title: string
  description: string
  inputSchema: Record<string, unknown>
  annotations: McpToolAnnotations
  run(args: Record<string, unknown>, ctx: McpToolContext): Promise<unknown>
}

/** Attribution of a proposal when the client did not introduce itself and nobody declared one. */
const DEFAULT_AUTHOR_ORIGIN = 'mcp'

function optionalString(args: Record<string, unknown>, key: string): string | undefined {
  const raw = args[key]
  if (raw === undefined || raw === null) return undefined
  if (typeof raw !== 'string') throw new McpToolInputError(`"${key}" must be a string.`)
  const trimmed = raw.trim()
  return trimmed === '' ? undefined : trimmed
}

function requiredString(args: Record<string, unknown>, key: string): string {
  const value = optionalString(args, key)
  if (value === undefined) throw new McpToolInputError(`"${key}" is required and cannot be empty.`)
  return value
}

/**
 * A switch is on only if it really is `true`. No other shape counts as yes: a tool that read
 * `"false"` as on would do the opposite of what it was asked.
 */
function flag(args: Record<string, unknown>, key: string): boolean | undefined {
  return args[key] === true ? true : undefined
}

function optionalInteger(args: Record<string, unknown>, key: string, min: number): number | undefined {
  const raw = args[key]
  if (raw === undefined || raw === null) return undefined
  const value = typeof raw === 'string' ? Number(raw) : raw
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new McpToolInputError(`"${key}" must be a whole number.`)
  }

  if (value < min) throw new McpToolInputError(`"${key}" must be at least ${min}.`)
  return value
}

/** A repeatable field, accepted both as a single value and as a list (clients do both). */
function stringList(args: Record<string, unknown>, key: string): string[] {
  const raw = args[key]
  if (raw === undefined || raw === null) return []
  return cleanList((Array.isArray(raw) ? raw : [raw]).map((value) => String(value)))
}

/** The server envelope as is: the same data `cyi … --json` prints on the terminal. */
function payload(envelope: Envelope<unknown>): Record<string, unknown> {
  return envelope.meta === undefined ? {data: envelope.data} : {data: envelope.data, meta: envelope.meta}
}

const PROJECT_PROPERTY = {
  type: 'string',
  description: 'Project key (e.g. ACME) or UUID. Only projects your access already includes.',
}

const QUESTION_PROPERTY = {
  type: 'string',
  description: 'Keep only the related pages relevant to this question.',
}

export const MCP_TOOLS: McpTool[] = [
  {
    name: 'kb_search',
    title: 'Search knowledge pages',
    description:
      'Search the CloseYourIt knowledge base (semantic when available, title match otherwise) and return the matching pages. Only pages your access already includes are ever returned.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {type: 'string', description: 'What to look for, in plain words.'},
        project: PROJECT_PROPERTY,
        kind: {
          type: 'array',
          items: {type: 'string', enum: [...KNOWLEDGE_KINDS]},
          description: 'Keep only these page kinds.',
        },
        status: {
          type: 'string',
          enum: [...KNOWLEDGE_STATUSES],
          description:
            'Review state to search in. Omitted, only accepted pages; "all" also finds proposals waiting for review — use it before proposing a page, to see a duplicate that is not accepted yet.',
        },
        page: {type: 'integer', minimum: 1, description: 'Result page (default 1).'},
        per: {type: 'integer', minimum: 1, description: 'Page size.'},
        with_related: {type: 'boolean', description: 'Also return the pages each result links to.'},
      },
      required: ['query'],
    },
    annotations: {
      title: 'Search knowledge pages',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    async run(args, {api}) {
      const query = buildPagesQuery({
        kinds: normalizeKinds(stringList(args, 'kind')),
        page: optionalInteger(args, 'page', 1) ?? 1,
        per: optionalInteger(args, 'per', 1),
        project: optionalString(args, 'project'),
        q: requiredString(args, 'query'),
        related: flag(args, 'with_related'),
        status: optionalString(args, 'status'),
      })
      return payload(await api.get(`/cli/v1/knowledge/pages?${query}`))
    },
  },
  {
    name: 'kb_ask',
    title: 'Ask the knowledge base',
    description:
      'Ask a natural-language question; the CloseYourIt AI answers from the knowledge pages you can see and cites the ones it used. Takes a few seconds.',
    inputSchema: {
      type: 'object',
      properties: {question: {type: 'string', description: 'The question, in plain words.'}},
      required: ['question'],
    },
    annotations: {
      title: 'Ask the knowledge base',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    async run(args, {api}) {
      return payload(await api.post('/cli/v1/knowledge/ask', {question: requiredString(args, 'question')}))
    },
  },
  {
    name: 'kb_show',
    title: 'Read a knowledge page',
    description:
      'Read one knowledge page in full: metadata, markdown body and technical section, optionally with the pages to read next.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {type: 'string', description: 'Knowledge page id, as returned by kb_search or kb_context.'},
        related: {type: 'boolean', description: 'Also list the pages to read next.'},
        question: QUESTION_PROPERTY,
      },
      required: ['id'],
    },
    annotations: {
      title: 'Read a knowledge page',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    async run(args, {api}) {
      const id = requiredString(args, 'id')
      const query = new URLSearchParams()
      const question = optionalString(args, 'question')
      if (question) query.set('question', question)
      else if (flag(args, 'related')) query.set('related', '1')
      const suffix = query.toString() === '' ? '' : `?${query.toString()}`
      return payload(await api.get(`/cli/v1/knowledge/pages/${encodeURIComponent(id)}${suffix}`))
    },
  },
  {
    name: 'kb_related',
    title: 'Pages to read next',
    description:
      'List the pages to read next: the ones this page links to (and that link to it), plus close matches by meaning.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {type: 'string', description: 'Knowledge page id.'},
        question: QUESTION_PROPERTY,
        links_only: {type: 'boolean', description: 'Only pages linked with [[wiki links]], no close matches.'},
      },
      required: ['id'],
    },
    annotations: {
      title: 'Pages to read next',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    async run(args, {api}) {
      const id = requiredString(args, 'id')
      const query = new URLSearchParams()
      const question = optionalString(args, 'question')
      if (question) query.set('question', question)
      if (flag(args, 'links_only')) query.set('links_only', '1')
      const suffix = query.toString() === '' ? '' : `?${query.toString()}`
      return payload(await api.get(`/cli/v1/knowledge/pages/${encodeURIComponent(id)}/related${suffix}`))
    },
  },
  {
    name: 'kb_context',
    title: 'Knowledge context of this project',
    description:
      'The short list of pages whoever starts working on this project should already know. Without a project it is recognised from the git remote of the directory the server was started in; outside a project the list is simply empty.',
    inputSchema: {
      type: 'object',
      properties: {
        project: PROJECT_PROPERTY,
        limit: {type: 'integer', minimum: 1, description: 'How many pages at most (default 10).'},
      },
    },
    annotations: {
      title: 'Knowledge context of this project',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    async run(args, {api, cwd, timeoutMs}) {
      const limit = optionalInteger(args, 'limit', 1) ?? 10
      const project = optionalString(args, 'project') ?? (await projectFromGitRemote(api, cwd, timeoutMs))
      // Outside a project there is nothing to know: a normal state, not a failure (CYCL-55).
      if (project === undefined) return {data: {project: null, pages: []}}

      const answer = await fetchKnowledgeContext(api, project, limit)
      // The cap applies to the response, not only to the request: nothing guarantees the context
      // route honours `per`, and whoever asked for five pages must not get ten.
      return payload({...answer, data: capContextPages(answer.data, limit)})
    },
  },
  {
    name: 'kb_propose',
    title: 'Propose a knowledge page',
    description:
      'Propose a new knowledge page. It ALWAYS enters the review queue and waits for a person to accept it: it stays out of search, answers and related panels until then, and nothing this tool receives can publish it directly.',
    inputSchema: {
      type: 'object',
      properties: {
        title: {type: 'string', description: `Page title (max ${LENGTH_LIMITS.title} characters).`},
        body: {type: 'string', description: `Page body in markdown (max ${LENGTH_LIMITS.pageBody} characters).`},
        project: {
          type: 'array',
          items: {type: 'string'},
          description: 'Project keys or UUIDs the page belongs to. At least one project or group is required.',
        },
        group: {
          type: 'array',
          items: {type: 'string'},
          description: 'Group names or UUIDs the page belongs to.',
        },
        tag: {type: 'array', items: {type: 'string'}, description: 'Tags for the page.'},
        kind: {type: 'string', enum: [...KNOWLEDGE_KINDS], description: 'Page kind (default note).'},
        tech_spec: {
          type: 'string',
          description: `Technical section, kept separate from the body (max ${LENGTH_LIMITS.techSpec} characters).`,
        },
        review_note: {
          type: 'string',
          description: `One line for the reviewer on why the page is worth keeping (max ${LENGTH_LIMITS.reviewNote} characters).`,
        },
        author_origin: {
          type: 'string',
          description: 'Name of the assistant or skill that wrote the text; defaults to the connected client.',
        },
      },
      required: ['title', 'body'],
    },
    annotations: {
      title: 'Propose a knowledge page',
      readOnlyHint: false,
      // Nothing is overwritten or published: the proposal is appended to the review queue.
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    async run(args, {api, clientName}) {
      const title = requiredString(args, 'title')
      const body = requiredString(args, 'body')
      const techSpec = optionalString(args, 'tech_spec')
      const reviewNote = optionalString(args, 'review_note')

      const tooLong = tooLongMessage([
        {flag: 'title', value: title, max: LENGTH_LIMITS.title},
        {flag: 'body', value: body, max: LENGTH_LIMITS.pageBody},
        {flag: 'tech_spec', value: techSpec, max: LENGTH_LIMITS.techSpec},
        {flag: 'review_note', value: reviewNote, max: LENGTH_LIMITS.reviewNote},
      ])
      if (tooLong) throw new McpToolInputError(tooLong)

      const [primary, ...extraProjects] = stringList(args, 'project')
      const groupRefs = stringList(args, 'group')
      // A page without scope would be created by the server at organization level, i.e. visible
      // only to those with full access — invisible to whoever just proposed it.
      if (primary === undefined && groupRefs.length === 0) {
        throw new McpToolInputError('Name at least one "project" or "group": a knowledge page has to belong somewhere.')
      }

      const projectIds = await Promise.all(extraProjects.map((ref) => resolveProjectId(api, ref)))
      const groupIds = await Promise.all(
        groupRefs.map((ref) => resolveNamedId(api, '/cli/v1/groups', ref, ErrorCodes.Group.notFound, 'Group')),
      )
      const tags = stringList(args, 'tag')

      const res = await api.post('/cli/v1/knowledge/pages', {
        ...(primary !== undefined && {project: primary}),
        ...(projectIds.length > 0 && {project_ids: projectIds}),
        ...(groupIds.length > 0 && {group_ids: groupIds}),
        ...(tags.length > 0 && {tags}),
        title,
        kind: optionalString(args, 'kind') ?? 'note',
        body,
        tech_spec: techSpec,
        // Written here and never read from the arguments: it guarantees human review cannot be
        // skipped from this side, whatever the tool's caller asks.
        in_review: true,
        review_note: reviewNote,
        author_origin: optionalString(args, 'author_origin') ?? clientName ?? DEFAULT_AUTHOR_ORIGIN,
      })
      return payload(res)
    },
  },
]

export function findTool(name: string): McpTool | undefined {
  return MCP_TOOLS.find((tool) => tool.name === name)
}

/** The catalogue as `tools/list` wants it: everything except the code that runs the call. */
export function toolDefinitions(): Array<Omit<McpTool, 'run'>> {
  return MCP_TOOLS.map(({name, title, description, inputSchema, annotations}) => ({
    name,
    title,
    description,
    inputSchema,
    annotations,
  }))
}
