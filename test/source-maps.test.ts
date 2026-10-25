import {afterEach, describe, expect, it, vi} from 'vitest'
import {mkdtemp, mkdir, rm, symlink, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {spawnSync} from 'node:child_process'
import {SourceMap} from 'node:module'
import * as ts from 'typescript'
import {prepareSourceMap, readSourceMapFile, sourceMapUploadBody} from '../src/lib/source-maps'

const directories: string[] = []
afterEach(async () => { await Promise.all(directories.splice(0).map((path) => rm(path, {recursive: true, force: true}))) })
async function directory() { const path = await mkdtemp(join(tmpdir(), 'cyi-source-maps-')); directories.push(path); return path }
const flat = (text?: string) => ({version: 3, sources: ['original.ts'], names: [], mappings: 'AAAA', ...(text === undefined ? {} : {sourcesContent: [text]})})

describe('source map preparation', () => {
  it.each(['ts', 'js'])('locates the original function of a real compiled %s exception', async (extension) => {
    const text = 'function original() {\n  throw new Error("owned test exception");\n}\noriginal();\n'
    const compiled = ts.transpileModule(text, {fileName: `source.${extension}`, compilerOptions: {target: ts.ScriptTarget.ES5, sourceMap: true, inlineSources: true}})
    const path = join(await directory(), 'generated.cjs')
    await writeFile(path, compiled.outputText)
    const process = spawnSync(globalThis.process.execPath, [path], {encoding: 'utf8', timeout: 5000})
    expect(process.status).toBe(1)
    const frame = /at original \(.+:(\d+):(\d+)\)/.exec(process.stderr)
    expect(frame).not.toBeNull()
    const original = new SourceMap(JSON.parse(compiled.sourceMapText!)).findEntry(Number(frame![1]) - 1, Number(frame![2]) - 1)
    expect(original.originalLine).toBe(1)
    const prepared = await prepareSourceMap(JSON.parse(compiled.sourceMapText!))
    const range = prepared.x_closeyourit_functions!.ranges[0]
    expect(range.name).toBe('original')
    expect(range.start_line).toBeLessThanOrEqual(original.originalLine)
    expect(range.end_line).toBeGreaterThan(original.originalLine)
    expect(JSON.stringify(prepared)).not.toContain('owned test exception')
  })

  it('extracts actual nested function ranges without sending source contents', async () => {
    const text = 'function outer() {\n  const inner = () => { throw new Error("private body"); };\n  return inner;\n}\n'
    const map = await prepareSourceMap(flat(text))
    expect(JSON.stringify(map)).not.toContain('private body')
    expect(map).not.toHaveProperty('sourcesContent')
    expect(map.x_closeyourit_functions).toEqual({version: 1, ranges: [
      {source_index: 0, start_line: 0, start_column: 0, end_line: 3, end_column: 1, name: 'outer'},
      {source_index: 0, start_line: 1, start_column: 16, end_line: 1, end_column: 58, name: 'inner'},
    ]})
  })

  it('uses zero-based UTF-16 columns and end-exclusive ranges', async () => {
    const prefix = 'const icon = "😀"; '
    const source = `${prefix}function named() {}`
    const map = await prepareSourceMap(flat(source))
    expect(map.x_closeyourit_functions?.ranges[0]).toMatchObject({start_column: prefix.length, end_column: source.length})
  })

  it('keeps static names and explicit unnamed callback and computed method boundaries', async () => {
    const map = await prepareSourceMap(flat('const assigned = function expression() {};\nconst arrow = () => 1;\nconst object = {method() {}, "static name"() {}, [dynamic]() {}, property: () => 2};\n[1].map(() => 3);\nexport default function() {}'))
    expect(map.x_closeyourit_functions?.ranges.map((r) => r.name)).toEqual(['expression', 'arrow', 'method', 'static name', null, 'property', null, null])
  })

  it('keeps source indices local to each embedded map and never fetches section URLs', async () => {
    const map = await prepareSourceMap({version: 3, sections: [
      {offset: {line: 0, column: 0}, map: flat('function first() {}')},
      {offset: {line: 5, column: 2}, map: {version: 3, sources: ['a.ts', 'b.ts'], names: [], mappings: '', sourcesContent: [null, 'function second() {}']}},
    ]})
    expect(map.sections?.[1].map.x_closeyourit_functions?.ranges[0]).toMatchObject({source_index: 1, name: 'second'})
    expect(JSON.stringify(map)).not.toContain('sourcesContent')
    await expect(prepareSourceMap({version: 3, sections: [{offset: {line: 0, column: 0}, url: 'https://example.invalid/map'}]})).rejects.toThrow('embedded')
  })

  it('does not invent functions from mappings names or trust supplied range extensions', async () => {
    const map = await prepareSourceMap({...flat(), names: ['variableNotFunction'], x_closeyourit_functions: {version: 1, ranges: [{name: 'invented'}]}})
    expect(map).not.toHaveProperty('x_closeyourit_functions')
  })

  it('accepts an omitted names table under ECMA-426 without accepting an invalid table', async () => {
    expect(await prepareSourceMap({version: 3, sources: ['source.js'], mappings: 'AAAA'})).toEqual({version: 3, sources: ['source.js'], names: [], mappings: 'AAAA'})
    await expect(prepareSourceMap({version: 3, sources: [], mappings: '', names: null})).rejects.toThrow('flat source map')
  })

  it('supports assignment, class accessors and wrapped arrows without naming dynamic members', async () => {
    const text = 'let assigned; assigned = (() => 1); obj.named = function() {}; class A { arrow = (() => 2) satisfies Function; get value() { return 1; } set value(v) {} [key] = () => 3; }'
    const map = await prepareSourceMap(flat(text))
    expect(map.x_closeyourit_functions?.ranges.map((r) => r.name)).toEqual(['assigned', 'named', 'arrow', 'value', 'value', null])
  })

  it.each([
    ['callback', '[1].map(function() {\n    throw new Error("owned nested exception");\n  });'],
    ['computed method', 'const key = "dynamic"; const object = { [key]() {\n    throw new Error("owned nested exception");\n  } }; object[key]();'],
    ['constructor', 'class Inner { constructor() {\n    throw new Error("owned nested exception");\n  } } new Inner();'],
  ])('preserves an unnamed %s boundary within a named function at a real throwing frame', async (_kind, body) => {
    const source = `function outer() {\n  ${body}\n}\nouter();\n`
    const compiled = ts.transpileModule(source, {fileName: 'source.ts', compilerOptions: {target: ts.ScriptTarget.ES2022, sourceMap: true, inlineSources: true}})
    const path = join(await directory(), 'generated.cjs')
    await writeFile(path, compiled.outputText)
    const result = spawnSync(process.execPath, [path], {encoding: 'utf8', timeout: 5000})
    expect(result.status).toBe(1)
    const frame = /^\s+at [^\n]*generated\.cjs:(\d+):(\d+)\)?$/m.exec(result.stderr)
    expect(frame).not.toBeNull()
    const original = new SourceMap(JSON.parse(compiled.sourceMapText!)).findEntry(Number(frame![1]) - 1, Number(frame![2]) - 1)
    const map = await prepareSourceMap(JSON.parse(compiled.sourceMapText!))
    const lines = source.split('\n')
    const offset = (line: number, column: number) => lines.slice(0, line).reduce((sum, text) => sum + text.length + 1, 0) + column
    const position = offset(original.originalLine, original.originalColumn)
    const containing = map.x_closeyourit_functions!.ranges.filter((range) => offset(range.start_line, range.start_column) <= position && position < offset(range.end_line, range.end_column))
    expect(containing.map((range) => range.name)).toEqual(['outer', null])
    expect(containing[1].end_line).toBeLessThan(containing[0].end_line)
  })

  it('parses JSX and preserves only allowed map metadata without reading missing sources', async () => {
    const map = await prepareSourceMap({version: 3, file: 'bundle.js', debug_id: 'id', debugId: 'legacy', sourceRoot: '../',
      sources: ['view.jsx', 'typed.tsx', null, 'style.css', 'missing.ts'], names: [], mappings: ';AAAA,CAAC', ignoreList: [3],
      sourcesContent: ['const View = () => <main />;', 'function Typed(): JSX.Element { return <p />; }', 'ignored', 'body {}'], private: 'discard'})
    expect(map).toMatchObject({file: 'bundle.js', debug_id: 'id', debugId: 'legacy', sourceRoot: '../', ignoreList: [3]})
    expect(map.x_closeyourit_functions?.ranges.map((r) => [r.source_index, r.name])).toEqual([[0, 'View'], [1, 'Typed']])
    expect(map).not.toHaveProperty('private')
    expect(map).not.toHaveProperty('sourcesContent')
  })

  it.each([
    {...flat(), file: 1}, {...flat(), sourceRoot: 1}, {...flat(), ignoreList: [-1]}, {...flat(), mappings: '*'},
    {...flat(), sourcesContent: [false]}, {version: 3, sections: [], sources: []}, {version: 3, sections: false},
    {version: 3, sections: [{offset: {line: -1, column: 0}, map: flat()}]},
    {version: 3, sections: [0, 0].map(() => ({offset: {line: 0, column: 0}, map: flat()}))},
  ])('rejects structurally invalid map metadata without echoing its values', async (value) => {
    await expect(prepareSourceMap(value)).rejects.toThrow()
  })

  it('rejects budgets globally across maps and bounded AST traversal', async () => {
    await expect(prepareSourceMap({version: 3, sections: Array.from({length: 101}, (_, line) => ({offset: {line, column: 0}, map: flat()}))})).rejects.toThrow('100 sections')
    await expect(prepareSourceMap({...flat(), names: Array(10_001).fill('n')})).rejects.toThrow('name budget')
    await expect(prepareSourceMap({...flat(), sources: Array(10_001).fill('s')})).rejects.toThrow('source or name budget')
    await expect(prepareSourceMap({...flat(), mappings: Array(100_001).fill('AAAA').join(',')})).rejects.toThrow('segments')
    await expect(prepareSourceMap({...flat(), names: ['x'.repeat(5 * 1024 * 1024)]})).rejects.toThrow('5 MiB')
    await expect(prepareSourceMap(flat(' '.repeat(1024 * 1024 + 1)))).rejects.toThrow('byte budget')
    await expect(prepareSourceMap(flat(`const object = { "${'x'.repeat(257)}"() {} };`))).rejects.toThrow('metadata limits')
    await expect(prepareSourceMap(flat('('.repeat(140) + '1' + ')'.repeat(140)))).rejects.toThrow('nesting budget')
    await expect(prepareSourceMap(flat('('.repeat(10_000) + '1' + ')'.repeat(10_000)))).rejects.toThrow('compiler limits')
  })

  it('rejects malformed sources without including source snippets in diagnostics', async () => {
    await expect(prepareSourceMap(flat('function privateSentinel( {'))).rejects.toThrow(/^Invalid source syntax at source 0, line \d+, column \d+\.$/)
    for (const value of [null, [], {version: 2}, {...flat(), sourcesContent: ['a', 'b']}, {...flat(), sources: [42]}]) {
      await expect(prepareSourceMap(value)).rejects.toThrow()
    }
  })

  it('rejects excessive indexed nesting and global function counts instead of truncating', async () => {
    let map: unknown = flat()
    for (let i = 0; i < 5; i++) map = {version: 3, sections: [{offset: {line: 0, column: 0}, map}]}
    await expect(prepareSourceMap(map)).rejects.toThrow('depth')
    await expect(prepareSourceMap(flat(Array.from({length: 10_001}, (_, i) => `function f${i}(){}`).join('\n')))).rejects.toThrow('function')
  })

  it('preserves exact identity fields and rejects blank release before upload', () => {
    expect(sourceMapUploadBody({release: ' v1 ', dist: '', generatedFile: 'https://example.invalid/app.js?q=1', debugId: 'ABC'}, flat())).toEqual({release: ' v1 ', generated_file: 'https://example.invalid/app.js?q=1', debug_id: 'ABC', source_map: flat()})
    expect(() => sourceMapUploadBody({release: ' ', generatedFile: 'app.js'}, flat())).toThrow('release')
    expect(() => sourceMapUploadBody({release: 'v1', generatedFile: ''}, flat())).toThrow('generated file')
    expect(() => sourceMapUploadBody({release: 'v1', generatedFile: 'app.js'}, {data: 'x'.repeat(10 * 1024 * 1024)})).toThrow('10 MiB')
  })
})

describe('bounded source map file reading', () => {
  it('rejects upload before opening when safe nofollow flags are unavailable', async () => {
    vi.resetModules()
    vi.doMock('node:fs', () => ({constants: {O_RDONLY: 0}}))
    try {
      const {readSourceMapFile: unsupportedRead} = await import('../src/lib/source-maps')
      await expect(unsupportedRead('/missing/source.map')).rejects.toThrow('This platform does not support safe source map uploads.')
    } finally {
      vi.doUnmock('node:fs')
      vi.resetModules()
    }
  })

  it('reads only a regular map file and rejects links, directories and secret paths', async () => {
    const dir = await directory(), path = join(dir, 'app.js.map')
    await writeFile(path, JSON.stringify(flat()))
    expect(await readSourceMapFile(path)).toEqual(flat())
    const link = join(dir, 'link.map'); await symlink(path, link)
    await expect(readSourceMapFile(link)).rejects.toThrow('regular')
    const folder = join(dir, 'folder.map'); await mkdir(folder)
    await expect(readSourceMapFile(folder)).rejects.toThrow('regular')
    await expect(readSourceMapFile(join(dir, '.env'))).rejects.toThrow('map file')
    await expect(readSourceMapFile(join(dir, 'missing.map'))).rejects.toThrow('regular')
  })

  it('bounds input bytes and never echoes malformed JSON', async () => {
    const dir = await directory(), path = join(dir, 'bad.map')
    await writeFile(path, 'privateSentinel')
    await expect(readSourceMapFile(path)).rejects.toThrow('Invalid source map JSON.')
    await writeFile(path, Buffer.from([0xff]))
    await expect(readSourceMapFile(path)).rejects.toThrow('UTF-8')
    await writeFile(path, ' '.repeat(10 * 1024 * 1024 + 1))
    await expect(readSourceMapFile(path)).rejects.toThrow('10 MiB')
  })
})
