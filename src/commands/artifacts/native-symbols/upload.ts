import {Flags} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../../base'
import {renderRecord} from '../../../lib/output'
import {artifactFailure, artifactMetadata, artifactPath} from '../../../lib/source-map-artifacts'
import {NativeSymbolInputError, nativeSymbolUploadBody, readNativeSymbolFile, validateNativeSymbolIdentity} from '../../../lib/native-symbols'

export default class NativeSymbolsUpload extends BaseCommand {
  static description = 'Upload one private native debug file with exact build identity'
  static flags = {
    ...projectFlag,
    file: Flags.string({description: 'Explicit regular binary file; for dSYM, select its DWARF member', required: true}),
    format: Flags.string({description: 'Expected binary format', options: ['elf', 'macho', 'pe', 'pdb'], required: true}),
    architecture: Flags.string({description: 'Exact target architecture (for example arm64 or x86_64)', required: true}),
    'debug-id': Flags.string({description: 'Debug UUID, including hexadecimal age when present', required: true}),
    'code-id': Flags.string({description: 'Complete build code ID; required for ELF, omitted for PDB'}),
  }

  async run(): Promise<unknown> {
    const {flags} = await this.parse(NativeSymbolsUpload)
    try {
      const identity = {format: flags.format, architecture: flags.architecture, debugId: flags['debug-id'], codeId: flags['code-id']}
      validateNativeSymbolIdentity(identity)
      const body = nativeSymbolUploadBody(identity, await readNativeSymbolFile(flags.file))
      const project = await this.resolveProjectId(flags.project)
      const res = await this.api.post<Record<string, unknown>>(artifactPath(project, undefined, 'native_symbols'), body)
      const result = {...res, data: artifactMetadata(res.data)}
      if (!this.jsonEnabled()) this.log(renderRecord(result.data))
      return result
    } catch (error) {
      if (error instanceof NativeSymbolInputError) this.error(error.message, {exit: 2})
      artifactFailure(error, 'native symbol')
    }
  }
}
