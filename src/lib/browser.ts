import {spawn} from 'node:child_process'

/**
 * True only for an http(s) URL on the same origin (scheme, host, port) as `apiUrl`. The login
 * address comes from the server: anything else is printed for the user but never handed to the
 * OS (CYCL-74).
 */
export function isSameOriginHttpUrl(url: string | undefined, apiUrl: string): boolean {
  if (!url) return false
  try {
    const target = new URL(url)
    const api = new URL(apiUrl)
    return (target.protocol === 'http:' || target.protocol === 'https:') && target.origin === api.origin
  } catch {
    return false
  }
}

/** Best-effort: open a URL in the default browser. Never throws. */
export function openUrl(url: string): void {
  try {
    let command: string
    let args: string[]
    switch (process.platform) {
      case 'darwin':
        command = 'open'
        args = [url]
        break
      case 'win32':
        // Not `cmd /c start`: cmd parses `&` as a command separator and Node does not quote
        // a shell-free argument, so a crafted URL would run commands.
        command = 'rundll32'
        args = ['url.dll,FileProtocolHandler', url]
        break
      default:
        command = 'xdg-open'
        args = [url]
    }
    const child = spawn(command, args, {stdio: 'ignore', detached: true, shell: false})
    child.on('error', () => {
      // Swallow: opening a browser is a convenience, not a requirement.
    })
    child.unref()
  } catch {
    // Never throw from a convenience helper.
  }
}
