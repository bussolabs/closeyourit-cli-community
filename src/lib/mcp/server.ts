import type {Readable, Writable} from 'node:stream'
import {ApiRequestError, type CliApi} from '../api'
import {
  type JsonRpcId,
  type JsonRpcRequest,
  type JsonRpcResponse,
  RPC_ERROR,
  parseLine,
  rpcFailure,
  rpcResult,
} from './protocol'
import {type McpToolContext, findTool, toolDefinitions} from './tools'

/**
 * The Model Context Protocol server of the CloseYourIt knowledge (CYCL-56).
 *
 * It speaks the handshake revision (`initialize`), the one clients can speak today. It does not
 * expose `server/discover`: a client that can do both eras tries the new one, gets an error it
 * does not recognise as modern and falls back to the handshake — which is exactly the path that
 * works here.
 */

export const SERVER_NAME = 'closeyourit'
const SERVER_TITLE = 'CloseYourIt knowledge'

/**
 * The protocol revisions this server serves, newest first. They all treat a tools-only server the
 * same way: what changes between them are things that do not exist here (authorization,
 * elicitation, resources), so the requested version can be confirmed as is.
 */
export const PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'] as const
export const DEFAULT_PROTOCOL_VERSION = PROTOCOL_VERSIONS[0]

/** How long to wait for `git` to recognise the folder's project, when not told otherwise. */
const DEFAULT_GIT_TIMEOUT_MS = 5000

/**
 * How long the calls still in flight are granted when the channel closes, before aborting them.
 *
 * Closing standard input IS the way an MCP client asks the server to exit, and right after it
 * moves on to signals. A response arriving within this window still makes it out in time;
 * beyond it, whoever was waiting is gone — and staying on hold would keep the subprocess alive
 * until the request returns, i.e. potentially until the signal that kills it.
 */
const DEFAULT_SHUTDOWN_GRACE_MS = 2000

/** What the client reads before using the tools: what this knowledge is for. */
const INSTRUCTIONS = [
  'The CloseYourIt knowledge base of this organization: decisions taken, guides and notes that the code and the git history do not say.',
  'Search it (kb_search) or ask it (kb_ask) before answering how something is done here; kb_context lists what to know about the project of the current directory.',
  'New knowledge goes in with kb_propose: it always waits for a person to accept it, so nothing written from here is published on its own.',
].join(' ')

/** A connection's state: what the tools need plus who introduced themselves. */
export interface McpSession extends McpToolContext {
  version: string
  /** Aborts the calls still in flight when the shutdown window has expired. */
  abort: AbortController
  shutdownGraceMs: number
}

export function createSession(opts: {
  api: CliApi
  version: string
  cwd?: string
  timeoutMs?: number
  shutdownGraceMs?: number
}): McpSession {
  const abort = new AbortController()
  // On the client, not on every call: this way the abort also reaches the by-name lookups a tool
  // carries along, without them having to know anything about it.
  opts.api.signal = abort.signal
  return {
    api: opts.api,
    version: opts.version,
    cwd: opts.cwd ?? process.cwd(),
    timeoutMs: opts.timeoutMs ?? DEFAULT_GIT_TIMEOUT_MS,
    shutdownGraceMs: opts.shutdownGraceMs ?? DEFAULT_SHUTDOWN_GRACE_MS,
    abort,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * The text the model reads when a tool did not succeed. A server rejection carries its code, as it
 * does in the terminal: that is what tells "you have no access" from "you are not logged in"
 * without having to guess.
 */
function toolErrorText(error: unknown): string {
  if (error instanceof ApiRequestError) return `${error.code}: ${error.message}`
  return String((error as Error).message)
}

function initialize(params: Record<string, unknown>, session: McpSession): Record<string, unknown> {
  const clientInfo = params.clientInfo as {name?: unknown} | undefined
  const clientName = typeof clientInfo?.name === 'string' ? clientInfo.name.trim() : ''
  if (clientName !== '') session.clientName = clientName

  const requested = params.protocolVersion
  const known = typeof requested === 'string' && (PROTOCOL_VERSIONS as readonly string[]).includes(requested)

  return {
    protocolVersion: known ? (requested as string) : DEFAULT_PROTOCOL_VERSION,
    capabilities: {tools: {}},
    serverInfo: {name: SERVER_NAME, title: SERVER_TITLE, version: session.version},
    instructions: INSTRUCTIONS,
  }
}

async function callTool(
  id: JsonRpcId,
  params: Record<string, unknown>,
  session: McpSession,
): Promise<JsonRpcResponse> {
  const name = typeof params.name === 'string' ? params.name : ''
  const tool = findTool(name)
  // A tool that does not exist is a protocol error: there is no call whose outcome to report, and
  // the client must notice it the way it notices a wrong method.
  if (!tool) {
    return rpcFailure(id, RPC_ERROR.invalidParams, `Unknown tool: ${name}. Call tools/list for the tools this server offers.`)
  }

  const args = params.arguments
  try {
    const result = await tool.run(isRecord(args) ? args : {}, session)
    return rpcResult(id, {content: [{type: 'text', text: JSON.stringify(result, null, 2)}], isError: false})
  } catch (error) {
    // A wrong argument or a server rejection are the tool's OUTCOME, not a protocol failure: this
    // way the reason reaches the model, which can correct itself instead of stopping.
    return rpcResult(id, {content: [{type: 'text', text: toolErrorText(error)}], isError: true})
  }
}

export async function handleRequest(
  request: JsonRpcRequest,
  session: McpSession,
): Promise<JsonRpcResponse | undefined> {
  const {id, method, params} = request
  // A notification has nobody to answer: whatever it asks, the only correct reply is none.
  if (id === undefined) return undefined

  switch (method) {
    case 'initialize': {
      return rpcResult(id, initialize(params, session))
    }

    case 'ping': {
      return rpcResult(id, {})
    }

    case 'tools/list': {
      return rpcResult(id, {tools: toolDefinitions()})
    }

    case 'tools/call': {
      return callTool(id, params, session)
    }

    default: {
      return rpcFailure(id, RPC_ERROR.methodNotFound, `Unknown method: ${method}`)
    }
  }
}

/**
 * Serves the protocol over two streams: one JSON message per line in, one JSON message per line
 * out and nothing else. The promise settles when the input stream ends — or when either of the
 * two breaks, which is how a client leaves.
 */
export function serveStdio(input: Readable, output: Writable, session: McpSession): Promise<void> {
  return new Promise((resolve) => {
    const pending = new Set<Promise<void>>()
    let buffer = ''
    let closed = false

    // A single write per message, newline included: two writes could interleave with those of a
    // request served in parallel and break a line in half.
    //
    // If writing fails there is no channel to say so, and trying would be worse: the error would
    // escape from here, climb up to the handler that answers failures — which writes too — and
    // end up as an unhandled rejection, i.e. a dead process instead of a server that closes.
    const send = (response: JsonRpcResponse): void => {
      try {
        output.write(`${JSON.stringify(response)}\n`)
      } catch {
        void finish()
      }
    }

    const drain = async (): Promise<void> => {
      while (pending.size > 0) {
        // eslint-disable-next-line no-await-in-loop
        await Promise.all([...pending])
      }
    }

    // The timer must not keep the process alive on its own: if nothing else is left to wait for,
    // exiting right away is the right thing, and the delay only matters while a call is in flight.
    const grace = (): Promise<void> =>
      new Promise((done) => {
        setTimeout(done, session.shutdownGraceMs).unref()
      })

    const finish = async (): Promise<void> => {
      if (closed) return
      closed = true
      // Whoever closed the channel no longer waits for any answer: the calls in flight get their
      // window to finish and then are aborted. Without really aborting them, the open connection
      // would keep the event loop alive — and with it a subprocess the client already considers
      // closed — regardless of when this promise resolves.
      await Promise.race([drain(), grace()])
      session.abort.abort()
      await drain()
      resolve()
    }

    const serve = (line: string): void => {
      const parsed = parseLine(line)
      if (parsed.kind === 'ignore') return
      if (parsed.kind === 'response') {
        send(parsed.response)
        return
      }

      const {request} = parsed
      const task = handleRequest(request, session)
        .then((response) => {
          if (response) send(response)
        })
        .catch((error: unknown) => {
          // A failure here is ours, not the client's: it is declared on the channel and the server stays up.
          if (request.id !== undefined) send(rpcFailure(request.id, RPC_ERROR.internal, toolErrorText(error)))
        })
        .finally(() => {
          pending.delete(task)
        })
      pending.add(task)
    }

    input.setEncoding('utf8')
    input.on('data', (chunk: string) => {
      buffer += chunk
      let cut = buffer.indexOf('\n')
      while (cut !== -1) {
        serve(buffer.slice(0, cut))
        buffer = buffer.slice(cut + 1)
        cut = buffer.indexOf('\n')
      }
    })
    input.on('end', () => {
      // The last line may arrive without a newline: whoever closes right after writing it must not
      // lose the request they just made.
      serve(buffer)
      buffer = ''
      void finish()
    })
    // A stream that breaks is not a failure to report: the client has left (stdin closed, output
    // interrupted) and all the server can do is close cleanly.
    input.on('error', () => void finish())
    output.on('error', () => void finish())
  })
}
