/** Read a whole stream (default: process.stdin) into a UTF-8 string for `secrets import`. */
export async function readStream(stream: AsyncIterable<Buffer | string> = process.stdin): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks).toString('utf8')
}
