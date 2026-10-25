import {readFile} from 'node:fs/promises'
import {CommandHelp, type Command, type Interfaces} from '@oclif/core'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import {ErrorCodes} from '../src/errors/error-codes'
import {LENGTH_LIMITS} from '../src/lib/limits'
import {buildOpenCliDocument, type OclifCommand, type OclifManifest} from '../src/lib/opencli'
import KbPublish from '../src/commands/kb/publish'
import {apiMock, resetApiMock} from './helpers/api-mock'
import {PID, apiError, envelope, runCaptured, runExpectingExit, testConfig} from './helpers/command'

vi.mock('../src/lib/api', async (io) => {
  const actual = await io<typeof import('../src/lib/api')>()
  const {apiMock} = await import('./helpers/api-mock')
  return {...actual, CliApi: vi.fn(function () { return apiMock })}
})
vi.mock('../src/lib/config', async (io) => {
  const actual = await io<typeof import('../src/lib/config')>()
  return {...actual, loadConfig: vi.fn(() => ({apiUrl: 'https://api.test', token: 'tok_test'}))}
})
vi.mock('node:fs/promises', () => ({readFile: vi.fn()}))

const PUBLICATION_KEY = 'source:release~v1'
const PATH = `/cli/v1/projects/${PID}/knowledge/publications/source%3Arelease~v1`
const BODY = '# Private body\n\nDo not print in human mode.'
const PAGE = {
  id: 'page-1',
  publication_key: PUBLICATION_KEY,
  project: 'CYCL',
  title: 'Release guide',
  kind: 'guide',
  body: BODY,
}

function argv(...extra: string[]): string[] {
  return [
    '--project', PID,
    '--publication-key', PUBLICATION_KEY,
    '--title', 'Release guide',
    '--kind', 'guide',
    '--body', BODY,
    ...extra,
  ]
}

/** Indexes into `argv()`, so a test can replace a single value without rebuilding the line. */
const PROJECT_VALUE = 1
const KEY_VALUE = 3
const TITLE_VALUE = 5
const KIND_VALUE = 7

beforeEach(() => {
  resetApiMock()
  vi.mocked(readFile).mockReset()
})

describe('kb publish', () => {
  it('publishes a new source with PUT, key encoded in the path and human output without body', async () => {
    apiMock.put.mockResolvedValue(envelope(PAGE, {operation: 'created', adopted_legacy: false}))

    const {result, stdout} = await runCaptured(KbPublish, argv())

    expect(apiMock.put).toHaveBeenCalledWith(PATH, {title: 'Release guide', kind: 'guide', body: BODY})
    expect(result).toEqual(envelope(PAGE, {operation: 'created', adopted_legacy: false}))
    expect(stdout).toContain('Knowledge publication created')
    expect(stdout).toContain('page-1')
    expect(stdout).toContain('adopted_legacy: false')
    expect(stdout).not.toContain('Private body')
  })

  it('makes update and adoption of a legacy page explicit in the human output', async () => {
    apiMock.put.mockResolvedValue(envelope(PAGE, {operation: 'updated', adopted_legacy: true}))

    const {stdout} = await runCaptured(KbPublish, argv())

    expect(stdout).toContain('Knowledge publication updated')
    expect(stdout).toContain('adopted_legacy: true')
    expect(stdout).not.toContain('Private body')
  })

  it('with --json returns the backend data and meta unchanged', async () => {
    const response = envelope(PAGE, {operation: 'updated', adopted_legacy: false})
    apiMock.put.mockResolvedValue(response)

    const {result, stdout} = await runCaptured(KbPublish, argv('--json'))

    expect(result).toEqual(response)
    expect(stdout).not.toContain('Knowledge publication')
  })

  it('tolerates a success envelope without data or meta', async () => {
    apiMock.put.mockResolvedValue({})

    const {result, stdout} = await runCaptured(KbPublish, argv())

    expect(result).toEqual({})
    expect(stdout).toContain('Knowledge publication updated')
  })

  it('resolves a project key with the global paginated resolver before the PUT', async () => {
    apiMock.get
      .mockResolvedValueOnce(envelope([{id: 'other', key: 'CYRA'}], {total_pages: 2}))
      .mockResolvedValueOnce(envelope([{id: PID, key: 'CYCL'}], {total_pages: 2}))
    apiMock.put.mockResolvedValue(envelope(PAGE, {operation: 'created', adopted_legacy: false}))

    const args = argv()
    args[PROJECT_VALUE] = 'cycl'
    await runCaptured(KbPublish, args)

    expect(apiMock.get).toHaveBeenNthCalledWith(1, '/cli/v1/projects?page=1&per=100')
    expect(apiMock.get).toHaveBeenNthCalledWith(2, '/cli/v1/projects?page=2&per=100')
    expect(apiMock.put).toHaveBeenCalledWith(PATH, expect.any(Object))
  })

  it('reads the body from the file before the PUT', async () => {
    vi.mocked(readFile).mockResolvedValue('Body dal file')
    apiMock.put.mockResolvedValue(envelope(PAGE, {operation: 'created', adopted_legacy: false}))

    await runCaptured(KbPublish, [
      '--project', PID,
      '--publication-key', 'docs.release',
      '--title', 'Release guide',
      '--body-file', './release.md',
    ])

    expect(readFile).toHaveBeenCalledWith('./release.md', 'utf8')
    expect(apiMock.put).toHaveBeenCalledWith(
      `/cli/v1/projects/${PID}/knowledge/publications/docs.release`,
      {title: 'Release guide', body: 'Body dal file'},
    )
  })

  it('fails before the API when the body file is not readable', async () => {
    vi.mocked(readFile).mockRejectedValue(new Error('EACCES'))

    const {message} = await runExpectingExit(KbPublish, [
      '--project', PID,
      '--publication-key', 'docs.release',
      '--title', 'Release guide',
      '--body-file', './release.md',
    ], 2)

    expect(message).toContain('File not found or unreadable: ./release.md')
    expect(apiMock.put).not.toHaveBeenCalled()
  })

  it('requires exactly one of --body and --body-file without calling the API', async () => {
    const base = ['--project', PID, '--publication-key', 'docs.release', '--title', 'Release guide']

    const missing = await runExpectingExit(KbPublish, base, 2)
    const both = await runExpectingExit(KbPublish, [...base, '--body', 'Inline', '--body-file', './release.md'], 2)

    expect(missing.message).toContain('Exactly one of the following must be provided: --body, --body-file')
    expect(both.message).toContain('--body-file cannot also be provided when using --body')
    expect(readFile).not.toHaveBeenCalled()
    expect(apiMock.get).not.toHaveBeenCalled()
    expect(apiMock.put).not.toHaveBeenCalled()
  })

  it.each([
    ['', 'empty'],
    ['_starts-invalid', 'non-alphanumeric first character'],
    ['source/deploy', 'slash'],
    ['source?draft=1', 'query separator'],
    ['source deploy', 'space'],
    ['source\ndeploy', 'control character'],
    ['a'.repeat(256), 'over 255 characters'],
  ])('rejects the publication key %s locally (%s)', async (key) => {
    const args = argv()
    args[KEY_VALUE] = key

    const {message} = await runExpectingExit(KbPublish, args, 2)

    expect(message).toContain('Invalid --publication-key')
    expect(apiMock.get).not.toHaveBeenCalled()
    expect(apiMock.put).not.toHaveBeenCalled()
  })

  it.each(['a', 'a'.repeat(255)])('accepts the valid boundary of %s characters', async (key) => {
    apiMock.put.mockResolvedValue(envelope({...PAGE, publication_key: key}, {operation: 'created'}))
    const args = argv()
    args[KEY_VALUE] = key

    await runCaptured(KbPublish, args)

    expect(apiMock.put).toHaveBeenCalledOnce()
  })

  it('Scenario 1: repeating the publish with the same key returns to the same page, now updated', async () => {
    apiMock.put
      .mockResolvedValueOnce(envelope(PAGE, {operation: 'created', adopted_legacy: false}))
      .mockResolvedValueOnce(envelope(PAGE, {operation: 'updated', adopted_legacy: false}))

    const first = await runCaptured(KbPublish, argv())
    const second = await runCaptured(KbPublish, argv())

    expect(apiMock.put).toHaveBeenCalledTimes(2)
    expect(apiMock.put).toHaveBeenNthCalledWith(1, PATH, expect.any(Object))
    expect(apiMock.put).toHaveBeenNthCalledWith(2, PATH, expect.any(Object))
    expect(first.stdout).toContain('Knowledge publication created')
    expect(second.stdout).toContain('Knowledge publication updated')
    expect(second.result).toEqual(envelope(PAGE, {operation: 'updated', adopted_legacy: false}))
  })

  it('without --kind the field is not sent, so a repeated publish does not downgrade the page kind', async () => {
    apiMock.put.mockResolvedValue(envelope(PAGE, {operation: 'updated', adopted_legacy: false}))

    await runCaptured(KbPublish, [
      '--project', PID,
      '--publication-key', PUBLICATION_KEY,
      '--title', 'Release guide',
      '--body', BODY,
    ])

    const [, payload] = apiMock.put.mock.calls[0] as [string, Record<string, unknown>]
    expect(payload).toEqual({title: 'Release guide', body: BODY})
    expect('kind' in payload).toBe(false)
    expect(JSON.parse(JSON.stringify(payload))).not.toHaveProperty('kind')
  })

  it.each([
    [401, 'R401-CLIAUTH-001'],
    [403, 'R403-KNOWLEDGE-003'],
    [409, 'R409-KNOWLEDGE-001'],
  ])('propagates backend error %i %s', async (status, code) => {
    apiMock.put.mockRejectedValue(apiError(status, code, 'backend error', {field: ['invalid']}))

    const {stderr} = await runExpectingExit(KbPublish, argv())

    expect(stderr).toContain(`${code}: backend error`)
  })

  it('forwards the kind to the backend and propagates the 422 validation', async () => {
    apiMock.put.mockRejectedValue(apiError(422, 'R422-KNOWLEDGE-005', 'kind is invalid', {kind: ['invalid']}))
    const args = argv()
    args[KIND_VALUE] = 'unknown'

    const {stderr} = await runExpectingExit(KbPublish, args)

    expect(apiMock.put).toHaveBeenCalledWith(PATH, expect.objectContaining({kind: 'unknown'}))
    expect(stderr).toContain('R422-KNOWLEDGE-005: kind is invalid')
  })

  it('preserves R404-KNOWLEDGE-001 for a project that is not visible', async () => {
    apiMock.put.mockRejectedValue(apiError(404, 'R404-KNOWLEDGE-001', 'Project not found'))

    const {stderr} = await runExpectingExit(KbPublish, argv())

    expect(stderr).toContain('R404-KNOWLEDGE-001: Project not found')
  })

  it('fails locally if the project key does not exist and does not attempt the publish', async () => {
    apiMock.get.mockResolvedValue(envelope([{id: 'other', key: 'CYRA'}]))

    const args = argv()
    args[PROJECT_VALUE] = 'missing'
    const {stderr} = await runExpectingExit(KbPublish, args)

    expect(stderr).toContain('C404-PRJ-001: Project not found: missing')
    expect(apiMock.put).not.toHaveBeenCalled()
  })

  it.each([
    ['C000-NET-001', 'non-JSON body, typical of a route that does not exist'],
    ['C404-API-000', 'error envelope without a code'],
  ])('reads a 404 with local code %s (%s) as a backend that is too old', async (code) => {
    apiMock.put.mockRejectedValue(apiError(404, code, 'Request failed (404)'))

    const {stdout} = await runExpectingExit(KbPublish, argv('--json'))

    expect(JSON.parse(stdout)).toEqual({
      error: {
        code: ErrorCodes.Knowledge.publishUnavailable,
        message: 'Knowledge publish is not supported by this backend. Upgrade CloseYourIt and retry.',
      },
    })
  })

  it.each([
    ['R404-KNOWLEDGE-001', 'the route project is not visible'],
    ['R404-KNOWLEDGE-009', 'an application 404 the backend will add later'],
    ['G404-AUTH-001', 'an application 404 from another domain'],
  ])('leaves the application 404 %s untouched (%s)', async (code) => {
    apiMock.put.mockRejectedValue(apiError(404, code, 'Not found here'))

    const {stderr} = await runExpectingExit(KbPublish, argv())

    expect(stderr).toContain(`${code}: Not found here`)
    expect(stderr).not.toContain(ErrorCodes.Knowledge.publishUnavailable)
  })

  it('lists the fields over the cap together before calling the server', async () => {
    const args = argv()
    args[TITLE_VALUE] = 'a'.repeat(LENGTH_LIMITS.title + 1)
    args[9] = 'b'.repeat(LENGTH_LIMITS.pageBody + 1)

    const {message} = await runExpectingExit(KbPublish, args, 2)

    expect(message).toContain('--title is 256 characters (max 255)')
    expect(message).toContain('--body is 4001 characters (max 4000)')
    expect(apiMock.get).not.toHaveBeenCalled()
    expect(apiMock.put).not.toHaveBeenCalled()
  })

  it('measures the cap on the body read from the file, naming --body-file', async () => {
    vi.mocked(readFile).mockResolvedValue('b'.repeat(LENGTH_LIMITS.pageBody + 1))

    const {message} = await runExpectingExit(KbPublish, [
      '--project', PID,
      '--publication-key', 'docs.release',
      '--title', 'Release guide',
      '--body-file', './release.md',
    ], 2)

    expect(message).toContain('--body-file is 4001 characters (max 4000)')
    expect(apiMock.put).not.toHaveBeenCalled()
  })
})

describe('kb publish discovery', () => {
  it('exposes the exactly-one constraint in the oclif metadata', () => {
    expect(KbPublish.description).toContain('publication key')
    expect(KbPublish.description).toContain('Exactly one of --body or --body-file is required')
    expect(KbPublish.examples).toHaveLength(2)
    expect(KbPublish.usage).toContain('(--body <markdown> | --body-file <path>)')
    expect(KbPublish.flags.project.required).toBe(true)
    expect(KbPublish.flags['publication-key'].required).toBe(true)
    expect(KbPublish.flags.title.required).toBe(true)
    expect(KbPublish.flags.kind.default).toBeUndefined()
    expect(KbPublish.flags.body.exactlyOne).toEqual(['body', 'body-file'])
    expect(KbPublish.flags.body.exclusive).toBeUndefined()
    expect(KbPublish.flags['body-file'].exclusive).toBeUndefined()
  })

  it('renders the required constraint in the actually generated help text', async () => {
    const config = await testConfig()
    const command = {
      aliases: [],
      args: {},
      description: KbPublish.description,
      examples: KbPublish.examples,
      flags: KbPublish.flags,
      hidden: false,
      hiddenAliases: [],
      id: 'kb:publish',
      load: async () => KbPublish,
      usage: KbPublish.usage,
    } as unknown as Command.Loadable
    const help = new CommandHelp(command, config, {maxWidth: 120, stripAnsi: true} as Interfaces.HelpOptions).generate()

    expect(help.replace(/\s+/g, ' ')).toContain('(--body <markdown> | --body-file <path>)')
    expect(help).toContain('Exactly one of --body or --body-file is required')
  })

  it('publishes command, description and flag contract in the generated OpenCLI document', () => {
    // `opencli.json` is no longer hand-written: it is generated from the oclif manifest in prepack. Here the
    // manifest is derived from the real class metadata, so the published document stays
    // tied to the command and not to a copy that could fall behind.
    const doc = buildOpenCliDocument({manifest: manifestFrom(KbPublish), bin: 'closeyourit'})
    const publish = (doc.command.commands ?? [])
      .find((command) => command.name === 'kb')
      ?.commands?.find((command) => command.name === 'publish')

    expect(publish).toBeDefined()
    expect(publish?.description).toContain('Exactly one of --body or --body-file is required')
    expect(publish?.options).toEqual(expect.arrayContaining([
      expect.objectContaining({name: '--project', required: true}),
      expect.objectContaining({name: '--publication-key', required: true}),
      expect.objectContaining({name: '--title', required: true}),
      expect.objectContaining({name: '--kind'}),
      expect.objectContaining({name: '--body'}),
      expect.objectContaining({name: '--body-file'}),
    ]))
    expect(publish?.examples?.join('\n')).toContain('kb publish')
  })
})

/** The manifest `oclif manifest` would write for this command, read from its static metadata. */
function manifestFrom(command: typeof KbPublish): OclifManifest {
  const flags = Object.fromEntries(
    Object.entries(command.flags).map(([name, flag]) => {
      const spec = flag as {type?: string; char?: string; description?: string; required?: boolean}
      return [name, {name, type: spec.type === 'boolean' ? 'boolean' : 'option', ...spec}]
    }),
  ) as OclifCommand['flags']

  return {
    version: '0.0.0-test',
    commands: {'kb:publish': {id: 'kb:publish', description: command.description, examples: command.examples, flags}},
  }
}
