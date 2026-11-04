import {PassThrough, Readable} from 'node:stream'
import {describe, expect, it} from 'vitest'
import {readSecretValue} from '../src/lib/secret-value'

function collect(stream: PassThrough): () => string {
  let text = ''
  stream.on('data', (chunk) => {
    text += String(chunk)
  })
  return () => text
}

describe('readSecretValue', () => {
  it('reads a piped value and drops the trailing newline', async () => {
    const output = new PassThrough()
    expect(await readSecretValue('API_KEY', Readable.from(['s3cr3t\n']), output)).toBe('s3cr3t')
  })

  it('drops a trailing CRLF but keeps inner newlines of a piped value', async () => {
    const output = new PassThrough()
    expect(await readSecretValue('PEM', Readable.from(['line1\nline2\r\n']), output)).toBe('line1\nline2')
  })

  it('rejects an empty piped value', async () => {
    await expect(readSecretValue('API_KEY', Readable.from(['\n']), new PassThrough())).rejects.toThrow('No value entered')
  })

  it('on a terminal asks for the value without echoing it', async () => {
    const input = Object.assign(new PassThrough(), {isTTY: true})
    const output = new PassThrough()
    const written = collect(output)
    const pending = readSecretValue('API_KEY', input, output)
    input.write('s3cr3t\n')
    expect(await pending).toBe('s3cr3t')
    expect(written()).toContain('API_KEY')
    expect(written()).not.toContain('s3cr3t')
  })

  it('on a terminal rejects when the input ends before a value', async () => {
    const input = Object.assign(new PassThrough(), {isTTY: true})
    const pending = readSecretValue('API_KEY', input, new PassThrough())
    input.end()
    await expect(pending).rejects.toThrow('No value entered')
  })
})
