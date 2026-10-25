// CYCL-56 — the JSON-RPC layer of the MCP server.
//
// On stdio the protocol is JSON-RPC 2.0 with one message per line: what is read from there is
// text coming from a foreign process, so every malformed shape must have an expected answer
// instead of bringing the server down — a server that dies on the first bad line leaves
// the assistant with no knowledge and no explanation.

import {describe, expect, it} from 'vitest'
import {JSONRPC_VERSION, RPC_ERROR, parseLine, rpcFailure, rpcResult} from '../src/lib/mcp/protocol'

describe('the JSON-RPC envelopes', () => {
  it('marks every response with the protocol version', () => {
    expect(rpcResult(1, {ok: true})).toEqual({jsonrpc: JSONRPC_VERSION, id: 1, result: {ok: true}})
  })

  it('carries code and message in an error, and the details only when present', () => {
    expect(rpcFailure(7, RPC_ERROR.methodNotFound, 'Unknown method: pippo')).toEqual({
      jsonrpc: JSONRPC_VERSION,
      id: 7,
      error: {code: RPC_ERROR.methodNotFound, message: 'Unknown method: pippo'},
    })
    expect(rpcFailure(null, RPC_ERROR.parse, 'rotto', {line: 1}).error).toEqual({
      code: RPC_ERROR.parse,
      message: 'rotto',
      data: {line: 1},
    })
  })
})

describe('reading a line', () => {
  it('recognises a request with its parameters', () => {
    const parsed = parseLine('{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"kb_search"}}')
    expect(parsed).toEqual({kind: 'request', request: {id: 3, method: 'tools/call', params: {name: 'kb_search'}}})
  })

  it('accepts a textual id as the client sends it', () => {
    const parsed = parseLine('{"jsonrpc":"2.0","id":"abc","method":"ping"}')
    expect(parsed).toEqual({kind: 'request', request: {id: 'abc', method: 'ping', params: {}}})
  })

  it('treats a message without id as a notification, which wants no answer', () => {
    const parsed = parseLine('{"jsonrpc":"2.0","method":"notifications/initialized"}')
    expect(parsed).toEqual({kind: 'request', request: {id: undefined, method: 'notifications/initialized', params: {}}})
  })

  it('treats an explicitly null id as a notification too', () => {
    const parsed = parseLine('{"jsonrpc":"2.0","id":null,"method":"ping"}')
    expect(parsed).toEqual({kind: 'request', request: {id: undefined, method: 'ping', params: {}}})
  })

  it('ignores empty lines, which newline framing produces by itself', () => {
    expect(parseLine('')).toEqual({kind: 'ignore'})
    expect(parseLine('   \r')).toEqual({kind: 'ignore'})
  })

  it('answers with a parse error when the line is not JSON', () => {
    const parsed = parseLine('{questo non è json')
    expect(parsed).toEqual({
      kind: 'response',
      response: {jsonrpc: JSONRPC_VERSION, id: null, error: {code: RPC_ERROR.parse, message: expect.any(String)}},
    })
  })

  it('rejects a message that is not an object', () => {
    for (const line of ['42', '"ciao"', 'null', '[1,2]']) {
      const parsed = parseLine(line)
      expect(parsed).toMatchObject({kind: 'response', response: {error: {code: RPC_ERROR.invalidRequest}}})
    }
  })

  it('rejects an object without a method, naming the id if it has one', () => {
    const parsed = parseLine('{"jsonrpc":"2.0","id":9}')
    expect(parsed).toMatchObject({kind: 'response', response: {id: 9, error: {code: RPC_ERROR.invalidRequest}}})
  })

  it('rejects an object without method and without id quoting a null id', () => {
    expect(parseLine('{"jsonrpc":"2.0"}')).toMatchObject({
      kind: 'response',
      response: {id: null, error: {code: RPC_ERROR.invalidRequest}},
    })
  })

  it('rejects a method that is not text', () => {
    expect(parseLine('{"jsonrpc":"2.0","id":1,"method":5}')).toMatchObject({
      kind: 'response',
      response: {error: {code: RPC_ERROR.invalidRequest}},
    })
  })

  it('stays silent on a client response: answering a response is a loop', () => {
    expect(parseLine('{"jsonrpc":"2.0","id":1,"result":{}}')).toEqual({kind: 'ignore'})
    expect(parseLine('{"jsonrpc":"2.0","id":1,"error":{"code":-1,"message":"x"}}')).toEqual({kind: 'ignore'})
  })

  it('reduces parameters that are not an object to an empty object', () => {
    // MCP methods take named parameters only: a positional list has nowhere to go.
    expect(parseLine('{"jsonrpc":"2.0","id":1,"method":"ping","params":[1,2]}')).toEqual({
      kind: 'request',
      request: {id: 1, method: 'ping', params: {}},
    })
    expect(parseLine('{"jsonrpc":"2.0","id":1,"method":"ping","params":null}')).toEqual({
      kind: 'request',
      request: {id: 1, method: 'ping', params: {}},
    })
  })
})
