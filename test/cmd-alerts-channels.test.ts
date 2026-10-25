import {beforeEach, describe, expect, it, vi} from 'vitest'
import {apiMock, resetApiMock} from './helpers/api-mock'
import {envelope, runCaptured, runExpectingExit} from './helpers/command'

vi.mock('../src/lib/api', async (io) => {
  const actual = await io<typeof import('../src/lib/api')>()
  const {apiMock} = await import('./helpers/api-mock')
  return {...actual, CliApi: vi.fn(function () { return apiMock })}
})
vi.mock('../src/lib/config', async (io) => {
  const actual = await io<typeof import('../src/lib/config')>()
  return {...actual, loadConfig: vi.fn(() => ({apiUrl: 'https://api.test', token: 'tok_test'}))}
})

import AlertsChannelsCreate from '../src/commands/alerts/channels/create'
import AlertsChannelsDelete from '../src/commands/alerts/channels/delete'
import AlertsChannelsList from '../src/commands/alerts/channels/list'
import AlertsCreate from '../src/commands/alerts/create'
import AlertsUpdate from '../src/commands/alerts/update'

const CHANNEL = 'ch-1'
const RULE = 'ar-1'

beforeEach(() => resetApiMock())

describe('alerts channels', () => {
  it('lists channels with target', async () => {
    apiMock.get.mockResolvedValue(
      envelope([{name: 'Ops TG', kind: 'telegram', target: 'chat -100777', enabled: true, id: CHANNEL}]),
    )
    const {stdout} = await runCaptured(AlertsChannelsList, [])
    expect(apiMock.get).toHaveBeenCalledWith('/cli/v1/alert_channels?page=1')
    expect(stdout).toContain('Ops TG')
    expect(stdout).toContain('chat -100777')
  })

  it('creates a telegram channel', async () => {
    apiMock.post.mockResolvedValue(envelope({id: CHANNEL, name: 'Ops TG', kind: 'telegram', target: 'chat -100777'}))
    const {stdout} = await runCaptured(AlertsChannelsCreate, [
      'Ops TG', '--kind', 'telegram', '--bot-token', '123:abc', '--chat-id', '-100777',
    ])
    expect(apiMock.post).toHaveBeenCalledWith('/cli/v1/alert_channels', {
      name: 'Ops TG',
      kind: 'telegram',
      telegram_bot_token: '123:abc',
      telegram_chat_id: '-100777',
    })
    expect(stdout).toContain('Channel created')
  })

  it('creates a webhook channel with secret', async () => {
    apiMock.post.mockResolvedValue(envelope({id: CHANNEL, kind: 'webhook'}))
    await runCaptured(AlertsChannelsCreate, [
      'Hook', '--kind', 'webhook', '--url', 'https://example.com/hook', '--secret', 's3',
    ])
    expect(apiMock.post).toHaveBeenCalledWith('/cli/v1/alert_channels', {
      name: 'Hook',
      kind: 'webhook',
      webhook_url: 'https://example.com/hook',
      webhook_secret: 's3',
    })
  })

  it('delete requires --confirm (exit 2, no call)', async () => {
    await runExpectingExit(AlertsChannelsDelete, [CHANNEL], 2)
    expect(apiMock.delete).not.toHaveBeenCalled()
  })

  it('deletes with --confirm', async () => {
    apiMock.delete.mockResolvedValue(undefined)
    const {stdout} = await runCaptured(AlertsChannelsDelete, [CHANNEL, '--confirm'])
    expect(apiMock.delete).toHaveBeenCalledWith(`/cli/v1/alert_channels/${CHANNEL}`)
    expect(stdout).toContain(`Deleted channel ${CHANNEL}`)
  })
})

describe('alerts rules — server events, threshold and channel', () => {
  it('create accepts server event type with threshold and channels', async () => {
    apiMock.post.mockResolvedValue(envelope({id: RULE}))
    await runCaptured(AlertsCreate, [
      'CPU alta', '--event-type', 'server_cpu', '--threshold', '90',
      '--channel', CHANNEL, '--channel', 'ch-2', '--throttle-minutes', '15',
    ])
    expect(apiMock.post).toHaveBeenCalledWith('/cli/v1/alert_rules', {
      name: 'CPU alta',
      event_type: 'server_cpu',
      threshold: 90,
      channel_ids: [CHANNEL, 'ch-2'],
      throttle_minutes: 15,
    })
  })

  it('update maps threshold and channels', async () => {
    apiMock.put.mockResolvedValue(envelope({id: RULE}))
    await runCaptured(AlertsUpdate, [RULE, '--threshold', '85', '--channel', CHANNEL])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/alert_rules/${RULE}`, {
      threshold: 85,
      channel_ids: [CHANNEL],
    })
  })
})
