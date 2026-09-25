const { statSync, readFileSync, createReadStream } = require('node:fs')
const { createHash } = require('node:crypto')
const path = require('node:path')
module.exports = async function beforePack(context) {
  if (context.electronPlatformName !== 'win32') return
  const dir = path.join(context.packager.projectDir, 'build/windows/whisper')
  for (const name of ['whisper-cli.exe', 'ggml-small.bin', 'manifest.json', 'whisper-LICENSE.txt', 'model-LICENSE.txt']) {
    if (!statSync(path.join(dir, name)).size) throw new Error(`Empty Windows resource: ${name}`)
  }
  const manifest = JSON.parse(readFileSync(path.join(dir, 'manifest.json'), 'utf8').replace(/^\uFEFF/, ''))
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path.join(dir, 'ggml-small.bin'))) hash.update(chunk)
  if (hash.digest('hex') !== manifest.modelSHA256) throw new Error('Windows Whisper model checksum mismatch')
}
