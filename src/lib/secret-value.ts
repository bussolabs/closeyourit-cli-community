import {createInterface} from 'node:readline'
import {Writable} from 'node:stream'
import {readStream} from './stdin'

type Input = NodeJS.ReadableStream & {isTTY?: boolean}

/**
 * The value for a `set` command given only NAME. A value typed in the command line stays in shell
 * history and in the process list, so it comes from a hidden prompt on a terminal, or from stdin
 * when piped (`pbpaste | cyi secrets set NAME`).
 */
export async function readSecretValue(
  name: string,
  input: Input = process.stdin,
  output: NodeJS.WritableStream = process.stderr,
): Promise<string> {
  const value = input.isTTY
    ? await promptHidden(`Value for ${name} (hidden): `, input, output)
    : // `echo value |` adds a newline the user never meant as part of the secret.
      (await readStream(input)).replace(/\r?\n$/, '')
  if (value === '') throw new Error('No value entered')
  return value
}

async function promptHidden(question: string, input: Input, output: NodeJS.WritableStream): Promise<string> {
  output.write(question)
  // Readline echoes what is typed to its output: give it one that drops everything.
  const silent = new Writable({write: (_chunk, _encoding, done) => done()})
  const rl = createInterface({input, output: silent, terminal: true})
  try {
    return await new Promise<string>((resolve, reject) => {
      rl.on('line', resolve)
      rl.on('close', () => reject(new Error('No value entered')))
      rl.on('SIGINT', () => rl.close())
    })
  } finally {
    rl.close()
    output.write('\n')
  }
}
