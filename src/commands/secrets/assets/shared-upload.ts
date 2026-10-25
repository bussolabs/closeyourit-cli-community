import {readFile, stat} from 'node:fs/promises'
import {basename} from 'node:path'
import {Flags} from '@oclif/core'
import {BaseCommand} from '../../../base'

export default class SecretsAssetsSharedUpload extends BaseCommand {
  static description = 'Encrypt and upload one organization-level secret file'
  static flags = {file: Flags.string({required: true}), name: Flags.string({required: true}), environment: Flags.string(), description: Flags.string()}
  async run(): Promise<unknown> {
    const {flags} = await this.parse(SecretsAssetsSharedUpload)
    const info = await stat(flags.file).catch(() => undefined)
    if (!info?.isFile()) this.error(`File not found or unreadable: ${flags.file}`, {exit: 2})
    if (info.size > 10 * 1024 * 1024) this.error('Secret file exceeds 10 MiB', {exit: 2})
    const data = await readFile(flags.file)
    const res = await this.api.upload('POST', '/cli/v1/shared_secret_assets', [{field: 'file', filename: basename(flags.file), data: new Blob([data])}], {body: {name: flags.name, environment: flags.environment, description: flags.description}})
    if (!this.jsonEnabled()) this.log(`Encrypted and uploaded shared asset ${flags.name}`)
    return res
  }
}
