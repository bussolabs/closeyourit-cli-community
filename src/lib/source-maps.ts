import {constants} from 'node:fs'
import {open} from 'node:fs/promises'
import {basename, extname, resolve, sep} from 'node:path'
import type * as TypeScript from 'typescript'

const MAX_INPUT = 10 * 1024 * 1024
const MAX_MAP = 5 * 1024 * 1024
const MAX_SOURCE = 1024 * 1024
const MAX_FUNCTIONS = 10_000

export interface FunctionRange {
  source_index: number
  start_line: number
  start_column: number
  end_line: number
  end_column: number
  name: string | null
}

export interface PreparedSourceMap {
  version: 3
  file?: string
  sourceRoot?: string
  sources?: Array<string | null>
  names?: string[]
  mappings?: string
  ignoreList?: number[]
  debug_id?: string
  debugId?: string
  sections?: Array<{offset: {line: number; column: number}; map: PreparedSourceMap}>
  x_closeyourit_functions?: {version: 1; ranges: FunctionRange[]}
}

export class SourceMapInputError extends Error {}
function invalid(message: string): never { throw new SourceMapInputError(message) }
function object(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value) }
function position(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 }

/** One descriptor prevents a path replacement between validation and reading. */
export async function readSourceMapFile(path: string): Promise<unknown> {
  if (typeof constants.O_NOFOLLOW !== 'number' || constants.O_NOFOLLOW === 0) invalid('This platform does not support safe source map uploads.')
  const absolute = resolve(path)
  const denied = absolute.split(sep).some((part) => /^(?:\.env(?:\.|$)|\.ssh$|\.aws$|secrets?$|id_(?:rsa|ed25519)$)/i.test(part))
  if (denied || extname(absolute).toLowerCase() !== '.map') invalid('Choose an explicit .map file, not a secret file.')
  let file
  try { file = await open(absolute, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK) }
  catch { invalid('Unable to open a regular source map file without following links.') }
  try {
    const info = await file.stat()
    if (!info.isFile()) invalid('Source map input must be a regular file.')
    if (info.size > MAX_INPUT) invalid('Source map input exceeds 10 MiB.')
    const buffer = Buffer.alloc(MAX_INPUT + 1)
    let used = 0
    while (used < buffer.length) {
      const {bytesRead} = await file.read(buffer, used, buffer.length - used, null)
      if (bytesRead === 0) break
      used += bytesRead
    }
    if (used > MAX_INPUT) invalid('Source map input exceeds 10 MiB.')
    let text: string
    try { text = new TextDecoder('utf-8', {fatal: true}).decode(buffer.subarray(0, used)) }
    catch { invalid('Source map input must be valid UTF-8.') }
    try { return JSON.parse(text) as unknown }
    catch { invalid('Invalid source map JSON.') }
  } catch (error) {
    if (error instanceof SourceMapInputError) throw error
    invalid('Unable to read the source map file.')
  } finally { await file.close() }
}

interface Budget {sections: number; sources: number; names: number; segments: number; functions: number; nodes: number; sourceBytes: number}

/** Only upload imports the compiler. Parsing never creates a program, loads plugins or resolves imports. */
export async function prepareSourceMap(value: unknown): Promise<PreparedSourceMap> {
  const budget: Budget = {sections: 0, sources: 0, names: 0, segments: 0, functions: 0, nodes: 0, sourceBytes: 0}
  let compiler: typeof TypeScript | undefined
  async function walk(value: unknown, depth: number): Promise<PreparedSourceMap> {
    if (depth > 4) invalid('Source map section depth exceeds 4.')
    if (!object(value) || value.version !== 3) invalid('Expected a version 3 source map object.')
    const map: PreparedSourceMap = {version: 3}
    for (const key of ['file', 'debug_id', 'debugId'] as const) {
      if (value[key] !== undefined) {
        if (typeof value[key] !== 'string') invalid('Invalid source map string field.')
        map[key] = value[key]
      }
    }
    if (value.sections !== undefined) {
      if (!Array.isArray(value.sections) || ['sources', 'names', 'mappings', 'sourcesContent', 'sourceRoot'].some((key) => value[key] !== undefined)) invalid('Invalid indexed source map.')
      budget.sections += value.sections.length
      if (budget.sections > 100) invalid('Source map exceeds 100 sections.')
      map.sections = []
      let previous = {line: -1, column: -1}
      for (const section of value.sections) {
        if (!object(section) || section.url !== undefined || !object(section.map)) invalid('Only embedded source map sections are supported.')
        const offset = section.offset
        if (!object(offset) || !position(offset.line) || !position(offset.column)) invalid('Invalid source map section offset.')
        if (offset.line < previous.line || (offset.line === previous.line && offset.column <= previous.column)) invalid('Source map section offsets must be ordered.')
        previous = {line: offset.line, column: offset.column}
        map.sections.push({offset: previous, map: await walk(section.map, depth + 1)})
      }
      return map
    }
    const names = value.names === undefined ? [] : value.names
    if (!Array.isArray(value.sources) || !value.sources.every((item) => item === null || typeof item === 'string') || !Array.isArray(names) || !names.every((item) => typeof item === 'string') || typeof value.mappings !== 'string') invalid('Invalid flat source map fields.')
    budget.sources += value.sources.length
    budget.names += names.length
    if (budget.sources > 10_000 || budget.names > 10_000) invalid('Source map exceeds the source or name budget.')
    let inSegment = false
    for (const char of value.mappings) {
      if (char === ',' || char === ';') { inSegment = false; continue }
      if (!/[A-Za-z0-9+/]/.test(char)) invalid('Invalid source map mappings encoding.')
      if (!inSegment) { budget.segments++; inSegment = true }
      if (budget.segments > 100_000) invalid('Source map exceeds 100000 segments.')
    }
    map.sources = value.sources as Array<string | null>
    map.names = names as string[]
    map.mappings = value.mappings
    if (value.sourceRoot !== undefined) {
      if (typeof value.sourceRoot !== 'string') invalid('Invalid source root.')
      map.sourceRoot = value.sourceRoot
    }
    if (value.ignoreList !== undefined) {
      if (!Array.isArray(value.ignoreList) || !value.ignoreList.every((item) => position(item) && item < map.sources!.length)) invalid('Invalid source ignore list.')
      map.ignoreList = value.ignoreList as number[]
    }
    if (value.sourcesContent !== undefined) {
      if (!Array.isArray(value.sourcesContent) || value.sourcesContent.length > map.sources.length || !value.sourcesContent.every((item) => item === null || typeof item === 'string')) invalid('Invalid embedded source contents.')
      const ranges: FunctionRange[] = []
      for (const [index, source] of value.sourcesContent.entries()) {
        if (typeof source !== 'string') continue
        const size = Buffer.byteLength(source)
        budget.sourceBytes += size
        if (size > MAX_SOURCE || budget.sourceBytes > MAX_MAP) invalid('Embedded source exceeds the compiler byte budget.')
        const filename = map.sources[index]
        if (typeof filename !== 'string' || !/\.(?:[cm]?[jt]s|[jt]sx)(?:[?#].*)?$/i.test(filename)) continue
        compiler ??= await import('typescript')
        ranges.push(...functionRanges(compiler, source, filename, index, budget))
      }
      if (ranges.length) map.x_closeyourit_functions = {version: 1, ranges}
    }
    return map
  }
  try {
    const map = await walk(value, 0)
    if (Buffer.byteLength(JSON.stringify(map)) > MAX_MAP) invalid('Normalized source map exceeds 5 MiB.')
    return map
  } catch (error) {
    if (error instanceof SourceMapInputError) throw error
    invalid('Source map processing failed within the compiler limits.')
  }
}

function functionRanges(ts: typeof TypeScript, source: string, filename: string, index: number, budget: Budget): FunctionRange[] {
  const extension = extname(filename.split(/[?#]/, 1)[0]).toLowerCase()
  const kind = extension === '.tsx' ? ts.ScriptKind.TSX : extension === '.jsx' ? ts.ScriptKind.JSX : /\.[cm]?js$/.test(extension) ? ts.ScriptKind.JS : ts.ScriptKind.TS
  const file = ts.createSourceFile(basename(filename), source, ts.ScriptTarget.Latest, true, kind)
  const diagnostic = (file as TypeScript.SourceFile & {parseDiagnostics: readonly TypeScript.DiagnosticWithLocation[]}).parseDiagnostics[0]
  if (diagnostic) {
    const location = file.getLineAndCharacterOfPosition(diagnostic.start)
    invalid(`Invalid source syntax at source ${index}, line ${location.line}, column ${location.character}.`)
  }
  const ranges: FunctionRange[] = []
  const pending: Array<{node: TypeScript.Node; depth: number}> = [{node: file, depth: 0}]
  while (pending.length) {
    const {node, depth} = pending.pop()!
    if (++budget.nodes > 100_000 || depth > 128) invalid('Source AST exceeds the node or nesting budget.')
    let name: string | undefined
    if ((ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node)) && node.body) name = node.name?.text
    if ((ts.isArrowFunction(node) || ts.isFunctionExpression(node)) && !name) {
      let owner: TypeScript.Node = node
      while (owner.parent && (ts.isParenthesizedExpression(owner.parent) || ts.isAsExpression(owner.parent) || ts.isSatisfiesExpression(owner.parent))) owner = owner.parent
      const parent = owner.parent
      if (parent && (ts.isVariableDeclaration(parent) || ts.isPropertyDeclaration(parent) || ts.isPropertyAssignment(parent))) name = staticName(ts, parent.name)
      if (parent && ts.isBinaryExpression(parent) && parent.operatorToken.kind === ts.SyntaxKind.EqualsToken && parent.right === owner) {
        if (ts.isIdentifier(parent.left)) name = parent.left.text
        else if (ts.isPropertyAccessExpression(parent.left)) name = parent.left.name.text
      }
    }
    if ((ts.isMethodDeclaration(node) || ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)) && node.body) name = staticName(ts, node.name)
    const hasFunctionBody = (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node) ||
      ts.isMethodDeclaration(node) || ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node) || ts.isConstructorDeclaration(node)) && node.body
    // An unnamed inner function must mask its named lexical parent during symbolication.
    if (hasFunctionBody) {
      if (++budget.functions > MAX_FUNCTIONS) invalid('Source map exceeds 10000 function ranges.')
      if (name !== undefined && (Buffer.byteLength(name) > 256 || /[\x00-\x1f\x7f]/.test(name))) invalid('Function name exceeds the metadata limits.')
      const start = file.getLineAndCharacterOfPosition(node.getStart(file))
      const end = file.getLineAndCharacterOfPosition(node.end)
      ranges.push({source_index: index, start_line: start.line, start_column: start.character, end_line: end.line, end_column: end.character, name: name ?? null})
    }
    const children: TypeScript.Node[] = []
    ts.forEachChild(node, (child) => { children.push(child) })
    for (let i = children.length - 1; i >= 0; i--) pending.push({node: children[i], depth: depth + 1})
  }
  return ranges
}

function staticName(ts: typeof TypeScript, node: TypeScript.Node): string | undefined {
  return ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node) ? node.text : undefined
}

export interface SourceMapIdentity {release: string; generatedFile: string; dist?: string; debugId?: string}
export function sourceMapUploadBody(identity: SourceMapIdentity, map: unknown): Record<string, unknown> {
  if (!identity.release.trim() || identity.release.includes('\0')) invalid('A nonblank release is required.')
  if (!identity.generatedFile.trim() || identity.generatedFile.includes('\0')) invalid('A nonblank generated file is required.')
  const body = {release: identity.release, generated_file: identity.generatedFile,
    ...(identity.dist?.trim() ? {dist: identity.dist} : {}), ...(identity.debugId !== undefined ? {debug_id: identity.debugId} : {}), source_map: map}
  if (Buffer.byteLength(JSON.stringify(body)) > MAX_INPUT) invalid('Source map upload exceeds 10 MiB.')
  return body
}
