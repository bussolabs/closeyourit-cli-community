import {beforeEach, describe, expect, it, vi} from 'vitest'
import {apiMock, resetApiMock} from './helpers/api-mock'
import {GID, PID, apiError, envelope, run, runCaptured, runExpectingExit} from './helpers/command'

vi.mock('../src/lib/api', async (io) => {
  const actual = await io<typeof import('../src/lib/api')>()
  const {apiMock} = await import('./helpers/api-mock')
  return {...actual, CliApi: vi.fn(function () { return apiMock })}
})
vi.mock('../src/lib/config', async (io) => {
  const actual = await io<typeof import('../src/lib/config')>()
  return {...actual, loadConfig: vi.fn(() => ({apiUrl: 'https://api.test', token: 'tok_test'}))}
})

import ProjectsCreate from '../src/commands/projects/create'
import ProjectsDelete from '../src/commands/projects/delete'
import ProjectsGithub from '../src/commands/projects/github'
import ProjectsGithubConnect from '../src/commands/projects/github-connect'
import ProjectsGithubMap from '../src/commands/projects/github-map'
import ProjectsGithubUpdate from '../src/commands/projects/github-update'
import ProjectsLinkServer from '../src/commands/projects/link-server'
import ProjectsList from '../src/commands/projects/list'
import ProjectsSetEnvironmentCapabilities from '../src/commands/projects/set-environment-capabilities'
import ProjectsSetEnvironments from '../src/commands/projects/set-environments'
import ProjectsSetPlatforms from '../src/commands/projects/set-platforms'
import ProjectsSettingsShow from '../src/commands/projects/settings/show'
import ProjectsSettingsUpdate from '../src/commands/projects/settings/update'
import ProjectsShow from '../src/commands/projects/show'
import ProjectsUnlinkServer from '../src/commands/projects/unlink-server'
import ProjectsUpdate from '../src/commands/projects/update'

beforeEach(() => resetApiMock())

describe('projects — full flag coverage', () => {
  it('update maps every field (name, key, color, description, group)', async () => {
    apiMock.put.mockResolvedValue(envelope({key: 'DRRA', name: 'New'}))
    await runCaptured(ProjectsUpdate, [
      '--project', PID, '--name', 'New', '--key', 'NK', '--color', 'sky', '--description', 'd', '--group', GID,
    ])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/projects/${PID}`, {
      name: 'New', key: 'NK', color: 'sky', description: 'd', group_id: GID,
    })
  })

  it('set-environments forwards --environment-id too', async () => {
    apiMock.put.mockResolvedValue(envelope([{code: 'production', label: 'Production'}]))
    await runCaptured(ProjectsSetEnvironments, ['--project', PID, '--code', 'production', '--environment-id', 'env-1'])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/environments`, {
      codes: ['production'], environment_ids: ['env-1'],
    })
  })
})

describe('projects list', () => {
  it('lists the visible projects (default page)', async () => {
    apiMock.get.mockResolvedValue(envelope([{key: 'DRRA', name: 'DriverOne', id: 'p1'}], {total: 1}))
    const {result, stdout} = await runCaptured(ProjectsList, [])
    expect(apiMock.get).toHaveBeenCalledWith('/cli/v1/projects?page=1')
    expect(stdout).toContain('DRRA')
    expect((result as {data: unknown[]}).data).toHaveLength(1)
  })

  it('honours --page', async () => {
    apiMock.get.mockResolvedValue(envelope([]))
    await runCaptured(ProjectsList, ['--page', '3'])
    expect(apiMock.get).toHaveBeenCalledWith('/cli/v1/projects?page=3')
  })

  it('exits non-zero on an API error', async () => {
    apiMock.get.mockRejectedValue(apiError(500, 'R500-SYS-001', 'server down'))
    const {stderr} = await runExpectingExit(ProjectsList, [])
    expect(stderr).toContain('R500-SYS-001')
  })
})

describe('projects create', () => {
  it('posts name + key and prints the created record', async () => {
    apiMock.post.mockResolvedValue(envelope({id: 'p1', key: 'DRRA', name: 'driverone-rails'}))
    const {stdout} = await runCaptured(ProjectsCreate, ['driverone-rails', '--key', 'DRRA'])
    expect(apiMock.post).toHaveBeenCalledWith('/cli/v1/projects', {name: 'driverone-rails', key: 'DRRA'})
    expect(stdout).toContain('Project created')
  })

  it('maps a UUID --group to group_id and other flags into the body', async () => {
    apiMock.post.mockResolvedValue(envelope({id: 'p1'}))
    await runCaptured(ProjectsCreate, ['app', '--key', 'AP', '--group', GID, '--color', 'sky', '--description', 'x'])
    expect(apiMock.post).toHaveBeenCalledWith('/cli/v1/projects', {
      name: 'app',
      key: 'AP',
      color: 'sky',
      description: 'x',
      group_id: GID,
    })
  })

  it('maps a non-UUID --group to group_name', async () => {
    apiMock.post.mockResolvedValue(envelope({id: 'p1'}))
    await runCaptured(ProjectsCreate, ['app', '--key', 'AP', '--group', 'DriverOne'])
    expect(apiMock.post).toHaveBeenCalledWith('/cli/v1/projects', {name: 'app', key: 'AP', group_name: 'DriverOne'})
  })
})

describe('projects show', () => {
  it('passes a UUID straight through (single fetch)', async () => {
    apiMock.get.mockResolvedValue(envelope({id: PID, key: 'DRRA'}))
    await runCaptured(ProjectsShow, [PID])
    expect(apiMock.get).toHaveBeenCalledTimes(1)
    expect(apiMock.get).toHaveBeenCalledWith(`/cli/v1/projects/${PID}`)
  })

  it('resolves a key to its id first, then fetches', async () => {
    apiMock.get
      .mockResolvedValueOnce(envelope([{id: 'p-uuid', key: 'DRRA'}]))
      .mockResolvedValueOnce(envelope({id: 'p-uuid', key: 'DRRA', name: 'DriverOne'}))
    await runCaptured(ProjectsShow, ['drra'])
    expect(apiMock.get).toHaveBeenNthCalledWith(1, '/cli/v1/projects?page=1&per=100')
    expect(apiMock.get).toHaveBeenNthCalledWith(2, '/cli/v1/projects/p-uuid')
  })

  // Regression CYCL-1: the key resolver only looked at the first page of /cli/v1/projects, so a key
  // living on a later page (e.g. legalbloom LBRA/LBWB) failed with C404 while its UUID worked.
  it('resolves a key found only on a later page (paginates through every page)', async () => {
    apiMock.get
      .mockResolvedValueOnce(envelope([{id: 'p-cyra', key: 'CYRA'}], {total_pages: 2}))
      .mockResolvedValueOnce(envelope([{id: 'p-lbra', key: 'LBRA'}], {total_pages: 2}))
      .mockResolvedValueOnce(envelope({id: 'p-lbra', key: 'LBRA', name: 'legalbloom-rails'}))
    await runCaptured(ProjectsShow, ['LBRA'])
    expect(apiMock.get).toHaveBeenNthCalledWith(1, '/cli/v1/projects?page=1&per=100')
    expect(apiMock.get).toHaveBeenNthCalledWith(2, '/cli/v1/projects?page=2&per=100')
    expect(apiMock.get).toHaveBeenNthCalledWith(3, '/cli/v1/projects/p-lbra')
  })

  // Once the key is found the resolver stops paging (no wasted request for the remaining pages).
  it('stops paging as soon as the key matches (first page hit → no page 2 fetch)', async () => {
    apiMock.get
      .mockResolvedValueOnce(envelope([{id: 'p-uuid', key: 'DRRA'}], {total_pages: 5}))
      .mockResolvedValueOnce(envelope({id: 'p-uuid', key: 'DRRA', name: 'DriverOne'}))
    await runCaptured(ProjectsShow, ['drra'])
    expect(apiMock.get).toHaveBeenNthCalledWith(1, '/cli/v1/projects?page=1&per=100')
    expect(apiMock.get).toHaveBeenNthCalledWith(2, '/cli/v1/projects/p-uuid')
    expect(apiMock.get).toHaveBeenCalledTimes(2)
  })

  it('exits C404 when the key matches no project on any page', async () => {
    apiMock.get.mockResolvedValue(envelope([{id: 'other', key: 'XX'}]))
    const {stderr} = await runExpectingExit(ProjectsShow, ['nope'])
    expect(stderr).toContain('C404-PRJ-001')
  })

  // CYCL-4: read the declared environments and their per-environment active capabilities before
  // replacing them wholesale with `set-environments`. The backend enriches the project payload with
  // an `environments` array (same pattern as the github `sync_secrets` field in CYCL-3).
  it('lists the declared environments with their active capabilities (CYCL-4)', async () => {
    apiMock.get.mockResolvedValue(
      envelope({
        id: PID,
        key: 'DRRA',
        environments: [
          {code: 'production', label: 'Production', servers_enabled: true, uptime_enabled: true, secrets_enabled: false},
          {code: 'staging', label: 'Staging', servers_enabled: false, uptime_enabled: true, secrets_enabled: true},
        ],
      }),
    )
    const {stdout} = await runCaptured(ProjectsShow, [PID])
    // Single fetch: the environments travel inside the project payload (no extra request).
    expect(apiMock.get).toHaveBeenCalledTimes(1)
    expect(stdout).toContain('Environments')
    expect(stdout).toContain('SERVERS')
    expect(stdout).toContain('UPTIME')
    expect(stdout).toContain('SECRETS')
    // Active capabilities per environment (on/off), in declaration order.
    expect(stdout).toMatch(/production\s+Production\s+on\s+on\s+off/)
    expect(stdout).toMatch(/staging\s+Staging\s+off\s+on\s+on/)
  })

  it('reports an empty declared-environments set (CYCL-4)', async () => {
    apiMock.get.mockResolvedValue(envelope({id: PID, key: 'DRRA', environments: []}))
    const {stdout} = await runCaptured(ProjectsShow, [PID])
    expect(stdout).toContain('Environments')
    expect(stdout).toContain('none declared')
  })

  // Backward compatible: an older backend that ships no `environments` field must render exactly as
  // before — the project record only, no environments section, no crash.
  it('omits the environments section when the project carries no environments field (CYCL-4)', async () => {
    apiMock.get.mockResolvedValue(envelope({id: PID, key: 'DRRA', name: 'DriverOne'}))
    const {stdout} = await runCaptured(ProjectsShow, [PID])
    expect(stdout).toContain('DRRA')
    expect(stdout).not.toContain('Environments')
  })

  it('--json returns the envelope including the environments (CYCL-4)', async () => {
    apiMock.get.mockResolvedValue(
      envelope({id: PID, environments: [{code: 'production', label: 'Production', uptime_enabled: true}]}),
    )
    const res = (await run(ProjectsShow, [PID, '--json'])) as {
      data: {environments: Array<{code: string; uptime_enabled: boolean}>}
    }
    expect(res.data.environments[0].code).toBe('production')
    expect(res.data.environments[0].uptime_enabled).toBe(true)
  })
})

describe('projects update', () => {
  it('sends only the provided fields', async () => {
    apiMock.put.mockResolvedValue(envelope({key: 'DRRA', name: 'New'}))
    const {stdout} = await runCaptured(ProjectsUpdate, ['--project', PID, '--name', 'New'])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/projects/${PID}`, {name: 'New'})
    expect(stdout).toContain('Updated project DRRA — New')
  })

  it('resolves --group to group_id', async () => {
    apiMock.put.mockResolvedValue(envelope({key: 'DRRA'}))
    await runCaptured(ProjectsUpdate, ['--project', PID, '--group', GID])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/projects/${PID}`, {group_id: GID})
  })
})

describe('projects set-environments', () => {
  it('replaces the declared environments with the given codes', async () => {
    apiMock.put.mockResolvedValue(envelope([{code: 'production', label: 'Production'}]))
    const {stdout} = await runCaptured(ProjectsSetEnvironments, ['--project', PID, '--code', 'production'])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/environments`, {
      codes: ['production'],
      environment_ids: [],
    })
    expect(stdout).toContain('production — Production')
  })

  it('reports the empty case when no environments remain', async () => {
    apiMock.put.mockResolvedValue(envelope([]))
    const {stdout} = await runCaptured(ProjectsSetEnvironments, ['--project', PID])
    expect(stdout).toContain('declares no environments')
  })
})

describe('projects set-environment-capabilities', () => {
  it('sends only the provided capabilities to the env capabilities endpoint', async () => {
    apiMock.put.mockResolvedValue(envelope({environment_id: 'e1', uptime_override: false, uptime_enabled: false}))
    await runCaptured(ProjectsSetEnvironmentCapabilities, [
      '--project', PID, '--environment', 'production', '--uptime', 'off', '--secrets', 'inherit',
    ])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/environments/production/capabilities`, {
      uptime: 'off', secrets: 'inherit',
    })
  })

  it('encodes the environment ref (id) in the path and sends the single capability', async () => {
    apiMock.put.mockResolvedValue(envelope({environment_id: 'e1'}))
    await runCaptured(ProjectsSetEnvironmentCapabilities, ['--project', PID, '--environment', 'e1', '--servers', 'on'])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/environments/e1/capabilities`, {servers: 'on'})
  })

  it('exits non-zero on an API error', async () => {
    apiMock.put.mockRejectedValue(apiError(404, 'R404-SYSTEM-001', 'not found'))
    const {stderr} = await runExpectingExit(ProjectsSetEnvironmentCapabilities, [
      '--project', PID, '--environment', 'nope', '--uptime', 'off',
    ])
    expect(stderr).toContain('R404-SYSTEM-001')
  })
})

describe('projects set-platforms', () => {
  it('replaces the declared platforms with the given codes', async () => {
    apiMock.put.mockResolvedValue(envelope([{code: 'web', label: 'Web'}]))
    const {stdout} = await runCaptured(ProjectsSetPlatforms, ['--project', PID, '--code', 'web'])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/platforms`, {
      codes: ['web'],
      platform_ids: [],
    })
    expect(stdout).toContain('web — Web')
  })

  it('forwards --platform-id too', async () => {
    apiMock.put.mockResolvedValue(envelope([]))
    await runCaptured(ProjectsSetPlatforms, ['--project', PID, '--platform-id', 'plat-1'])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/platforms`, {
      codes: [],
      platform_ids: ['plat-1'],
    })
  })

  it('reports the empty case when no platforms remain', async () => {
    apiMock.put.mockResolvedValue(envelope([]))
    const {stdout} = await runCaptured(ProjectsSetPlatforms, ['--project', PID])
    expect(stdout).toContain('declares no platforms')
  })
})

describe('projects delete', () => {
  it('refuses without --confirm (exit 2, no api call)', async () => {
    const {message} = await runExpectingExit(ProjectsDelete, ['--project', PID], 2)
    expect(message).toContain('Refusing to delete')
    expect(apiMock.delete).not.toHaveBeenCalled()
  })

  it('deletes with --confirm', async () => {
    apiMock.delete.mockResolvedValue(envelope({}))
    const {result, stdout} = await runCaptured(ProjectsDelete, ['--project', PID, '--confirm'])
    expect(apiMock.delete).toHaveBeenCalledWith(`/cli/v1/projects/${PID}`)
    expect(stdout).toContain('Deleted project')
    expect((result as {deleted: string}).deleted).toBe(PID)
  })
})

describe('projects create / update — feature flags', () => {
  it('create maps --no-quick-bug-report-enabled into the body', async () => {
    apiMock.post.mockResolvedValue(envelope({id: 'p1'}))
    await runCaptured(ProjectsCreate, ['app', '--key', 'AP', '--no-quick-bug-report-enabled'])
    expect(apiMock.post).toHaveBeenCalledWith('/cli/v1/projects', {
      name: 'app', key: 'AP', quick_bug_report_enabled: false,
    })
  })

  it('update maps the feature flags without touching the untouched fields', async () => {
    apiMock.put.mockResolvedValue(envelope({key: 'DRRA'}))
    await runCaptured(ProjectsUpdate, ['--project', PID, '--quick-bug-report-enabled'])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/projects/${PID}`, {
      quick_bug_report_enabled: true,
    })
  })
})

describe('projects settings', () => {
  it('show fetches the settings record', async () => {
    apiMock.get.mockResolvedValue(envelope({project_id: PID, logs_retention_days: 30, analytics_enabled: true}))
    const {stdout} = await runCaptured(ProjectsSettingsShow, ['--project', PID])
    expect(apiMock.get).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/settings`)
    expect(stdout).toContain('Project settings')
  })

  it('show --json returns the envelope without readable output', async () => {
    apiMock.get.mockResolvedValue(envelope({project_id: PID}))
    const res = (await run(ProjectsSettingsShow, ['--project', PID, '--json'])) as {data: {project_id: string}}
    expect(res.data.project_id).toBe(PID)
  })

  it('update sends only the passed fields (retention + both flags)', async () => {
    apiMock.put.mockResolvedValue(envelope({project_id: PID}))
    const {stdout} = await runCaptured(ProjectsSettingsUpdate, [
      '--project', PID, '--logs-retention-days', '30', '--analytics-retention-days', '365',
      '--no-quick-bug-report-enabled', '--analytics-enabled',
    ])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/settings`, {
      logs_retention_days: 30,
      analytics_retention_days: 365,
      quick_bug_report_enabled: false,
      analytics_enabled: true,
    })
    expect(stdout).toContain('Project settings updated')
  })

  it('update with no fields sends an empty body', async () => {
    apiMock.put.mockResolvedValue(envelope({project_id: PID}))
    await runCaptured(ProjectsSettingsUpdate, ['--project', PID])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/settings`, {})
  })

  it('update --json returns the envelope', async () => {
    apiMock.put.mockResolvedValue(envelope({project_id: PID}))
    const res = (await run(ProjectsSettingsUpdate, ['--project', PID, '--analytics-enabled', '--json'])) as {
      data: {project_id: string}
    }
    expect(res.data.project_id).toBe(PID)
  })
})

describe('projects link-server / unlink-server', () => {
  it('link-server posts host_id + environment_id and prints the link', async () => {
    apiMock.post.mockResolvedValue(envelope({id: 'lnk-1', project_id: PID, host_id: 'h1', environment_id: 'e1'}))
    const {stdout} = await runCaptured(ProjectsLinkServer, [
      '--project', PID, '--host-id', 'h1', '--environment-id', 'e1',
    ])
    expect(apiMock.post).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/servers`, {
      host_id: 'h1', environment_id: 'e1',
    })
    expect(stdout).toContain('Server linked')
  })

  it('link-server --json returns the envelope', async () => {
    apiMock.post.mockResolvedValue(envelope({id: 'lnk-1'}))
    const res = (await run(ProjectsLinkServer, [
      '--project', PID, '--host-id', 'h1', '--environment-id', 'e1', '--json',
    ])) as {data: {id: string}}
    expect(res.data.id).toBe('lnk-1')
  })

  it('unlink-server refuses without --confirm (exit 2, no api call)', async () => {
    const {message} = await runExpectingExit(ProjectsUnlinkServer, ['lnk-1', '--project', PID], 2)
    expect(message).toContain('Refusing to unlink')
    expect(apiMock.delete).not.toHaveBeenCalled()
  })

  it('unlink-server deletes the link with --confirm', async () => {
    apiMock.delete.mockResolvedValue(envelope({}))
    const {result, stdout} = await runCaptured(ProjectsUnlinkServer, ['lnk-1', '--project', PID, '--confirm'])
    expect(apiMock.delete).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/servers/lnk-1`)
    expect(stdout).toContain('Unlinked server lnk-1')
    expect((result as {unlinked: string}).unlinked).toBe('lnk-1')
  })

  it('unlink-server --json with --confirm', async () => {
    apiMock.delete.mockResolvedValue(envelope({}))
    const res = (await run(ProjectsUnlinkServer, ['lnk-1', '--project', PID, '--confirm', '--json'])) as {
      unlinked: string
    }
    expect(res.unlinked).toBe('lnk-1')
  })
})

// Fallback `res.data ?? {}`: the backend may omit `data` → human-mode must still render without crashing.
describe('projects github', () => {
  it('show fetches the integration and flattens the repository block', async () => {
    apiMock.get.mockResolvedValue(
      envelope({
        project_id: PID,
        installed: true,
        connected: true,
        repository: {full_name: 'bussolabs/app', sync_enabled: true, sync_secrets: true},
      }),
    )
    const {stdout} = await runCaptured(ProjectsGithub, ['--project', PID])
    expect(apiMock.get).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/github`)
    expect(stdout).toContain('GitHub integration')
    expect(stdout).toContain('bussolabs/app')
    expect(stdout).toContain('sync_secrets')
  })

  it('show surfaces the secrets-sync state, including when disabled', async () => {
    apiMock.get.mockResolvedValue(
      envelope({
        project_id: PID,
        installed: true,
        connected: true,
        repository: {full_name: 'bussolabs/app', sync_secrets: false},
      }),
    )
    const {stdout} = await runCaptured(ProjectsGithub, ['--project', PID])
    expect(stdout).toContain('sync_secrets: false')
  })

  it('show renders a not-connected integration (repository null)', async () => {
    apiMock.get.mockResolvedValue(envelope({project_id: PID, installed: false, connected: false, repository: null}))
    const {stdout} = await runCaptured(ProjectsGithub, ['--project', PID])
    expect(stdout).toContain('connected')
  })

  it('show --json returns the envelope without readable output', async () => {
    apiMock.get.mockResolvedValue(envelope({project_id: PID, connected: false}))
    const res = (await run(ProjectsGithub, ['--project', PID, '--json'])) as {data: {project_id: string}}
    expect(res.data.project_id).toBe(PID)
  })

  it('update sends only the passed fields (all binding rules)', async () => {
    apiMock.put.mockResolvedValue(envelope({project_id: PID}))
    const {stdout} = await runCaptured(ProjectsGithubUpdate, [
      '--project', PID, '--default-branch', 'develop',
      '--production-environment-id', 'env-prod', '--staging-environment-id', 'env-stg',
      '--sync-enabled', '--no-tag-binding-enabled', '--autoclose-on-merge',
    ])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/github`, {
      default_branch: 'develop',
      production_environment_id: 'env-prod',
      staging_environment_id: 'env-stg',
      sync_enabled: true,
      tag_binding_enabled: false,
      autoclose_on_merge: true,
    })
    expect(stdout).toContain('GitHub integration updated')
  })

  it('update with no fields sends an empty body', async () => {
    apiMock.put.mockResolvedValue(envelope({project_id: PID}))
    await runCaptured(ProjectsGithubUpdate, ['--project', PID])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/github`, {})
  })

  it('update turns secrets sync on with --sync-secrets', async () => {
    apiMock.put.mockResolvedValue(envelope({project_id: PID}))
    await runCaptured(ProjectsGithubUpdate, ['--project', PID, '--sync-secrets'])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/github`, {sync_secrets: true})
  })

  it('update turns secrets sync off with --no-sync-secrets', async () => {
    apiMock.put.mockResolvedValue(envelope({project_id: PID}))
    await runCaptured(ProjectsGithubUpdate, ['--project', PID, '--no-sync-secrets'])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/github`, {sync_secrets: false})
  })

  it('update --json returns the envelope', async () => {
    apiMock.put.mockResolvedValue(envelope({project_id: PID}))
    const res = (await run(ProjectsGithubUpdate, ['--project', PID, '--sync-enabled', '--json'])) as {
      data: {project_id: string}
    }
    expect(res.data.project_id).toBe(PID)
  })

  it('show + update tolerate an envelope without data', async () => {
    apiMock.get.mockResolvedValue({})
    await expect(runCaptured(ProjectsGithub, ['--project', PID])).resolves.toBeTruthy()
    apiMock.put.mockResolvedValue({})
    await expect(runCaptured(ProjectsGithubUpdate, ['--project', PID, '--sync-enabled'])).resolves.toBeTruthy()
  })
})

describe('projects github-connect', () => {
  it('resolves the project and posts the repository full name', async () => {
    apiMock.post.mockResolvedValue(envelope({
      project_id: PID,
      repository: {full_name: 'bussolabs/closeyourit-agent', default_branch: 'main'},
    }))

    const {stdout} = await runCaptured(ProjectsGithubConnect, [
      '--project', PID, '--repository', 'bussolabs/closeyourit-agent',
    ])

    expect(apiMock.post).toHaveBeenCalledWith(`/cli/v1/projects/${PID}/github`, {
      full_name: 'bussolabs/closeyourit-agent',
    })
    expect(stdout).toContain('bussolabs/closeyourit-agent')
  })

  it('--json returns the server envelope', async () => {
    apiMock.post.mockResolvedValue(envelope({project_id: PID, connected: true}))
    const result = await run(ProjectsGithubConnect, [
      '-p', PID, '--repository', 'bussolabs/closeyourit-agent', '--json',
    ]) as {data: {connected: boolean}}
    expect(result.data.connected).toBe(true)
  })
})

describe('projects github-map', () => {
  const connected = {
    project_id: 'p1', project_key: 'CYRA', project_name: 'closeyourit-rails',
    repository: {full_name: 'bussolabs/closeyourit-rails', default_branch: 'main'},
  }
  const disconnected = {
    project_id: 'p2', project_key: 'PFRA', project_name: 'presentforme-rails', repository: null,
  }

  it('fetches every page and renders connected and disconnected projects', async () => {
    apiMock.get
      .mockResolvedValueOnce(envelope([connected], {page: 1, total_pages: 2, total: 2}))
      .mockResolvedValueOnce(envelope([disconnected], {page: 2, total_pages: 2, total: 2}))

    const {result, stdout} = await runCaptured(ProjectsGithubMap, [])

    expect(apiMock.get).toHaveBeenNthCalledWith(1, '/cli/v1/projects/github-map?page=1&per=100')
    expect(apiMock.get).toHaveBeenNthCalledWith(2, '/cli/v1/projects/github-map?page=2&per=100')
    expect(stdout).toContain('CYRA')
    expect(stdout).toContain('bussolabs/closeyourit-rails')
    expect(stdout).toContain('PFRA')
    expect((result as {data: unknown[]}).data).toHaveLength(2)
  })

  it('--connected-only forwards the filter and --json returns the aggregated envelope', async () => {
    apiMock.get.mockResolvedValueOnce(envelope([connected], {page: 1, total_pages: 1, total: 1}))

    const result = await run(ProjectsGithubMap, ['--connected-only', '--json']) as {
      data: Array<{project_key: string}>
      meta: {total: number}
    }

    expect(apiMock.get).toHaveBeenCalledWith('/cli/v1/projects/github-map?page=1&per=100&connected_only=true')
    expect(result.data[0].project_key).toBe('CYRA')
    expect(result.meta.total).toBe(1)
  })

  it('tolerates a missing envelope and renders sparse mappings safely', async () => {
    apiMock.get.mockResolvedValueOnce({})
    const empty = await runCaptured(ProjectsGithubMap, [])
    expect(empty.stdout).toContain('(no results)')

    apiMock.get.mockResolvedValueOnce(envelope([{project_id: 'sparse'}], {total_pages: 1}))
    const sparse = await runCaptured(ProjectsGithubMap, [])
    expect(sparse.stdout).toContain('no')
  })
})

describe('projects settings / link-server — envelope without data', () => {
  it('settings show + update tolerate an envelope without data', async () => {
    apiMock.get.mockResolvedValue({})
    await expect(runCaptured(ProjectsSettingsShow, ['--project', PID])).resolves.toBeTruthy()
    apiMock.put.mockResolvedValue({})
    await expect(runCaptured(ProjectsSettingsUpdate, ['--project', PID, '--analytics-enabled'])).resolves.toBeTruthy()
  })

  it('link-server tolerates an envelope without data', async () => {
    apiMock.post.mockResolvedValue({})
    await expect(
      runCaptured(ProjectsLinkServer, ['--project', PID, '--host-id', 'h1', '--environment-id', 'e1']),
    ).resolves.toBeTruthy()
  })
})
