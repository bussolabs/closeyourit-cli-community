// CYCL-56 — `cyi mcp`: knowledge reachable through the standard procedure, not only
// from the assistant we wrote tailor-made instructions for.
//
// The command speaks Model Context Protocol on standard input/output: whoever connects does the handshake,
// asks for the tool list and invokes them. Everything that comes out of stdout must be a
// protocol message — one extra courtesy line and the client disconnects.

import {Readable, Writable} from 'node:stream'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import {apiMock, resetApiMock} from './helpers/api-mock'
import {apiError, envelope, run} from './helpers/command'

vi.mock('../src/lib/api', async (io) => {
  const actual = await io<typeof import('../src/lib/api')>()
  const {apiMock} = await import('./helpers/api-mock')
  return {...actual, CliApi: vi.fn(function () { return apiMock })}
})
vi.mock('../src/lib/config', async (io) => {
  const actual = await io<typeof import('../src/lib/config')>()
  return {...actual, loadConfig: vi.fn(() => ({apiUrl: 'https://api.test', token: 'tok_test'}))}
})
vi.mock('../src/lib/git', () => ({parseRepoSlug: vi.fn(), repoSlug: vi.fn(async () => undefined)}))

import type {CliApi} from '../src/lib/api'
import Mcp from '../src/commands/mcp'
import {
  DEFAULT_PROTOCOL_VERSION,
  PROTOCOL_VERSIONS,
  SERVER_NAME,
  createSession,
  serveStdio,
} from '../src/lib/mcp/server'
import {RPC_ERROR} from '../src/lib/mcp/protocol'

interface Message {
  id?: number | string | null
  result?: Record<string, unknown>
  error?: {code: number; message: string}
}

function session() {
  return createSession({api: apiMock as unknown as CliApi, version: '9.9.9', cwd: '/tmp/repo'})
}

/** Sends the given lines to the server and returns the messages it wrote, in order. */
async function converse(lines: unknown[], customSession = session()): Promise<Message[]> {
  const input = Readable.from(lines.map((line) => `${typeof line === 'string' ? line : JSON.stringify(line)}\n`))
  const written: string[] = []
  const output = new Writable({
    write(chunk, _encoding, done) {
      written.push(String(chunk))
      done()
    },
  })
  await serveStdio(input, output, customSession)
  return written
    .join('')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line) as Message)
}

const HELLO = {jsonrpc: '2.0', id: 1, method: 'initialize', params: {protocolVersion: '2025-06-18', capabilities: {}, clientInfo: {name: 'Cursor', version: '1.0'}}}

beforeEach(() => resetApiMock())

describe('scenario 1: any assistant connects with the standard procedure', () => {
  it('answers the handshake declaring tools, name and version', async () => {
    const [response] = await converse([HELLO])
    expect(response.id).toBe(1)
    expect(response.result).toMatchObject({
      protocolVersion: '2025-06-18',
      capabilities: {tools: {}},
      serverInfo: {name: SERVER_NAME, version: '9.9.9'},
    })
  })

  it('confirms the version the client speaks, when it knows it', async () => {
    for (const version of PROTOCOL_VERSIONS) {
      // eslint-disable-next-line no-await-in-loop
      const [response] = await converse([{...HELLO, params: {protocolVersion: version}}])
      expect(response.result?.protocolVersion).toBe(version)
    }
  })

  it('proposes its own version when the client speaks one it does not know', async () => {
    const [response] = await converse([{...HELLO, params: {protocolVersion: '1900-01-01'}}])
    expect(response.result?.protocolVersion).toBe(DEFAULT_PROTOCOL_VERSION)
    const [senzaVersione] = await converse([{...HELLO, params: {}}])
    expect(senzaVersione.result?.protocolVersion).toBe(DEFAULT_PROTOCOL_VERSION)
  })

  it('handles a client that does not introduce itself with a name', async () => {
    apiMock.post.mockResolvedValue(envelope({id: 'pg-9'}))
    await converse([
      {...HELLO, params: {protocolVersion: '2025-06-18', clientInfo: {version: '1.0'}}},
      {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {name: 'kb_propose', arguments: {project: 'ACME', title: 'T', body: 'B'}},
      },
    ])
    const [, body] = apiMock.post.mock.calls[0] as [string, Record<string, unknown>]
    expect(body.author_origin).toBe('mcp')
  })

  it('does not answer notifications, which expect no answer', async () => {
    const messages = await converse([{jsonrpc: '2.0', method: 'notifications/initialized'}])
    expect(messages).toEqual([])
  })

  it('answers the ping the client uses to check the server is alive', async () => {
    const [response] = await converse([{jsonrpc: '2.0', id: 4, method: 'ping'}])
    expect(response).toEqual({jsonrpc: '2.0', id: 4, result: {}})
  })

  it('lists the tools with their schema, without needing hand-written instructions', async () => {
    const [response] = await converse([{jsonrpc: '2.0', id: 2, method: 'tools/list'}])
    const tools = response.result?.tools as Array<{name: string; inputSchema: unknown}>
    expect(tools.map((tool) => tool.name)).toContain('kb_search')
    expect(tools.map((tool) => tool.name)).toContain('kb_propose')
    expect(tools[0].inputSchema).toMatchObject({type: 'object'})
  })

  it('searches the pages and returns the result as text readable by the model', async () => {
    apiMock.get.mockResolvedValue(envelope([{id: 'pg-1', title: 'Rollback'}]))
    const [response] = await converse([
      {jsonrpc: '2.0', id: 5, method: 'tools/call', params: {name: 'kb_search', arguments: {query: 'rollback'}}},
    ])
    expect(response.result?.isError).toBe(false)
    const content = response.result?.content as Array<{type: string; text: string}>
    expect(content[0].type).toBe('text')
    expect(JSON.parse(content[0].text)).toEqual({data: [{id: 'pg-1', title: 'Rollback'}]})
  })

  it('also searches pending proposals when asked to', async () => {
    apiMock.get.mockResolvedValue(envelope([{id: 'pg-2', title: 'Trappola', status: 'in_review'}]))
    const [response] = await converse([
      {jsonrpc: '2.0', id: 6, method: 'tools/call', params: {name: 'kb_search', arguments: {query: 'trappola', status: 'all'}}},
    ])
    expect(apiMock.get).toHaveBeenCalledWith('/cli/v1/knowledge/pages?page=1&q=trappola&status=all')
    expect(response.result?.isError).toBe(false)
  })

  it('without a declared status queries the server exactly as before', async () => {
    apiMock.get.mockResolvedValue(envelope([]))
    await converse([
      {jsonrpc: '2.0', id: 7, method: 'tools/call', params: {name: 'kb_search', arguments: {query: 'trappola'}}},
    ])
    expect(apiMock.get).toHaveBeenCalledWith('/cli/v1/knowledge/pages?page=1&q=trappola')
  })

  it('serves a whole conversation in the order it arrives', async () => {
    apiMock.post.mockResolvedValue(envelope({answer: 'Con kamal rollback'}))
    const messages = await converse([
      HELLO,
      {jsonrpc: '2.0', method: 'notifications/initialized'},
      {jsonrpc: '2.0', id: 2, method: 'tools/list'},
      {jsonrpc: '2.0', id: 3, method: 'tools/call', params: {name: 'kb_ask', arguments: {question: 'come?'}}},
    ])
    expect(messages.map((m) => m.id)).toEqual([1, 2, 3])
  })
})

describe('scenario 2: the page proposal stays pending', () => {
  it('proposes the page for review and attributes the text to the connected client', async () => {
    apiMock.post.mockResolvedValue(envelope({id: 'pg-9', status: 'in_review'}))
    const messages = await converse([
      HELLO,
      {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'kb_propose',
          arguments: {project: 'ACME', title: 'Trappola', body: 'Testo', in_review: false},
        },
      },
    ])
    const [, body] = apiMock.post.mock.calls[0] as [string, Record<string, unknown>]
    expect(body.in_review).toBe(true)
    expect(body.author_origin).toBe('Cursor')
    expect(messages[1].result?.isError).toBe(false)
  })
})

describe('scenario 3: the limits are those of the connecting token', () => {
  it('reports the server rejection as the tool outcome, not as a protocol failure', async () => {
    apiMock.get.mockRejectedValue(apiError(403, 'R403-AUTH-001', 'Permesso negato'))
    const [response] = await converse([
      {jsonrpc: '2.0', id: 1, method: 'tools/call', params: {name: 'kb_search', arguments: {query: 'x'}}},
    ])
    expect(response.result?.isError).toBe(true)
    const content = response.result?.content as Array<{text: string}>
    expect(content[0].text).toContain('R403-AUTH-001')
    expect(content[0].text).toContain('Permesso negato')
  })

  it('on a project that cannot be seen returns an empty list, not other people pages', async () => {
    apiMock.get.mockResolvedValue(envelope([]))
    const [response] = await converse([
      {jsonrpc: '2.0', id: 1, method: 'tools/call', params: {name: 'kb_search', arguments: {query: 'x', project: 'SEGRETO'}}},
    ])
    const content = response.result?.content as Array<{text: string}>
    expect(JSON.parse(content[0].text)).toEqual({data: []})
  })

  it('without saved access says you are not logged in, as the command would', async () => {
    apiMock.get.mockRejectedValue(apiError(401, 'C401-AUT-001', 'Not logged in. Run "closeyourit login".'))
    const [response] = await converse([
      {jsonrpc: '2.0', id: 1, method: 'tools/call', params: {name: 'kb_search', arguments: {query: 'x'}}},
    ])
    expect(response.result?.isError).toBe(true)
    expect((response.result?.content as Array<{text: string}>)[0].text).toContain('closeyourit login')
  })
})

describe('malformed input does not stop the server', () => {
  it('flags a line that is not JSON and keeps serving the following ones', async () => {
    const messages = await converse(['{rotto', {jsonrpc: '2.0', id: 2, method: 'ping'}])
    expect(messages[0].error?.code).toBe(RPC_ERROR.parse)
    expect(messages[1]).toEqual({jsonrpc: '2.0', id: 2, result: {}})
  })

  it('rejects a method that does not exist', async () => {
    const [response] = await converse([{jsonrpc: '2.0', id: 3, method: 'resources/list'}])
    expect(response.error?.code).toBe(RPC_ERROR.methodNotFound)
    expect(response.error?.message).toContain('resources/list')
  })

  it('ignores a notification of a method that does not exist', async () => {
    expect(await converse([{jsonrpc: '2.0', method: 'sconosciuto/x'}])).toEqual([])
  })

  it('rejects a tool that does not exist, instead of failing the call silently', async () => {
    const [response] = await converse([
      {jsonrpc: '2.0', id: 4, method: 'tools/call', params: {name: 'rm_rf', arguments: {}}},
    ])
    expect(response.error?.code).toBe(RPC_ERROR.invalidParams)
    expect(response.error?.message).toContain('rm_rf')
  })

  it('reports a wrong argument as the tool outcome, so the model can correct itself', async () => {
    const [response] = await converse([
      {jsonrpc: '2.0', id: 5, method: 'tools/call', params: {name: 'kb_show', arguments: {}}},
    ])
    expect(response.result?.isError).toBe(true)
    expect(response.error).toBeUndefined()
  })

  it('runs a tool invoked without arguments, when they are all optional', async () => {
    const [response] = await converse([{jsonrpc: '2.0', id: 7, method: 'tools/call', params: {name: 'kb_context'}}])
    expect(response.result?.isError).toBe(false)
    const content = response.result?.content as Array<{text: string}>
    expect(JSON.parse(content[0].text)).toEqual({data: {project: null, pages: []}})
  })

  it('closes only once even if the output breaks and then the input ends', async () => {
    const input = new Readable({read() {}})
    const output = new Writable({
      write() {
        throw new Error('EPIPE')
      },
    })
    const finished = serveStdio(input, output, session())
    input.push('{"jsonrpc":"2.0","id":1,"method":"ping"}\n')
    input.push(null)
    await expect(finished).resolves.toBeUndefined()
  })

  it('survives a call without parameters', async () => {
    const [response] = await converse([{jsonrpc: '2.0', id: 6, method: 'tools/call'}])
    expect(response.error?.code).toBe(RPC_ERROR.invalidParams)
  })

  it('accepts several messages arrived in the same stream chunk', async () => {
    const input = Readable.from(['{"jsonrpc":"2.0","id":1,"method":"ping"}\n{"jsonrpc":"2.0","id":2,"method":"ping"}\n'])
    const written: string[] = []
    const output = new Writable({
      write(chunk, _encoding, done) {
        written.push(String(chunk))
        done()
      },
    })
    await serveStdio(input, output, session())
    expect(written.join('').trim().split('\n')).toHaveLength(2)
  })

  it('serves a line left without a newline when the stream closes', async () => {
    const input = Readable.from(['{"jsonrpc":"2.0","id":1,"method":"ping"}'])
    const written: string[] = []
    const output = new Writable({
      write(chunk, _encoding, done) {
        written.push(String(chunk))
        done()
      },
    })
    await serveStdio(input, output, session())
    expect(JSON.parse(written.join('').trim())).toEqual({jsonrpc: '2.0', id: 1, result: {}})
  })

  it('does not leave the process hanging when the output stream breaks', async () => {
    const input = new Readable({read() {}})
    const output = new Writable({
      write(_chunk, _encoding, done) {
        done(new Error('EPIPE'))
      },
    })
    const finished = serveStdio(input, output, session())
    input.push('{"jsonrpc":"2.0","id":1,"method":"ping"}\n')
    await expect(finished).resolves.toBeUndefined()
  })

  it('closes instead of dying when writing to the channel is no longer possible', async () => {
    const input = new Readable({read() {}})
    const output = new Writable({
      write() {
        throw new Error('EPIPE')
      },
    })
    const finished = serveStdio(input, output, session())
    input.push('{"jsonrpc":"2.0","id":1,"method":"ping"}\n')
    await expect(finished).resolves.toBeUndefined()
  })

  it('declares an internal failure instead of letting the server crash', async () => {
    // A session that breaks while being read: no client produces it, but a failure of ours
    // inside the handler must stay an error response, not the death of the process.
    const broken = {
      ...session(),
      get version(): string {
        throw new Error('internal failure')
      },
    }
    const [response] = await converse([HELLO], broken)
    expect(response.error?.code).toBe(RPC_ERROR.internal)
    expect(response.error?.message).toContain('internal failure')
  })

  it('does not hang on a call that never returns when the client leaves', async () => {
    // Closing standard input is how an MCP client asks the server to exit. If a request
    // is still in flight, the open connection would keep the subprocess alive well beyond that
    // moment: once the shutdown window has passed it must be aborted, not waited for.
    apiMock.get.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          apiMock.signal?.addEventListener('abort', () => reject(new Error('interrotta')))
        }),
    )
    const input = new Readable({read() {}})
    const output = new Writable({
      write(_chunk, _encoding, done) {
        done()
      },
    })
    const customSession = createSession({
      api: apiMock as unknown as CliApi,
      version: '9.9.9',
      cwd: '/tmp/repo',
      shutdownGraceMs: 10,
    })
    const finished = serveStdio(input, output, customSession)
    input.push('{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"kb_search","arguments":{"query":"x"}}}\n')
    input.push(null)
    await expect(finished).resolves.toBeUndefined()
    expect(apiMock.signal?.aborted).toBe(true)
  })

  it('exits cleanly if the input stream errors', async () => {
    const input = new Readable({read() {}})
    const output = new Writable({
      write(_chunk, _encoding, done) {
        done()
      },
    })
    const finished = serveStdio(input, output, session())
    input.destroy(new Error('stdin sparito'))
    await expect(finished).resolves.toBeUndefined()
  })
})

describe('the session', () => {
  it('without options works in the current folder and with the default recognition wait', () => {
    const customSession = createSession({api: apiMock as unknown as CliApi, version: '1.0.0'})
    expect(customSession.cwd).toBe(process.cwd())
    expect(customSession.timeoutMs).toBeGreaterThan(0)
  })
})

describe('the command', () => {
  it('puts the server on the process standard input and output', async () => {
    const spy = vi.spyOn(await import('../src/lib/mcp/server'), 'serveStdio').mockResolvedValue()
    try {
      await run(Mcp, [])
      expect(spy).toHaveBeenCalledWith(
        process.stdin,
        process.stdout,
        expect.objectContaining({cwd: process.cwd(), timeoutMs: 5000, version: expect.any(String)}),
      )
    } finally {
      spy.mockRestore()
    }
  })

  it('lets you choose how long to wait for the service', async () => {
    const spy = vi.spyOn(await import('../src/lib/mcp/server'), 'serveStdio').mockResolvedValue()
    try {
      await run(Mcp, ['--timeout', '12'])
      expect(spy).toHaveBeenCalledWith(process.stdin, process.stdout, expect.objectContaining({timeoutMs: 12_000}))
    } finally {
      spy.mockRestore()
    }
  })
})
