import {describe, expect, it} from 'vitest'
import {isProtectedEnvName, mergeSecretsIntoEnv} from '../src/lib/protected-env'

describe('isProtectedEnvName', () => {
  it('protects loader and interpreter variables by exact name', () => {
    for (const name of [
      'PATH',
      'NODE_OPTIONS',
      'BASH_ENV',
      'ENV',
      'GIT_SSH_COMMAND',
      'PERL5OPT',
      'RUBYOPT',
      'PYTHONPATH',
      'PYTHONSTARTUP',
      'SHELL',
      'HOME',
      'IFS',
    ]) {
      expect(isProtectedEnvName(name), name).toBe(true)
    }
  })

  it('protects every LD_* and DYLD_* variable', () => {
    expect(isProtectedEnvName('LD_PRELOAD')).toBe(true)
    expect(isProtectedEnvName('LD_LIBRARY_PATH')).toBe(true)
    expect(isProtectedEnvName('DYLD_INSERT_LIBRARIES')).toBe(true)
  })

  it('ignores case, since Windows environment names are case-insensitive', () => {
    expect(isProtectedEnvName('path')).toBe(true)
    expect(isProtectedEnvName('Node_Options')).toBe(true)
  })

  it('leaves ordinary secret names alone', () => {
    expect(isProtectedEnvName('DATABASE_URL')).toBe(false)
    expect(isProtectedEnvName('PATHS')).toBe(false)
    expect(isProtectedEnvName('MY_LD_FLAG')).toBe(false)
  })
})

describe('mergeSecretsIntoEnv', () => {
  it('lets secrets override ordinary variables and keeps the rest of the base env', () => {
    const {env, skipped} = mergeSecretsIntoEnv({PATH: '/bin', FOO: 'old'}, {FOO: 'new', TOKEN: 't'})
    expect(env).toEqual({PATH: '/bin', FOO: 'new', TOKEN: 't'})
    expect(skipped).toEqual([])
  })

  it('never lets a secret override a protected variable and reports the skipped names', () => {
    const {env, skipped} = mergeSecretsIntoEnv(
      {PATH: '/bin'},
      {NODE_OPTIONS: '--require evil', PATH: '/evil', LD_PRELOAD: 'x.so', OK: '1'},
    )
    expect(env).toEqual({PATH: '/bin', OK: '1'})
    expect(env).not.toHaveProperty('NODE_OPTIONS')
    expect(env).not.toHaveProperty('LD_PRELOAD')
    expect(skipped).toEqual(['NODE_OPTIONS', 'PATH', 'LD_PRELOAD'])
  })
})
