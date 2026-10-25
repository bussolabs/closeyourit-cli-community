import {describe, expect, it} from 'vitest'
import {LENGTH_LIMITS, charCount, serverLength, tooLongMessage} from '../src/lib/limits'

describe('charCount', () => {
  it('counts by code point, not by UTF-16 unit', () => {
    expect(charCount('ciao')).toBe(4)
    expect(charCount('🚀')).toBe(1)
    expect(charCount(undefined)).toBe(0)
  })
})

describe('serverLength', () => {
  it('counts a CRLF as the single newline the server saves', () => {
    expect(serverLength('a\r\nb')).toBe(3)
  })

  it('does not count edge whitespace, which the server strips before measuring', () => {
    expect(serverLength('  testo  \n')).toBe(5)
  })

  it('a field not passed counts as zero', () => {
    expect(serverLength(undefined)).toBe(0)
  })
})

describe('tooLongMessage', () => {
  it('stays silent when every field is within the limit', () => {
    expect(tooLongMessage([{flag: '--body', value: 'corto', max: 4000}])).toBeUndefined()
  })

  it('names the field, its length and the limit', () => {
    const message = tooLongMessage([{flag: '--body', value: 'x'.repeat(4001), max: 4000}])
    expect(message).toContain('--body is 4001 characters (max 4000)')
  })

  it('lists all the fields over the limit in a single message', () => {
    const message = tooLongMessage([
      {flag: '--body', value: 'x'.repeat(4200), max: 4000},
      {flag: '--tech-spec', value: 'y'.repeat(1700), max: 1500},
    ])
    expect(message).toContain('--body is 4200 characters (max 4000)')
    expect(message).toContain('--tech-spec is 1700 characters (max 1500)')
    expect(message).toContain('Shorten them')
  })

  it('with a single field over the limit it speaks in the singular', () => {
    const message = tooLongMessage([
      {flag: '--body', value: 'x'.repeat(4200), max: 4000},
      {flag: '--tech-spec', value: 'ok', max: 1500},
    ])
    expect(message).toContain('Shorten it')
    expect(message).not.toContain('--tech-spec')
  })

  it('lets through a text already over the limit that does not grow', () => {
    const legacy = 'x'.repeat(4500)
    expect(tooLongMessage([{flag: '--body', value: legacy, max: 4000, previous: legacy}])).toBeUndefined()
    expect(tooLongMessage([{flag: '--body', value: 'x'.repeat(4300), max: 4000, previous: legacy}])).toBeUndefined()
  })

  it('stops a text already over the limit that grows', () => {
    const message = tooLongMessage([{flag: '--body', value: 'x'.repeat(4600), max: 4000, previous: 'x'.repeat(4500)}])
    expect(message).toContain('--body is 4600 characters (max 4000)')
  })

  it('applies the full cap when the current value fits within it', () => {
    const message = tooLongMessage([{flag: '--body', value: 'x'.repeat(4001), max: 4000, previous: 'corto'}])
    expect(message).toContain('--body is 4001 characters (max 4000)')
  })

  it('does not reject a text the server spelling correction can bring back under the cap', () => {
    // Every «perche'» loses a character becoming «perché»: 4005 characters, ten apostrophes the
    // server absorbs, so at most 3995 saved — within the cap.
    const value = `${'x'.repeat(3925)}${" perche'".repeat(10)}`
    expect(tooLongMessage([{flag: '--description', value, max: 4000, orthography: true}])).toBeUndefined()
    // The same text on a field the server does NOT correct stays too long.
    expect(tooLongMessage([{flag: '--body', value, max: 4000}])).toContain('max 4000')
  })

  it('rejects anyway when not even the spelling correction is enough', () => {
    const value = `${'x'.repeat(4200)}${" perche'".repeat(2)}`
    expect(tooLongMessage([{flag: '--description', value, max: 4000, orthography: true}])).toContain('max 4000')
  })
})

describe('LENGTH_LIMITS', () => {
  it('mirrors the server caps', () => {
    expect(LENGTH_LIMITS.title).toBe(255)
    expect(LENGTH_LIMITS.description).toBe(4000)
    expect(LENGTH_LIMITS.technicalAnalysis).toBe(1500)
    expect(LENGTH_LIMITS.pageBody).toBe(4000)
    expect(LENGTH_LIMITS.techSpec).toBe(1500)
    expect(LENGTH_LIMITS.reviewNote).toBe(240)
    expect(LENGTH_LIMITS.comment).toBe(240)
    expect(LENGTH_LIMITS.report).toBe(20_000)
  })
})
