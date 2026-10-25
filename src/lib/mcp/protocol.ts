/**
 * The JSON-RPC 2.0 layer of the MCP server (CYCL-56).
 *
 * On the stdio transport the Model Context Protocol wraps nothing: one JSON message per line, no
 * newlines inside, and nothing else on standard output. What comes in arrives from a foreign
 * process, so every malformed shape has an expected answer here: a server that crashes on the
 * first bad line would leave the assistant with no knowledge and no explanation.
 */

export const JSONRPC_VERSION = '2.0'

export type JsonRpcId = string | number

/** An already-cleaned request: an absent `id` means notification, i.e. no answer expected. */
export interface JsonRpcRequest {
  id?: JsonRpcId
  method: string
  params: Record<string, unknown>
}

export interface JsonRpcErrorBody {
  code: number
  message: string
  data?: unknown
}

export interface JsonRpcResponse {
  jsonrpc: string
  id: JsonRpcId | null
  result?: unknown
  error?: JsonRpcErrorBody
}

/** The standard JSON-RPC 2.0 codes, the only ones the base protocol assigns. */
export const RPC_ERROR = {
  parse: -32_700,
  invalidRequest: -32_600,
  methodNotFound: -32_601,
  invalidParams: -32_602,
  internal: -32_603,
} as const

export function rpcResult(id: JsonRpcId | null, result: unknown): JsonRpcResponse {
  return {jsonrpc: JSONRPC_VERSION, id, result}
}

export function rpcFailure(id: JsonRpcId | null, code: number, message: string, data?: unknown): JsonRpcResponse {
  return {jsonrpc: JSONRPC_VERSION, id, error: {code, message, ...(data === undefined ? {} : {data})}}
}

/**
 * What to do with a line read: serve it, send back a ready-made error, or stay silent.
 * The third case is not a fallback: an empty line and a client response get no reply.
 */
export type ParsedLine =
  | {kind: 'request'; request: JsonRpcRequest}
  | {kind: 'response'; response: JsonRpcResponse}
  | {kind: 'ignore'}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** The id only in the shape JSON-RPC recognises; `null` (like its absence) means notification. */
function readId(value: unknown): JsonRpcId | undefined {
  if (typeof value === 'string') return value
  if (typeof value === 'number') return value
  return undefined
}

export function parseLine(line: string): ParsedLine {
  const trimmed = line.trim()
  if (trimmed === '') return {kind: 'ignore'}

  let message: unknown
  try {
    message = JSON.parse(trimmed)
  } catch {
    // Without a readable message there is not even an id to quote: JSON-RPC prescribes `null`.
    return {kind: 'response', response: rpcFailure(null, RPC_ERROR.parse, 'Invalid JSON message')}
  }

  if (!isRecord(message)) {
    return {kind: 'response', response: rpcFailure(null, RPC_ERROR.invalidRequest, 'Expected a JSON-RPC object')}
  }

  // An envelope with `result`/`error` is the client's response to a request of ours. We send none,
  // but if one arrived it must not be answered: replying to a response is how loops start.
  if (message.method === undefined && ('result' in message || 'error' in message)) return {kind: 'ignore'}

  const id = readId(message.id)
  if (typeof message.method !== 'string' || message.method === '') {
    return {kind: 'response', response: rpcFailure(id ?? null, RPC_ERROR.invalidRequest, 'Missing method name')}
  }

  // MCP methods take named parameters only: a positional list would have nowhere to go.
  const params = isRecord(message.params) ? message.params : {}
  return {kind: 'request', request: {id, method: message.method, params}}
}
