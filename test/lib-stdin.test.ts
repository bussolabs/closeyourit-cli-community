import {Readable} from 'node:stream'
import {describe, expect, it} from 'vitest'
import {readStream} from '../src/lib/stdin'

describe('readStream', () => {
  it('reads the whole stream into a UTF-8 string', async () => {
    const text = await readStream(Readable.from(['A=1\n', 'B=2\n']))
    expect(text).toBe('A=1\nB=2\n')
  })

  it('handles Buffer chunks', async () => {
    const text = await readStream(Readable.from([Buffer.from('X=1')]))
    expect(text).toBe('X=1')
  })
})
