import {hostname} from 'node:os'
import {createInterface} from 'node:readline/promises'
import {setTimeout as sleep} from 'node:timers/promises'
import {Flags} from '@oclif/core'
import {BaseCommand} from '../../base'
import {type Allowlist, type DeviceCall, perform, refusal} from '../../lib/puck-device'

interface Registration {
  id: string
  token: string
}

export default class PuckConnect extends BaseCommand {
  static description =
    'Let your Puckies use this computer: each request is shown here and runs only if you answer yes. Ctrl+C disconnects.'

  static examples = [
    '<%= config.bin %> puck connect --allow-dir .',
    '<%= config.bin %> puck connect --allow-dir ~/work/shop --allow-command "git status" --allow-command "npm test"',
  ]

  static flags = {
    'allow-dir': Flags.string({description: 'A folder the Puck may list and read (repeatable)', multiple: true, default: ['.']}),
    'allow-command': Flags.string({description: 'An exact command the Puck may ask to run (repeatable)', multiple: true, default: []}),
    name: Flags.string({description: 'How this computer appears on CloseYourIt', default: hostname()}),
    'max-idle': Flags.integer({description: 'Seconds between checks for new requests', default: 2, hidden: true}),
    polls: Flags.integer({description: 'Stop after this many checks (0 = until Ctrl+C)', default: 0, hidden: true}),
  }

  private stopped = false

  async run(): Promise<void> {
    const {flags} = await this.parse(PuckConnect)
    const allow: Allowlist = {dirs: flags['allow-dir'], commands: flags['allow-command']}
    const device = (await this.api.post<Registration>('/cli/v1/coworkers/devices', {name: flags.name})).data
    const disconnect = async (): Promise<void> => {
      this.stopped = true
      await this.api.delete(`/cli/v1/coworkers/devices/${device.id}`, {body: {device_token: device.token}}).catch(() => undefined)
    }

    process.once('SIGINT', () => void disconnect().then(() => process.exit(0)))
    this.log(`Connected as "${flags.name}". Your Puckies can ask to use this computer; nothing runs without your yes.`)
    this.log(`Allowed folders: ${allow.dirs.join(', ')}. Allowed commands: ${allow.commands.join(', ') || 'none'}. Ctrl+C disconnects.`)

    for (let checks = 1; !this.stopped; checks++) {
      const call = (await this.api.post<DeviceCall | null>(`/cli/v1/coworkers/devices/${device.id}/poll`, {device_token: device.token})).data
      if (call) await this.handle(device, call, allow)
      else await sleep(flags['max-idle'] * 1000)
      if (flags.polls > 0 && checks >= flags.polls) await disconnect()
    }
  }

  private async handle(device: Registration, call: DeviceCall, allow: Allowlist): Promise<void> {
    this.log(`\nPuck "${call.puck}" wants to ${call.tool.replace('_', ' ')}: ${call.value}`)
    const refused = await refusal(call, allow)
    if (refused) {
      this.log(`Refused: ${refused}`)
      return this.answer(device, call, {allowed: false, output: refused})
    }

    if (!(await this.confirm())) return this.answer(device, call, {allowed: false})

    try {
      return this.answer(device, call, {allowed: true, output: await perform(call, allow)})
    } catch (error) {
      return this.answer(device, call, {allowed: true, failed: true, output: (error as Error).message})
    }
  }

  private async confirm(): Promise<boolean> {
    const prompt = createInterface({input: process.stdin, output: process.stdout})
    try {
      return /^(y|yes|s|si|sì)$/i.test((await prompt.question('Allow? [y/N] ')).trim())
    } finally {
      prompt.close()
    }
  }

  private async answer(device: Registration, call: DeviceCall, body: {allowed: boolean; output?: string; failed?: boolean}): Promise<void> {
    await this.api.post(`/cli/v1/coworkers/devices/${device.id}/calls/${call.id}`, {device_token: device.token, ...body})
  }
}
