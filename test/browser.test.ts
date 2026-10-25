import {afterEach, describe, expect, it, vi} from 'vitest'
import {spawn} from 'node:child_process'
import {isSameOriginHttpUrl, openUrl} from '../src/lib/browser'

vi.mock('node:child_process', () => ({spawn: vi.fn()}))

const realPlatform = process.platform

function setPlatform(value: NodeJS.Platform): void {
  Object.defineProperty(process, 'platform', {value, configurable: true})
}

function fakeChild() {
  return {on: vi.fn(), unref: vi.fn()}
}

afterEach(() => {
  Object.defineProperty(process, 'platform', {value: realPlatform, configurable: true})
  vi.mocked(spawn).mockReset()
})

describe('openUrl', () => {
  it('uses `open` on macOS and detaches the child', () => {
    setPlatform('darwin')
    const child = fakeChild()
    vi.mocked(spawn).mockReturnValue(child as never)

    openUrl('https://example.test')

    expect(vi.mocked(spawn)).toHaveBeenCalledWith('open', ['https://example.test'], expect.objectContaining({detached: true}))
    expect(child.on).toHaveBeenCalledWith('error', expect.any(Function))
    expect(child.unref).toHaveBeenCalled()
  })

  it('uses `rundll32 url.dll,FileProtocolHandler` on Windows, never a shell (CYCL-74)', () => {
    setPlatform('win32')
    vi.mocked(spawn).mockReturnValue(fakeChild() as never)
    openUrl('https://example.test/?a=1&b=2')
    expect(vi.mocked(spawn)).toHaveBeenCalledWith(
      'rundll32',
      ['url.dll,FileProtocolHandler', 'https://example.test/?a=1&b=2'],
      expect.objectContaining({shell: false}),
    )
  })

  it('uses `xdg-open` on Linux/other', () => {
    setPlatform('linux')
    vi.mocked(spawn).mockReturnValue(fakeChild() as never)
    openUrl('https://example.test')
    expect(vi.mocked(spawn)).toHaveBeenCalledWith('xdg-open', ['https://example.test'], expect.any(Object))
  })

  it('swallows a spawn failure (convenience helper never throws)', () => {
    setPlatform('linux')
    vi.mocked(spawn).mockImplementation(() => {
      throw new Error('spawn ENOENT')
    })
    expect(() => openUrl('https://example.test')).not.toThrow()
  })

  it('registers an error handler that swallows child errors', () => {
    setPlatform('darwin')
    const child = fakeChild()
    vi.mocked(spawn).mockReturnValue(child as never)
    openUrl('https://example.test')
    const handler = child.on.mock.calls[0][1] as () => void
    expect(() => handler()).not.toThrow()
  })
})

describe('isSameOriginHttpUrl', () => {
  const apiUrl = 'https://app.closeyour.it'

  it('accepts an http(s) URL on the same origin as the API', () => {
    expect(isSameOriginHttpUrl('https://app.closeyour.it/device?code=ABCD', apiUrl)).toBe(true)
    expect(isSameOriginHttpUrl('http://localhost:3000/device', 'http://localhost:3000/')).toBe(true)
  })

  it('rejects another host, another scheme or another port', () => {
    expect(isSameOriginHttpUrl('https://evil.test/device', apiUrl)).toBe(false)
    expect(isSameOriginHttpUrl('http://app.closeyour.it/device', apiUrl)).toBe(false)
    expect(isSameOriginHttpUrl('https://app.closeyour.it:8443/device', apiUrl)).toBe(false)
  })

  it('rejects non-web schemes and unparsable values', () => {
    expect(isSameOriginHttpUrl('file:///C:/Windows/System32/calc.exe', apiUrl)).toBe(false)
    expect(isSameOriginHttpUrl('javascript:alert(1)', apiUrl)).toBe(false)
    expect(isSameOriginHttpUrl('https://x & calc', apiUrl)).toBe(false)
    expect(isSameOriginHttpUrl('', apiUrl)).toBe(false)
    expect(isSameOriginHttpUrl(undefined, apiUrl)).toBe(false)
  })
})
