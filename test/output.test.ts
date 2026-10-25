import {describe, expect, it} from 'vitest'
import {displayWidth, paginationFooter, renderRecord, renderTable, section, statusCell, statusDot} from '../src/lib/output'

const ESC = String.fromCharCode(0x1b)
const BEL = String.fromCharCode(0x07)
const NUL = String.fromCharCode(0x00)
const C1 = String.fromCharCode(0x9b)

/**
 * True if the string still carries a dangerous control char (ANSI injection vector).
 * Tab (0x09) and newline (0x0A) are legitimate layout structure from renderTable, not a threat.
 */
function hasControlChar(value: string): boolean {
  return [...value].some((ch) => {
    const code = ch.codePointAt(0) ?? 0
    if (code === 0x09 || code === 0x0a) return false
    return code <= 0x1f || (code >= 0x7f && code <= 0x9f)
  })
}

describe('renderTable', () => {
  it('renders headers, separator and rows', () => {
    const out = renderTable(['A', 'B'], [['1', '2']])
    expect(out.split('\n')).toHaveLength(3)
    expect(out).toContain('A')
    expect(out).toContain('1')
  })

  it('shows a placeholder when there are no rows', () => {
    expect(renderTable(['A'], [])).toContain('(no results)')
  })

  it('strips terminal control sequences from cells (CWE-150)', () => {
    const evil = `ok${ESC}[31mRED${ESC}[0m${BEL}${NUL}${C1}`
    const out = renderTable(['MSG'], [[evil]])
    expect(hasControlChar(out)).toBe(false)
    // Literal, harmless remnants survive as plain text.
    expect(out).toContain('[31mRED')
  })

  it('preserves printable unicode untouched', () => {
    const out = renderTable(['MSG'], [['café · 日本語']])
    expect(out).toContain('café · 日本語')
  })
})

describe('renderRecord', () => {
  it('strips control sequences from values', () => {
    const out = renderRecord({message: `boom${ESC}[2J`})
    expect(hasControlChar(out)).toBe(false)
    expect(out).toContain('message:')
  })

  it('renders null as a dash', () => {
    expect(renderRecord({trace_id: null})).toBe('trace_id: -')
  })

  it('falls back to pretty JSON when no scalar fields are present', () => {
    const out = renderRecord({items: [1, 2], nested: {a: 1}})
    expect(out).toContain('"items"')
    expect(out).toContain('"nested"')
  })
})

describe('statusDot', () => {
  it('maps stable monitoring enum strings to a coloured circle', () => {
    expect(statusDot('unresolved')).toBe('🔴')
    expect(statusDot('resolved')).toBe('🟢')
    expect(statusDot('up')).toBe('🟢')
    expect(statusDot('down')).toBe('🔴')
    expect(statusDot('late')).toBe('🟡')
    expect(statusDot('missed')).toBe('🔴')
    expect(statusDot('fail')).toBe('🔴') // agent-run failure is `fail`, not `failed`
    expect(statusDot('success')).toBe('🟢')
    expect(statusDot('running')).toBe('🟡')
    expect(statusDot('paused')).toBe('⚪')
  })

  it('is case-insensitive and neutral on the unknown', () => {
    expect(statusDot('UP')).toBe('🟢')
    expect(statusDot('wat')).toBe('⚪')
    expect(statusDot(null)).toBe('⚪')
  })

  it('prefers the badge colour (Tailwind family) for org-customisable labels', () => {
    expect(statusDot('In review', 'indigo')).toBe('🟡')
    expect(statusDot('Done', 'emerald')).toBe('🟢')
    expect(statusDot('High', 'orange')).toBe('🔴')
    expect(statusDot('Low', 'gray')).toBe('⚪')
  })

  it('falls back to the value map when the colour is unknown', () => {
    expect(statusDot('up', 'chartreuse')).toBe('🟢')
    expect(statusDot('custom', 'chartreuse')).toBe('⚪')
  })
})

describe('statusCell', () => {
  it('prefixes the dot to the value', () => {
    expect(statusCell('down')).toBe('🔴 down')
    expect(statusCell('In review', 'indigo')).toBe('🟡 In review')
  })
})

describe('section', () => {
  it('underlines the title with dashes sized to the title', () => {
    expect(section('Description')).toBe('\nDescription\n-----------')
  })

  it('prefixes an emoji when given', () => {
    expect(section('Definition of Done', '✅')).toBe('\n✅ Definition of Done\n------------------')
  })
})

describe('renderRecord — status dots', () => {
  it('dots an enum status/level key via the string map', () => {
    expect(renderRecord({status: 'unresolved'})).toBe('status: 🔴 unresolved')
    expect(renderRecord({level: 'warning'})).toContain('🟡 warning')
  })

  it('dots ticket status/priority via the colour sibling and hides the *_color keys', () => {
    const out = renderRecord({priority: 'High', priority_color: 'orange', status: 'In review', status_color: 'indigo'})
    expect(out).toContain('status: 🟡 In review')
    expect(out).toContain('priority: 🔴 High')
    expect(out).not.toContain('status_color')
    expect(out).not.toContain('priority_color')
  })

  it('leaves a priority without a colour undotted', () => {
    expect(renderRecord({priority: 'High'})).toBe('priority: High')
  })

  it('never dots a null status', () => {
    expect(renderRecord({status: null})).toBe('status: -')
  })

  it('leaves non-status keys untouched', () => {
    expect(renderRecord({name: 'apps'})).toBe('name: apps')
  })
})

describe('displayWidth', () => {
  const ZWJ = String.fromCodePoint(0x200d)

  it('counts wide code points as two columns and joiners as zero', () => {
    expect(displayWidth('a')).toBe(1)
    expect(displayWidth('🔴')).toBe(2) // emoji plane, JS length 2
    expect(displayWidth('⚪')).toBe(2) // U+26AA, JS length 1 but renders wide
    expect(displayWidth('日')).toBe(2) // CJK
    expect(displayWidth(`a${ZWJ}b`)).toBe(2) // ZWJ contributes 0
  })
})

describe('renderTable — emoji column alignment', () => {
  it('keeps columns square when a status cell mixes 1- and 2-length emoji', () => {
    const out = renderTable(
      ['NAME', 'STATUS', 'ID'],
      [
        ['a', statusCell('up'), 'm1'],
        ['b', statusCell('unknown'), 'm2'],
      ],
    )
    const [, , row1, row2] = out.split('\n')
    expect(displayWidth(row1)).toBe(displayWidth(row2))
  })
})

describe('paginationFooter', () => {
  it('announces the grand total and how to reach the next page when more pages follow', () => {
    const out = paginationFooter({page: 1, per: 10, total: 900, total_pages: 90})
    expect(out).toContain('900') // how many items exist in total
    expect(out).toContain('of 90') // how many pages there are
    expect(out).toContain('--page 2') // how to see the next ones
  })

  it('returns undefined for a single page — nothing to page through', () => {
    expect(paginationFooter({page: 1, per: 10, total: 4, total_pages: 1})).toBeUndefined()
  })

  it('returns undefined on the last page and for fetchAllPages-aggregated meta (page === total_pages)', () => {
    // Last page reached by hand: there are no following pages to point out.
    expect(paginationFooter({page: 90, per: 10, total: 900, total_pages: 90})).toBeUndefined()
    // secrets/assets aggregate every page: the last saved meta has page === total_pages → no footer.
    expect(paginationFooter({page: 2, per: 100, total: 150, total_pages: 2})).toBeUndefined()
  })

  it('returns undefined when meta is missing or not paginated', () => {
    expect(paginationFooter(undefined)).toBeUndefined()
    expect(paginationFooter(null)).toBeUndefined()
    expect(paginationFooter({})).toBeUndefined()
    expect(paginationFooter({total: 5})).toBeUndefined()
  })

  it('still points to the next page when the backend omits the total count', () => {
    const out = paginationFooter({page: 1, total_pages: 3})
    expect(out).toContain('--page 2')
    expect(out).not.toContain('total')
  })
})
